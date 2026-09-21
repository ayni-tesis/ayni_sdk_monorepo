import { describe, expect, it, vi } from "vitest";
import { deleteFile, uploadFile } from "./lib/storage";

import {
  buildModelVersionStorageKey,
  ModelVersionAlreadyStoredError,
  r2ModelVersionStorage,
} from "./model-version-storage";

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
  it("uploads the bytes untouched, as opaque octet-stream, create-only", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await r2ModelVersionStorage.putArtifact("some/key.tflite", bytes);

    expect(uploadFile).toHaveBeenCalledWith("some/key.tflite", bytes, {
      contentType: "application/octet-stream",
      onlyIfNotExists: true,
    });
  });

  it("translates a 412 precondition failure into ModelVersionAlreadyStoredError", async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(
      Object.assign(
        new Error("The prefix or conditional headers provided is not currently supported by R2."),
        {
          name: "PreconditionFailed",
        },
      ),
    );

    await expect(
      r2ModelVersionStorage.putArtifact("some/key.tflite", new Uint8Array([1])),
    ).rejects.toBeInstanceOf(ModelVersionAlreadyStoredError);
  });

  it("keeps other upload errors as-is", async () => {
    const networkError = new Error("r2 unavailable");
    vi.mocked(uploadFile).mockRejectedValueOnce(networkError);

    await expect(
      r2ModelVersionStorage.putArtifact("some/key.tflite", new Uint8Array([1])),
    ).rejects.toBe(networkError);
  });

  it("deletes the object for compensation", async () => {
    await r2ModelVersionStorage.removeArtifact("some/key.tflite");
    expect(deleteFile).toHaveBeenCalledWith("some/key.tflite");
  });
});
