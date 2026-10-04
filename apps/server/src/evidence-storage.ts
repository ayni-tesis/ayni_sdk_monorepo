import { EVIDENCE_IMAGE_MEDIA_TYPE } from "@ayni/api/sdk-evidence";
import {
  deleteFile,
  downloadFileAsBuffer,
  getFileMetadata,
  getUploadUrl,
  uploadFile,
} from "./lib/storage";
import type { EvidenceStorage } from "./sdk-evidence-store";

/**
 * Evidence images in R2 (US-070). The SDK uploads each one with a signed `PUT`
 * whose `Content-Type` must be `image/jpeg`, so it never sends the image
 * through a server function, whose request body is limited.
 */
export const r2EvidenceStorage: EvidenceStorage = {
  createUploadUrl: (key, expiresIn) =>
    getUploadUrl(key, { expiresIn, contentType: EVIDENCE_IMAGE_MEDIA_TYPE }),
  async getSize(key) {
    return (await getFileMetadata(key))?.contentLength ?? null;
  },
  async read(key) {
    return new Uint8Array(await downloadFileAsBuffer(key));
  },
  async write(key, bytes) {
    await uploadFile(key, bytes, { contentType: EVIDENCE_IMAGE_MEDIA_TYPE });
  },
  remove: deleteFile,
};
