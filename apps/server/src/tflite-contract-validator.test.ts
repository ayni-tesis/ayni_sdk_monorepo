import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isDetectionTensorRolesCompatible,
  isSegmentationOutputCompatible,
  isTfliteContractCompatible,
  MAX_SEGMENTATION_PIXELS,
} from "./tflite-contract-validator";

// One 1×1 convolution from [1, H, W, 3] to [1, H, W, 3], converted with TensorFlow 2.19:
// a fixed 4×4 model and one whose height and width are dynamic (shape_signature -1).
const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./test-fixtures/${name}`, import.meta.url)));

describe("isTfliteContractCompatible with a segmentation contract (US-158)", () => {
  const contract = (labels: string[]) => ({
    input: {
      type: "image" as const,
      width: 4 as number,
      height: 4 as number,
      channels: 3 as const,
      normalization: "none" as const,
    },
    output: { type: "segmentation" as const, labels, scoreType: "logits" as const },
  });

  it("accepts a real model whose output has one channel per label", () => {
    expect(
      isTfliteContractCompatible(fixture("segmentation-4x4x3.tflite"), contract(["a", "b", "c"])),
    ).toBe(true);
  });

  it("rejects a label count that differs from the channels", () => {
    expect(
      isTfliteContractCompatible(fixture("segmentation-4x4x3.tflite"), contract(["a", "b"])),
    ).toBe(false);
  });

  it("rejects a model with a dynamic height and width", () => {
    // The FlatBuffer stores the dynamic shape as [1, 1, 1, 3], so a 1 × 1 input
    // matches and only the -1 of its shape_signature can reject the contract.
    const oneByOne = contract(["a", "b", "c"]);
    oneByOne.input.width = 1;
    oneByOne.input.height = 1;
    expect(isTfliteContractCompatible(fixture("segmentation-dynamic-3.tflite"), oneByOne)).toBe(
      false,
    );
  });
});

describe("isSegmentationOutputCompatible", () => {
  const float32 = (shape: number[]) => ({ shape, type: 0 });

  it("accepts one float32 [1, H, W, C] output with a channel per label", () => {
    expect(isSegmentationOutputCompatible([float32([1, 257, 257, 21])], 21)).toBe(true);
  });

  it.each([
    { name: "fewer channels than labels", outputs: [float32([1, 257, 257, 20])] },
    { name: "a mask without channels", outputs: [float32([1, 257, 257])] },
    { name: "a batch of two", outputs: [float32([2, 257, 257, 21])] },
    { name: "two outputs", outputs: [float32([1, 257, 257, 21]), float32([1, 21])] },
    { name: "an int32 output", outputs: [{ shape: [1, 257, 257, 21], type: 2 }] },
    { name: "no outputs", outputs: [] },
  ])("rejects $name", ({ outputs }) => {
    expect(isSegmentationOutputCompatible(outputs, 21)).toBe(false);
  });

  it("rejects masks larger than the pixel limit", () => {
    expect(MAX_SEGMENTATION_PIXELS).toBe(1024 * 1024);
    expect(isSegmentationOutputCompatible([float32([1, 1024, 1024, 2])], 2)).toBe(true);
    expect(isSegmentationOutputCompatible([float32([1, 1025, 1024, 2])], 2)).toBe(false);
  });
});

describe("isDetectionTensorRolesCompatible", () => {
  const reorderedTensorIndices = { boxes: 2, classes: 0, scores: 3, count: 1 };

  it("validates an SSD output map against each declared output index", () => {
    const outputShapes = [[1, 10], [1], [1, 10, 4], [1, 10]];

    expect(isDetectionTensorRolesCompatible(outputShapes, reorderedTensorIndices)).toBe(true);
  });

  it.each([
    { outputShapes: [[1, 10], [1], [1, 10, 3], [1, 10]] },
    {
      outputShapes: [
        [1, 10],
        [1, 1, 1],
        [1, 10, 4],
        [1, 10],
      ],
    },
    { outputShapes: [[1, 10], [1], [1, 10, 4]] },
    { outputShapes: [[1, 10], [1], [1, 10, 4], [1, 9]] },
  ])("rejects output shape/count mismatch $outputShapes", ({ outputShapes }) => {
    expect(isDetectionTensorRolesCompatible(outputShapes, reorderedTensorIndices)).toBe(false);
  });

  it("rejects repeated indexes even when all selected shapes happen to match", () => {
    const outputShapes = [[1, 10], [1], [1, 10, 4], [1, 10]];

    expect(
      isDetectionTensorRolesCompatible(outputShapes, {
        boxes: 2,
        classes: 0,
        scores: 0,
        count: 1,
      }),
    ).toBe(false);
  });
});
