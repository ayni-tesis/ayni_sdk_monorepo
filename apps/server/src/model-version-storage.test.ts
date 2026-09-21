import { describe, expect, it, vi } from "vitest";
import { deleteFile, uploadFile } from "./lib/storage";

import { buildModelVersionStorageKey, r2ModelVersionStorage } from "./model-version-storage";

vi.mock("./lib/storage", () => ({
  uploadFile: vi.fn(async () => ({ key: "k" })),
  deleteFile: vi.fn(async () => undefined),
}));

describe("buildModelVersionStorageKey", () => {
  it("follows the applications/{applicationId}/models/{modelId}/versions/{version}.tflite layout", () => {
    expect(
      buildModelVersionStorageKey({
        applicationId: "app-1",
        modelId: "model-1",
        version: "1.2.3",
      }),
    ).toBe("applications/app-1/models/model-1/versions/1.2.3.tflite");
  });
});

describe("r2ModelVersionStorage", () => {
  it("uploads the bytes untouched as an opaque octet-stream", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await r2ModelVersionStorage.putArtifact("some/key.tflite", bytes);

    expect(uploadFile).toHaveBeenCalledWith("some/key.tflite", bytes, {
      contentType: "application/octet-stream",
    });
  });

  it("deletes the object for compensation", async () => {
    await r2ModelVersionStorage.removeArtifact("some/key.tflite");
    expect(deleteFile).toHaveBeenCalledWith("some/key.tflite");
  });
});
