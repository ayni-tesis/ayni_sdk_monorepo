import axios from "axios";
import { httpClient } from "@/lib/http-client";

export type ValidationDatasetVersion = {
  id: string;
  datasetId: string;
  version: string;
  partition: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  uploadedById: string | null;
};

export type ValidationDatasetUploadResult =
  | { ok: true; datasetVersion: ValidationDatasetVersion }
  | { ok: false; code: string; message: string };

async function sha256Hex(file: File): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadValidationDataset(input: {
  applicationId: string;
  datasetId: string;
  version: string;
  partition: string;
  file: File;
  onProgress: (percent: number) => void;
  onPhase?: (phase: "uploading" | "verifying") => void;
  signal?: AbortSignal;
}): Promise<ValidationDatasetUploadResult> {
  const basePath = `/applications/${input.applicationId}/validation-datasets/${input.datasetId}/versions`;
  let uploadId: string | undefined;
  let completed = false;

  try {
    input.onPhase?.("verifying");
    const sha256 = await sha256Hex(input.file);
    if (input.signal?.aborted) {
      return { ok: false, code: "canceled", message: "" };
    }

    const { data: upload } = await httpClient.post<{ uploadId: string; uploadUrl: string }>(
      `${basePath}/upload-url`,
      { version: input.version, partition: input.partition, sizeBytes: input.file.size },
      { signal: input.signal },
    );
    uploadId = upload.uploadId;
    input.onPhase?.("uploading");

    await axios.put(upload.uploadUrl, input.file, {
      headers: { "Content-Type": "application/zip" },
      timeout: 0,
      signal: input.signal,
      onUploadProgress: (event) => {
        const total = event.total ?? input.file.size;
        if (total > 0) input.onProgress(Math.min(99, Math.round((event.loaded / total) * 99)));
      },
    });

    input.onPhase?.("verifying");
    const response = await httpClient.post<{ datasetVersion: ValidationDatasetVersion }>(
      `${basePath}/complete`,
      {
        uploadId,
        version: input.version,
        partition: input.partition,
        sizeBytes: input.file.size,
        sha256,
      },
      { timeout: 0, signal: input.signal },
    );
    completed = true;
    input.onProgress(100);
    return { ok: true, datasetVersion: response.data.datasetVersion };
  } catch (error) {
    if (uploadId && !completed) {
      try {
        await httpClient.post(`${basePath}/cancel`, {
          uploadId,
          version: input.version,
          partition: input.partition,
          sizeBytes: input.file.size,
        });
      } catch {
        // Expired staging URLs are also removed by the R2 lifecycle policy.
      }
    }
    if (axios.isCancel(error)) {
      return { ok: false, code: "canceled", message: "" };
    }
    if (axios.isAxiosError<{ code?: string; message?: string }>(error) && error.response) {
      return {
        ok: false,
        code: error.response.data?.code ?? "uploadFailed",
        message:
          error.response.data?.message ?? "No se pudo guardar el dataset. Inténtalo de nuevo.",
      };
    }
    return {
      ok: false,
      code: "uploadFailed",
      message: "No se pudo guardar el dataset. Inténtalo de nuevo.",
    };
  }
}
