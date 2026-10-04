import {
  deleteFile,
  downloadFileAsBuffer,
  getDownloadUrl,
  getFileMetadata,
  getUploadUrl,
  uploadFile,
} from "./lib/storage";

import type { ValidationDatasetStorage } from "./validation-dataset-store";

export type ValidationDatasetRouteStorage = Pick<
  ValidationDatasetStorage,
  "createUploadUrl" | "getArtifact" | "getArtifactSize" | "removeArtifact"
>;

export class ValidationDatasetAlreadyStoredError extends Error {
  constructor(key: string) {
    super(`Validation dataset artifact already exists: ${key}`);
    this.name = "ValidationDatasetAlreadyStoredError";
  }
}

function isPreconditionFailed(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === "PreconditionFailed" || candidate.$metadata?.httpStatusCode === 412;
}

export const r2ValidationDatasetStorage: ValidationDatasetStorage = {
  async putArtifact(key, bytes) {
    try {
      await uploadFile(key, bytes, {
        contentType: "application/zip",
        onlyIfNotExists: true,
      });
    } catch (error) {
      if (isPreconditionFailed(error)) throw new ValidationDatasetAlreadyStoredError(key);
      throw error;
    }
  },
  async getArtifact(key) {
    return new Uint8Array(await downloadFileAsBuffer(key));
  },
  async getArtifactSize(key) {
    return (await getFileMetadata(key))?.contentLength ?? null;
  },
  async createUploadUrl(key, expiresIn) {
    return getUploadUrl(key, { expiresIn, contentType: "application/zip" });
  },
  async removeArtifact(key) {
    await deleteFile(key);
  },
  async createDownloadUrl(key, expiresIn) {
    return getDownloadUrl(key, { expiresIn });
  },
};
