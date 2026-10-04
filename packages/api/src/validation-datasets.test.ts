import { describe, expect, it } from "vitest";

import {
  ValidationDatasetCreateRequestSchema,
  ValidationDatasetVersionUploadRequestSchema,
} from "./validation-datasets";

describe("validation dataset request schemas", () => {
  it("requires a source and license declaration when registering a dataset", () => {
    expect(
      ValidationDatasetCreateRequestSchema.safeParse({
        name: "Flores",
        source: "Colección de tesis",
        license: "CC BY 4.0",
      }).success,
    ).toBe(true);

    expect(
      ValidationDatasetCreateRequestSchema.safeParse({ name: "Flores", source: " ", license: "" }).success,
    ).toBe(false);
  });

  it("accepts only strict SemVer and safe partition identifiers", () => {
    expect(
      ValidationDatasetVersionUploadRequestSchema.safeParse({
        version: "1.0.0",
        partition: "móvil-1",
      }).success,
    ).toBe(false);
    expect(
      ValidationDatasetVersionUploadRequestSchema.safeParse({
        version: "01.0.0",
        partition: "test",
      }).success,
    ).toBe(false);
    expect(
      ValidationDatasetVersionUploadRequestSchema.safeParse({
        version: "1.0.0",
        partition: "test_1-a.b",
      }).success,
    ).toBe(true);
    expect(
      ValidationDatasetVersionUploadRequestSchema.safeParse({
        version: "1.0.0",
        partition: "../test",
      }).success,
    ).toBe(false);
    expect(
      ValidationDatasetVersionUploadRequestSchema.safeParse({
        version: "1.0.0",
        partition: "x".repeat(65),
      }).success,
    ).toBe(false);
  });
});
