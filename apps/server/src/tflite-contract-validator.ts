import type { ModelVersionContract } from "@ayni/db/schema/index";

type Tensor = { shape: number[]; type: number };

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
    return { shape, type };
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

    return outputs.length === 4 && outputs.some((tensor) => tensor.shape.at(-1) === 4);
  } catch {
    return false;
  }
}
