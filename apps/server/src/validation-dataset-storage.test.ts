import { describe, expect, it, vi } from "vitest";

import {
  deleteFile,
  downloadFileAsBuffer,
  getDownloadUrl,
  getFileMetadata,
  getUploadUrl,
  uploadFile,
} from "./lib/storage";
import {
  r2ValidationDatasetStorage,
  ValidationDatasetAlreadyStoredError,
} from "./validation-dataset-storage";

vi.mock("./lib/storage", () => ({
  deleteFile: vi.fn(async () => undefined),
  downloadFileAsBuffer: vi.fn(async () => Buffer.from([1, 2, 3])),
  getDownloadUrl: vi.fn(async () => "https://signed.example/dataset"),
  getFileMetadata: vi.fn(async () => ({ contentLength: 3 })),
  getUploadUrl: vi.fn(async () => "https://signed.example/upload"),
  uploadFile: vi.fn(async () => ({ key: "private-key" })),
}));

describe("r2ValidationDatasetStorage", () => {
  it("uploads immutable ZIP bytes as application/zip", async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    await r2ValidationDatasetStorage.putArtifact("private/dataset.zip", bytes);

    expect(uploadFile).toHaveBeenCalledWith("private/dataset.zip", bytes, {
      contentType: "application/zip",
      onlyIfNotExists: true,
    });
  });

  it("rejects an attempt to overwrite an existing ZIP object", async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(
      Object.assign(new Error("Already exists"), { name: "PreconditionFailed" }),
    );

    await expect(
      r2ValidationDatasetStorage.putArtifact("private/dataset.zip", new Uint8Array([1])),
    ).rejects.toBeInstanceOf(ValidationDatasetAlreadyStoredError);
  });

  it("signs a PUT with the ZIP content type and requested expiry", async () => {
    await expect(
      r2ValidationDatasetStorage.createUploadUrl("staging/upload.zip", 900),
    ).resolves.toBe("https://signed.example/upload");
    expect(getUploadUrl).toHaveBeenCalledWith("staging/upload.zip", {
      expiresIn: 900,
      contentType: "application/zip",
    });
  });

  it("reads, sizes, and removes private objects through the shared R2 adapter", async () => {
    await expect(r2ValidationDatasetStorage.getArtifact("private/dataset.zip")).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(r2ValidationDatasetStorage.getArtifactSize("private/dataset.zip")).resolves.toBe(
      3,
    );
    await r2ValidationDatasetStorage.removeArtifact("staging/upload.zip");
    expect(downloadFileAsBuffer).toHaveBeenCalledWith("private/dataset.zip");
    expect(getFileMetadata).toHaveBeenCalledWith("private/dataset.zip");
    expect(deleteFile).toHaveBeenCalledWith("staging/upload.zip");
  });

  it("signs a private download URL only for the requested short lifetime", async () => {
    await expect(
      r2ValidationDatasetStorage.createDownloadUrl("private/dataset.zip", 900),
    ).resolves.toBe("https://signed.example/dataset");
    expect(getDownloadUrl).toHaveBeenCalledWith("private/dataset.zip", { expiresIn: 900 });
  });
});
