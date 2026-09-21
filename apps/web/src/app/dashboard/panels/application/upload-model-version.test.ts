import { afterEach, describe, expect, it, vi } from "vitest";

const { postMock, axiosMock } = vi.hoisted(() => {
  const postMock = vi.fn();
  return {
    postMock,
    axiosMock: {
      post: postMock,
      isAxiosError: (error: unknown): boolean =>
        typeof error === "object" && error !== null && "isAxiosError" in error,
    },
  };
});

vi.mock("@ayni/env/web", () => ({ env: { NEXT_PUBLIC_SERVER_URL: "http://localhost:3000" } }));
vi.mock("axios", () => ({ default: axiosMock }));

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
    postMock.mockReset();
  });

  it("posts multipart data with the version and file and returns the record", async () => {
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
    postMock.mockResolvedValue({ data: { modelVersion } });
    const onProgress = vi.fn();

    const result = await uploadModelVersion({ ...baseInput, onProgress });

    expect(result).toEqual({ ok: true, modelVersion });
    const [url, body, config] = postMock.mock.calls[0] as [
      string,
      FormData,
      Record<string, unknown>,
    ];
    expect(url).toBe("http://localhost:3000/applications/app-1/models/model-1/versions");
    expect(body.get("version")).toBe("1.0.0");
    expect((body.get("file") as File).name).toBe("modelo.tflite");
    expect(config.withCredentials).toBe(true);
    expect(config.timeout).toBe(0);
  });

  it("reports upload progress as a percentage of transferred bytes", async () => {
    postMock.mockImplementation((_url: string, _body: FormData, config: unknown) => {
      const { onUploadProgress } = config as {
        onUploadProgress: (event: { loaded: number; total?: number }) => void;
      };
      onUploadProgress({ loaded: 50, total: 200 });
      onUploadProgress({ loaded: 200, total: 200 });
      return Promise.resolve({ data: { modelVersion: {} } });
    });
    const onProgress = vi.fn();

    await uploadModelVersion({ ...baseInput, onProgress });

    expect(onProgress.mock.calls.map(([percent]) => percent)).toEqual([25, 100]);
  });

  it("falls back to the file size when the request total is unknown", async () => {
    postMock.mockImplementation((_url: string, _body: FormData, config: unknown) => {
      const { onUploadProgress } = config as {
        onUploadProgress: (event: { loaded: number; total?: number }) => void;
      };
      onUploadProgress({ loaded: baseInput.file.size });
      return Promise.resolve({ data: { modelVersion: {} } });
    });
    const onProgress = vi.fn();

    await uploadModelVersion({ ...baseInput, onProgress });

    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("maps typed API errors to code and message", async () => {
    postMock.mockRejectedValue(
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
    postMock.mockRejectedValue(axiosError(undefined));

    const result = await uploadModelVersion({ ...baseInput, onProgress: vi.fn() });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("uploadFailed");
      expect(result.message).toBe("No se pudo guardar la versión del modelo. Inténtalo de nuevo.");
    }
  });

  it("treats network failures as retryable upload failures", async () => {
    postMock.mockRejectedValue(new Error("offline"));

    const result = await uploadModelVersion({ ...baseInput, onProgress: vi.fn() });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("uploadFailed");
  });
});
