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

export const MODEL_VERSION_UPLOAD_FALLBACK_MESSAGE =
  "No se pudo guardar la versión del modelo. Inténtalo de nuevo.";

export async function uploadModelVersion(input: {
  applicationId: string;
  modelId: string;
  version: string;
  file: File;
  onProgress: (percent: number) => void;
}): Promise<ModelVersionUploadResult> {
  const form = new FormData();
  form.append("version", input.version);
  form.append("file", input.file, input.file.name);

  try {
    const response = await axios.post<{ modelVersion: ModelVersionDto }>(
      `${env.NEXT_PUBLIC_SERVER_URL}/applications/${input.applicationId}/models/${input.modelId}/versions`,
      form,
      {
        withCredentials: true,
        timeout: 0,
        onUploadProgress: (event) => {
          const total = event.total ?? input.file.size;
          if (total > 0) {
            input.onProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
          }
        },
      },
    );
    return { ok: true, modelVersion: response.data.modelVersion };
  } catch (error) {
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
