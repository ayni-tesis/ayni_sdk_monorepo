// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock, uploadMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock("@/lib/http-client", () => ({ httpClient: { get: getMock, post: postMock } }));
vi.mock("./validation-datasets", () => ({ uploadValidationDataset: uploadMock }));

const { ValidationDatasetsPanel } = await import("./validation-datasets-panel");

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

const dataset = {
  id: "dataset-1",
  applicationId: "app-1",
  name: "Flores",
  source: "Colección de tesis",
  license: "CC BY 4.0",
  createdAt: "2026-10-01T00:00:00.000Z",
  createdById: "admin",
  versions: [datasetVersion],
};

function renderPanel({ canManage = true, applicationStatus = "active" } = {}) {
  return render(
    <ValidationDatasetsPanel
      applicationId="app-1"
      canManage={canManage}
      applicationStatus={applicationStatus}
    />,
  );
}

describe("ValidationDatasetsPanel", () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue({ data: { datasets: [dataset] } });
    postMock.mockReset();
    uploadMock.mockReset();
  });

  afterEach(() => cleanup());

  it("requires source, license, and the operator's redistribution declaration", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Flores");
    await user.type(screen.getByLabelText("Nombre del dataset"), "Prueba local");
    await user.click(screen.getByRole("button", { name: "Registrar dataset" }));
    expect(postMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Fuente"), "Repositorio universitario");
    await user.type(screen.getByLabelText("Licencia"), "CC BY 4.0");
    await user.click(screen.getByRole("button", { name: "Registrar dataset" }));
    expect(postMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Quien opera declara que puede redistribuir el dataset; el sistema no certifica cumplimiento legal.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /declaro que puedo redistribuir/i }));
    await user.click(screen.getByRole("button", { name: "Registrar dataset" }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith(
      "/applications/app-1/validation-datasets",
      { name: "Prueba local", source: "Repositorio universitario", license: "CC BY 4.0" },
    ));
  });

  it("shows dataset metadata to members without upload controls", async () => {
    renderPanel({ canManage: false });

    expect(await screen.findByText("Flores")).toBeInTheDocument();
    expect(screen.getByText("Colección de tesis")).toBeInTheDocument();
    expect(screen.getByText("CC BY 4.0")).toBeInTheDocument();
    expect(screen.getByText("1.0.0 · test")).toBeInTheDocument();
    expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar dataset" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Archivo ZIP" )).not.toBeInTheDocument();
  });

  it("reports transfer progress and the verification phase", async () => {
    const user = userEvent.setup();
    let finishUpload: (() => void) | undefined;
    let finishVerification: (() => void) | undefined;
    uploadMock.mockImplementation(({ onProgress, onPhase }) => {
      onPhase("uploading");
      onProgress(45);
      return new Promise((resolve) => {
        finishUpload = () => {
          onPhase("verifying");
          finishVerification = () => resolve({ ok: true, datasetVersion });
        };
      });
    });
    renderPanel();

    await screen.findByText("Flores");
    await user.type(screen.getByLabelText("Versión"), "2.0.0");
    await user.type(screen.getByLabelText("Partición"), "test");
    fireEvent.change(screen.getByLabelText("Archivo ZIP"), {
      target: { files: [new File(["zip"], "validation.zip", { type: "application/zip" })] },
    });
    await user.click(screen.getByRole("button", { name: "Subir versión" }));

    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        datasetId: "dataset-1",
        version: "2.0.0",
        partition: "test",
        file: expect.any(File),
        onProgress: expect.any(Function),
        onPhase: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect((await screen.findByRole("progressbar")).getAttribute("aria-valuenow")).toBe("45");
    await act(async () => finishUpload?.());
    expect(await screen.findByText("Verificando ZIP y calculando SHA-256…")).toBeInTheDocument();
    await act(async () => finishVerification?.());
    expect(
      await screen.findByText(
        "ZIP verificado y publicado. Los dispositivos comprobarán el manifiesto y las imágenes antes de ejecutar.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("cancels an active transfer", async () => {
    const user = userEvent.setup();
    uploadMock.mockImplementation(({ signal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ ok: false, code: "canceled", message: "" }));
    }));
    renderPanel();

    await screen.findByText("Flores");
    await user.type(screen.getByLabelText("Versión"), "2.0.0");
    await user.type(screen.getByLabelText("Partición"), "test");
    fireEvent.change(screen.getByLabelText("Archivo ZIP"), {
      target: { files: [new File(["zip"], "validation.zip", { type: "application/zip" })] },
    });
    await user.click(screen.getByRole("button", { name: "Subir versión" }));
    await user.click(await screen.findByRole("button", { name: "Cancelar subida" }));

    expect(uploadMock.mock.calls[0]?.[0].signal.aborted).toBe(true);
    expect(await screen.findByRole("button", { name: "Subir versión" })).toBeInTheDocument();
  });

  it("explains an already published version and partition", async () => {
    const user = userEvent.setup();
    uploadMock.mockResolvedValue({
      ok: false,
      code: "datasetVersionExists",
      message: "Esa versión y partición ya están publicadas.",
    });
    renderPanel();

    await screen.findByText("Flores");
    await user.type(screen.getByLabelText("Versión"), "1.0.0");
    await user.type(screen.getByLabelText("Partición"), "test");
    fireEvent.change(screen.getByLabelText("Archivo ZIP"), {
      target: { files: [new File(["zip"], "validation.zip", { type: "application/zip" })] },
    });
    await user.click(screen.getByRole("button", { name: "Subir versión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esa versión y partición ya están publicadas.",
    );
  });
});
