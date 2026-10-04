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

const { uploadValidationDataset } = await import("./validation-datasets");

const baseInput = {
  applicationId: "app-1",
  datasetId: "dataset-1",
  version: "1.0.0",
  partition: "test",
  file: new File([new Uint8Array([1, 2, 3])], "dataset.zip", { type: "application/zip" }),
};

const datasetVersion = {
  id: "dataset-version-1",
  datasetId: "dataset-1",
  version: "1.0.0",
  partition: "test",
  sha256: "a".repeat(64),
  sizeBytes: 3,
  createdAt: "2026-10-02T00:00:00.000Z",
  uploadedById: "admin",
};

function axiosError(response?: { data?: unknown }) {
  return Object.assign(new Error("request failed"), { isAxiosError: true, response });
}

describe("uploadValidationDataset", () => {
  afterEach(() => {
    httpPostMock.mockReset();
    putMock.mockReset();
  });

  it("uploads a ZIP directly to its temporary URL and reports progress through verification", async () => {
    httpPostMock
      .mockResolvedValueOnce({ data: { uploadId: "upload-1", uploadUrl: "https://r2.test/put" } })
      .mockResolvedValueOnce({ data: { datasetVersion } });
    putMock.mockImplementation((_url: string, _file: File, config: unknown) => {
      const { onUploadProgress } = config as {
        onUploadProgress: (event: { loaded: number; total?: number }) => void;
      };
      onUploadProgress({ loaded: 1, total: 4 });
      onUploadProgress({ loaded: 4, total: 4 });
      return Promise.resolve({ status: 200 });
    });
    const onProgress = vi.fn();
    const onPhase = vi.fn();

    const result = await uploadValidationDataset({ ...baseInput, onProgress, onPhase });

    expect(result).toEqual({ ok: true, datasetVersion });
    expect(putMock).toHaveBeenCalledWith(
      "https://r2.test/put",
      baseInput.file,
      expect.objectContaining({ headers: { "Content-Type": "application/zip" }, timeout: 0 }),
    );
    expect(httpPostMock.mock.calls.map(([path]) => path)).toEqual([
      "/applications/app-1/validation-datasets/dataset-1/versions/upload-url",
      "/applications/app-1/validation-datasets/dataset-1/versions/complete",
    ]);
      expect(httpPostMock.mock.calls[1]?.[1]).toMatchObject({
        uploadId: "upload-1",
        version: "1.0.0",
        partition: "test",
        sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      });
    expect(onProgress.mock.calls.map(([percent]) => percent)).toEqual([25, 99, 100]);
      expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual(["verifying", "uploading", "verifying"]);
  });

  it("deletes the staged ZIP when the direct upload is canceled", async () => {
    httpPostMock.mockResolvedValueOnce({
      data: { uploadId: "upload-1", uploadUrl: "https://r2.test/put" },
    }).mockResolvedValueOnce({ data: undefined });
    putMock.mockRejectedValue(Object.assign(new Error("canceled"), { __CANCEL__: true }));
    const result = await uploadValidationDataset({ ...baseInput, onProgress: vi.fn() });

    expect(result).toEqual({ ok: false, code: "canceled", message: "" });
    expect(httpPostMock).toHaveBeenLastCalledWith(
      "/applications/app-1/validation-datasets/dataset-1/versions/cancel",
      { uploadId: "upload-1" },
    );
  });

  it("returns a typed duplicate-version error", async () => {
    httpPostMock
      .mockResolvedValueOnce({ data: { uploadId: "upload-1", uploadUrl: "https://r2.test/put" } })
      .mockRejectedValueOnce(
        axiosError({ data: { code: "datasetVersionExists", message: "Esa versión ya existe." } }),
      );
    putMock.mockResolvedValue({ status: 200 });

    const result = await uploadValidationDataset({ ...baseInput, onProgress: vi.fn() });

    expect(result).toEqual({
      ok: false,
      code: "datasetVersionExists",
      message: "Esa versión ya existe.",
    });
  });
});
