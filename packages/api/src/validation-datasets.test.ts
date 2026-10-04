import { describe, expect, it } from "vitest";

import {
  ValidationDatasetCreateRequestSchema,
  ValidationDatasetVersionUploadRequestSchema,
  ValidationDatasetCancelRequestSchema,
  SdkValidationDatasetManifestSchema,
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

  it("accepts only a UUID for staging cancellation", () => {
    expect(
      ValidationDatasetCancelRequestSchema.safeParse({
        uploadId: "5a50fbab-a999-4c20-b190-2c2fb7e5b98e",
      }).success,
    ).toBe(true);
    expect(ValidationDatasetCancelRequestSchema.safeParse({ uploadId: "../../other-app.zip" }).success).toBe(
      false,
    );
  });
});

it("describes the private SDK download manifest without exposing a storage key", () => {
  const result = SdkValidationDatasetManifestSchema.safeParse({
    manifest: {
      datasetVersionId: "dataset-version-1",
      datasetId: "dataset-1",
      version: "1.0.0",
      partition: "validation",
      source: "Colección de tesis",
      license: "CC BY 4.0",
      sha256: "a".repeat(64),
      sizeBytes: 42,
      downloadUrl: "https://signed.example/private-dataset",
      downloadUrlExpiresAt: "2026-10-04T12:15:00.000Z",
    },
  });

  expect(result.success).toBe(true);
  if (result.success) {
    expect(JSON.stringify(result.data)).not.toContain("storageKey");
  }
});
