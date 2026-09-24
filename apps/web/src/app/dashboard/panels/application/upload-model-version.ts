import { env } from "@ayni/env/web";
import axios from "axios";

export type ModelVersionDto = {
  id: string;
  modelId: string;
  version: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  uploadedById: string | null;
};

export type ModelVersionUploadResult =
  | { ok: true; modelVersion: ModelVersionDto }
  | { ok: false; code: string; message: string };

export const MODEL_VERSION_UPLOAD_CANCELED = "canceled";

export const MODEL_VERSION_UPLOAD_FALLBACK_MESSAGE =
  "No se pudo guardar la versión del modelo. Inténtalo de nuevo.";

export async function uploadModelVersion(input: {
  applicationId: string;
  modelId: string;
  version: string;
  file: File;
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<ModelVersionUploadResult> {
  try {
    const baseUrl = `${env.NEXT_PUBLIC_SERVER_URL}/applications/${input.applicationId}/models/${input.modelId}/versions`;
    const { data: upload } = await axios.post<{ uploadId: string; uploadUrl: string }>(
      `${baseUrl}/upload-url`,
      { version: input.version },
      { withCredentials: true, signal: input.signal },
    );
    await axios.put(upload.uploadUrl, input.file, {
      headers: { "Content-Type": "application/octet-stream" },
      timeout: 0,
      signal: input.signal,
      onUploadProgress: (event) => {
        const total = event.total ?? input.file.size;
        if (total > 0) input.onProgress(Math.min(99, Math.round((event.loaded / total) * 99)));
      },
    });
    const response = await axios.post<{ modelVersion: ModelVersionDto }>(
      `${baseUrl}/complete`,
      { version: input.version, uploadId: upload.uploadId },
      {
        withCredentials: true,
        signal: input.signal,
      },
    );
    input.onProgress(100);
    return { ok: true, modelVersion: response.data.modelVersion };
  } catch (error) {
    if (axios.isCancel(error)) {
      return { ok: false, code: MODEL_VERSION_UPLOAD_CANCELED, message: "" };
    }
    if (axios.isAxiosError<{ code?: string; message?: string }>(error) && error.response) {
      return {
        ok: false,
        code: error.response.data?.code ?? "uploadFailed",
        message: error.response.data?.message ?? MODEL_VERSION_UPLOAD_FALLBACK_MESSAGE,
      };
    }
    return { ok: false, code: "uploadFailed", message: MODEL_VERSION_UPLOAD_FALLBACK_MESSAGE };
  }
}
