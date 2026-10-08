import { copyFile, deleteFile, downloadFile, getUploadUrl } from "./lib/storage";
import type { SdkTraceArtifactStorage } from "./sdk-trace-artifact-store";

export const r2SdkTraceArtifactStorage: SdkTraceArtifactStorage = {
  async createUploadUrl(key, contentLength, expiresIn) {
    return getUploadUrl(key, {
      expiresIn,
      contentType: "application/octet-stream",
      contentLength,
    });
  },
  async downloadFile(key) {
    const object = await downloadFile(key);
    return {
      body: object.body as ReadableStream<Uint8Array> | null,
      contentLength: object.contentLength,
      etag: object.etag,
    };
  },
  async copyFile(sourceKey, destinationKey, sourceETag) {
    await copyFile(sourceKey, destinationKey, { sourceETag });
  },
  async getArtifact(key) {
    const object = await downloadFile(key);
    return {
      body: object.body as ReadableStream<Uint8Array> | null,
      contentLength: object.contentLength,
    };
  },
  removeArtifact(key) {
    return deleteFile(key);
  },
};
