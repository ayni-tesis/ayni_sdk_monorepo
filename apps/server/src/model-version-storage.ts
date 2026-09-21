import { deleteFile, uploadFile } from "./lib/storage";

export type ModelVersionStorage = {
  putArtifact(key: string, bytes: Uint8Array): Promise<void>;
  removeArtifact(key: string): Promise<void>;
};

export function buildModelVersionStorageKey(input: {
  applicationId: string;
  modelId: string;
  version: string;
}): string {
  return `applications/${input.applicationId}/models/${input.modelId}/versions/${input.version}.tflite`;
}

export const r2ModelVersionStorage: ModelVersionStorage = {
  async putArtifact(key, bytes) {
    await uploadFile(key, bytes, { contentType: "application/octet-stream" });
  },
  async removeArtifact(key) {
    await deleteFile(key);
  },
};
