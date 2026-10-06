import type { ModelVersionContract } from "@ayni/db/schema/index";

/**
 * A tensor as the FlatBuffer stores it. `shapeSignature` keeps -1 for each
 * dynamic dimension, which `shape` stores as 1; it is empty when absent.
 */
export type Tensor = { shape: number[]; type: number; shapeSignature?: number[] };
type DetectionTensorIndices = { boxes: number; classes: number; scores: number; count: number };

export function isDetectionTensorRolesCompatible(
  outputShapes: readonly number[][],
  tensorIndices: DetectionTensorIndices,
): boolean {
  const indexes = Object.values(tensorIndices);
  if (
    outputShapes.length !== 4 ||
    indexes.some((index) => !Number.isInteger(index) || index < 0 || index > 3) ||
    new Set(indexes).size !== 4
  ) {
    return false;
  }

  const boxes = outputShapes[tensorIndices.boxes];
  const classes = outputShapes[tensorIndices.classes];
  const scores = outputShapes[tensorIndices.scores];
  const count = outputShapes[tensorIndices.count];
  return (
    boxes?.length === 3 &&
    boxes[0] === 1 &&
    boxes[1] !== undefined &&
    boxes[1] > 0 &&
    boxes[2] === 4 &&
    classes?.length === 2 &&
    classes[0] === 1 &&
    classes[1] === boxes[1] &&
    scores?.length === 2 &&
    scores[0] === 1 &&
    scores[1] === boxes[1] &&
    ((count?.length === 1 && count[0] === 1) ||
      (count?.length === 2 && count[0] === 1 && count[1] === 1))
  );
}

/** Largest segmentation mask (height × width) the SDK decodes on a phone (US-158). */
export const MAX_SEGMENTATION_PIXELS = 1_048_576;

/** Largest segmentation tensor (height × width × labels): 16,777,216 float32 values, about 64 MB. */
export const MAX_SEGMENTATION_VALUES = 16_777_216;

const FLOAT32 = 0;

/**
 * A segmentation model must have one float32 output shaped [1, H, W, C], with
 * one channel per label, at most [MAX_SEGMENTATION_PIXELS] pixels and at most
 * [MAX_SEGMENTATION_VALUES] values.
 */
export function isSegmentationOutputCompatible(
  outputs: readonly Tensor[],
  labelCount: number,
): boolean {
  const [output] = outputs;
  if (outputs.length !== 1 || !output || output.type !== FLOAT32) return false;
  const [batch, height, width, channels] = output.shape;
  // A dynamic height or width stores 1 in `shape` and -1 in its signature: the
  // mask size is unknown until the model runs, so the contract cannot fix it.
  const [, signatureHeight, signatureWidth] = output.shapeSignature ?? [];
  if ((signatureHeight ?? 1) < 1 || (signatureWidth ?? 1) < 1) return false;
  return (
    output.shape.length === 4 &&
    batch === 1 &&
    height !== undefined &&
    width !== undefined &&
    height > 0 &&
    width > 0 &&
    height * width <= MAX_SEGMENTATION_PIXELS &&
    channels === labelCount &&
    height * width * channels <= MAX_SEGMENTATION_VALUES
  );
}

class FlatbufferReader {
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private check(offset: number, size: number): void {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > this.bytes.length) {
      throw new Error("Invalid TensorFlow Lite FlatBuffer offset");
    }
  }

  private u16(offset: number): number {
    this.check(offset, 2);
    return this.view.getUint16(offset, true);
  }

  private u8(offset: number): number {
    this.check(offset, 1);
    return this.view.getUint8(offset);
  }

  private u32(offset: number): number {
    this.check(offset, 4);
    return this.view.getUint32(offset, true);
  }

  private i32(offset: number): number {
    this.check(offset, 4);
    return this.view.getInt32(offset, true);
  }

  private field(table: number, index: number): number {
    const vtable = table - this.i32(table);
    const size = this.u16(vtable);
    const entry = vtable + 4 + index * 2;
    if (entry + 2 > vtable + size) return 0;
    const offset = this.u16(entry);
    return offset ? table + offset : 0;
  }

  private vector(field: number): { start: number; length: number } | null {
    if (!field) return null;
    const start = field + this.u32(field);
    const length = this.u32(start);
    this.check(start + 4, length * 4);
    return { start: start + 4, length };
  }

  private tableAt(vector: { start: number; length: number }, index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= vector.length) {
      throw new Error("Invalid TensorFlow Lite vector index");
    }
    const offset = vector.start + index * 4;
    return offset + this.u32(offset);
  }

  private intVector(field: number): number[] {
    const vector = this.vector(field);
    if (!vector) return [];
    return Array.from({ length: vector.length }, (_, index) => this.i32(vector.start + index * 4));
  }

  private tensor(table: number): Tensor {
    const shape = this.intVector(this.field(table, 0));
    const typeField = this.field(table, 1);
    const type = typeField ? this.u8(typeField) : 0;
    if (shape.some((dimension) => dimension < 1)) throw new Error("Dynamic tensor shape");
    // Field 7 of the TFLite schema's Tensor table is `shape_signature`.
    const shapeSignature = this.intVector(this.field(table, 7));
    return { shape, type, shapeSignature };
  }

  readMainSubgraph(): { inputs: Tensor[]; outputs: Tensor[] } {
    const root = this.u32(0);
    const model = root;
    const subgraphs = this.vector(this.field(model, 2));
    if (!subgraphs?.length) throw new Error("Missing TensorFlow Lite subgraph");
    const subgraph = this.tableAt(subgraphs, 0);
    const tensors = this.vector(this.field(subgraph, 0));
    if (!tensors) throw new Error("Missing TensorFlow Lite tensors");
    const resolve = (slot: number) =>
      this.intVector(this.field(subgraph, slot)).map((index) => {
        if (index < 0) throw new Error("Invalid TensorFlow Lite tensor index");
        return this.tensor(this.tableAt(tensors, index));
      });
    return { inputs: resolve(1), outputs: resolve(2) };
  }
}

const numericTensorTypes = new Set([0, 2, 3, 4, 7, 9, 10, 16, 17, 18]);

export function isTfliteContractCompatible(
  bytes: Uint8Array,
  contract: ModelVersionContract,
): boolean {
  try {
    const { inputs, outputs } = new FlatbufferReader(bytes).readMainSubgraph();
    if (inputs.length !== 1 || outputs.length === 0) return false;
    const [input] = inputs;
    if (!input || ![0, 3, 9].includes(input.type)) return false;
    const shapeMatches =
      (input.shape.length === 4 &&
        input.shape[0] === 1 &&
        input.shape[1] === contract.input.height &&
        input.shape[2] === contract.input.width &&
        input.shape[3] === contract.input.channels) ||
      (input.shape.length === 3 &&
        input.shape[0] === contract.input.height &&
        input.shape[1] === contract.input.width &&
        input.shape[2] === contract.input.channels);
    if (!shapeMatches || outputs.some((tensor) => !numericTensorTypes.has(tensor.type)))
      return false;

    if (contract.output.type === "classification") {
      const output = outputs[0];
      return (
        outputs.length === 1 &&
        output !== undefined &&
        output.shape.at(-1) === contract.output.labels.length &&
        output.shape.length <= 2
      );
    }

    if (contract.output.type === "segmentation") {
      return isSegmentationOutputCompatible(outputs, contract.output.labels.length);
    }

    if (contract.output.tensorIndices) {
      return isDetectionTensorRolesCompatible(
        outputs.map((tensor) => tensor.shape),
        contract.output.tensorIndices,
      );
    }

    // ponytail: legacy four-output SSD signature only; add formats when a supported model requires them.
    const boxes = outputs.find(
      (tensor) =>
        tensor.shape.length === 3 &&
        tensor.shape[0] === 1 &&
        tensor.shape[1] !== undefined &&
        tensor.shape[1] > 0 &&
        tensor.shape[2] === 4,
    );
    if (!boxes) return false;
    const perDetection = outputs.filter(
      (tensor) =>
        tensor !== boxes &&
        tensor.shape.length === 2 &&
        tensor.shape[0] === 1 &&
        tensor.shape[1] === boxes.shape[1],
    );
    return (
      outputs.length === 4 &&
      perDetection.length === 2 &&
      outputs.some(
        (tensor) => tensor !== boxes && tensor.shape.length === 1 && tensor.shape[0] === 1,
      )
    );
  } catch {
    return false;
  }
}
