import { afterEach, describe, expect, it, vi } from "vitest";

const { httpPostMock, putMock, axiosMock } = vi.hoisted(() => {
  const httpPostMock = vi.fn();
  const putMock = vi.fn();
  return {
    httpPostMock,
    putMock,
    axiosMock: {
      put: putMock,
      isAxiosError: (error: unknown): boolean =>
        typeof error === "object" && error !== null && "isAxiosError" in error,
      isCancel: (error: unknown): boolean =>
        typeof error === "object" && error !== null && "__CANCEL__" in error,
    },
  };
});

vi.mock("axios", () => ({ default: axiosMock }));
vi.mock("@/lib/http-client", () => ({ httpClient: { post: httpPostMock } }));

const { uploadModelVersion } = await import("./upload-model-version");

function axiosError(response?: { data?: unknown }) {
  return Object.assign(new Error("request failed"), { isAxiosError: true, response });
}

const baseInput = {
  applicationId: "app-1",
  modelId: "model-1",
  version: "1.0.0",
  file: new File([new Uint8Array(20)], "modelo.tflite"),
};

describe("uploadModelVersion", () => {
  afterEach(() => {
    httpPostMock.mockReset();
    putMock.mockReset();
  });

  it("uploads the file directly to R2 and then registers its version", async () => {
    const modelVersion = {
      id: "mv-1",
      modelId: "model-1",
      version: "1.0.0",
      storageKey: "applications/app-1/models/model-1/versions/1.0.0.tflite",
      sha256: "a".repeat(64),
      sizeBytes: 20,
      createdAt: "2026-09-20T00:00:00.000Z",
      uploadedById: "admin",
    };
    httpPostMock
      .mockResolvedValueOnce({ data: { uploadId: "upload-1", uploadUrl: "https://r2.test/put" } })
      .mockResolvedValueOnce({ data: { modelVersion } });
    putMock.mockResolvedValue({ status: 200 });
    const onProgress = vi.fn();

    const result = await uploadModelVersion({ ...baseInput, onProgress });

    expect(result).toEqual({ ok: true, modelVersion });
    expect(httpPostMock.mock.calls[0]?.[0]).toBe(
      "/applications/app-1/models/model-1/versions/upload-url",
    );
    expect(httpPostMock.mock.calls[0]?.[1]).toEqual({ version: "1.0.0" });
    expect(putMock).toHaveBeenCalledWith(
      "https://r2.test/put",
      baseInput.file,
      expect.objectContaining({
        headers: { "Content-Type": "application/octet-stream" },
        timeout: 0,
      }),
    );
    expect(httpPostMock.mock.calls[1]?.[0]).toBe(
      "/applications/app-1/models/model-1/versions/complete",
    );
    expect(httpPostMock.mock.calls[1]?.[1]).toEqual({ version: "1.0.0", uploadId: "upload-1" });
  });

  it("reports upload progress as a percentage of transferred bytes", async () => {
    httpPostMock
      .mockResolvedValueOnce({ data: { uploadId: "upload-1", uploadUrl: "https://r2.test/put" } })
      .mockResolvedValueOnce({ data: { modelVersion: {} } });
    putMock.mockImplementation((_url: string, _file: File, config: unknown) => {
      const { onUploadProgress } = config as {
        onUploadProgress: (event: { loaded: number; total?: number }) => void;
      };
      onUploadProgress({ loaded: 50, total: 200 });
      onUploadProgress({ loaded: 200, total: 200 });
      return Promise.resolve({ status: 200 });
    });
    const onProgress = vi.fn();

    await uploadModelVersion({ ...baseInput, onProgress });

    expect(onProgress.mock.calls.map(([percent]) => percent)).toEqual([25, 99, 100]);
  });

  it("falls back to the file size when the request total is unknown", async () => {
    httpPostMock
      .mockResolvedValueOnce({ data: { uploadId: "upload-1", uploadUrl: "https://r2.test/put" } })
      .mockResolvedValueOnce({ data: { modelVersion: {} } });
    putMock.mockImplementation((_url: string, _file: File, config: unknown) => {
      const { onUploadProgress } = config as {
        onUploadProgress: (event: { loaded: number; total?: number }) => void;
      };
      onUploadProgress({ loaded: baseInput.file.size });
      return Promise.resolve({ status: 200 });
    });
    const onProgress = vi.fn();

    await uploadModelVersion({ ...baseInput, onProgress });

    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("maps typed API errors to code and message", async () => {
    httpPostMock.mockRejectedValue(
      axiosError({ data: { code: "modelVersionExists", message: "Esa versión ya existe." } }),
    );

    const result = await uploadModelVersion({ ...baseInput, onProgress: vi.fn() });

    expect(result).toEqual({
      ok: false,
      code: "modelVersionExists",
      message: "Esa versión ya existe.",
    });
  });

  it("falls back when the server replies without a typed body", async () => {
    httpPostMock.mockRejectedValue(axiosError(undefined));

    const result = await uploadModelVersion({ ...baseInput, onProgress: vi.fn() });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("uploadFailed");
      expect(result.message).toBe("No se pudo guardar la versión del modelo. Inténtalo de nuevo.");
    }
  });

  it("maps canceled uploads to a dedicated code without a message", async () => {
    httpPostMock.mockRejectedValue(
      Object.assign(new Error("canceled"), { __CANCEL__: true, response: {} }),
    );

    const result = await uploadModelVersion({ ...baseInput, onProgress: vi.fn() });

    expect(result).toEqual({ ok: false, code: "canceled", message: "" });
  });

  it("treats network failures as retryable upload failures", async () => {
    httpPostMock.mockRejectedValue(new Error("offline"));

    const result = await uploadModelVersion({ ...baseInput, onProgress: vi.fn() });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("uploadFailed");
  });
});
