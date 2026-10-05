import { describe, expect, it } from "vitest";

import { isDetectionTensorRolesCompatible } from "./tflite-contract-validator";

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
