import { deleteFile, downloadFileAsBuffer, getDownloadUrl, uploadFile } from "./lib/storage";

export type ModelVersionStorage = {
  putArtifact(key: string, bytes: Uint8Array): Promise<void>;
  getArtifact(key: string): Promise<Uint8Array>;
  removeArtifact(key: string): Promise<void>;
  createDownloadUrl(key: string, expiresIn: number): Promise<string>;
};

/**
 * La subida condicional (`If-None-Match: *`) fue rechazada porque ya existe
 * un objeto en la clave: la versión publicada NUNCA se sobrescribe.
 */
export class ModelVersionAlreadyStoredError extends Error {
  constructor(key: string) {
    super(`Model version artifact already exists: ${key}`);
    this.name = "ModelVersionAlreadyStoredError";
  }
}

function isPreconditionFailed(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (candidate.name === "PreconditionFailed") return true;
  return candidate.$metadata?.httpStatusCode === 412;
}

export function buildModelVersionStorageKey(input: {
  applicationId: string;
  modelId: string;
  version: string;
}): string {
  return `applications/${input.applicationId}/models/${input.modelId}/versions/${input.version}.tflite`;
}

export const r2ModelVersionStorage: ModelVersionStorage = {
  async putArtifact(key, bytes) {
    try {
      await uploadFile(key, bytes, {
        contentType: "application/octet-stream",
        onlyIfNotExists: true,
      });
    } catch (error) {
      if (isPreconditionFailed(error)) throw new ModelVersionAlreadyStoredError(key);
      throw error;
    }
  },
  async removeArtifact(key) {
    await deleteFile(key);
  },
  async getArtifact(key) {
    return new Uint8Array(await downloadFileAsBuffer(key));
  },
  async createDownloadUrl(key, expiresIn) {
    return getDownloadUrl(key, { expiresIn });
  },
};
