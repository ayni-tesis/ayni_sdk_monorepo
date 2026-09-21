// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadModelVersionDialog } from "./upload-model-version-dialog";

const { uploadMock, toastMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("./upload-model-version", () => ({
  MODEL_VERSION_UPLOAD_FALLBACK_MESSAGE:
    "No se pudo guardar la versión del modelo. Inténtalo de nuevo.",
  uploadModelVersion: uploadMock,
}));
vi.mock("sonner", () => ({ toast: toastMock }));

function renderDialog(overrides?: {
  onOpenChange?: (open: boolean) => void;
  onUploaded?: (modelVersion: unknown) => void;
}) {
  return render(
    <UploadModelVersionDialog
      open
      onOpenChange={overrides?.onOpenChange ?? vi.fn()}
      applicationId="app-1"
      modelId="model-1"
      modelName="Detector de plagas"
      onUploaded={overrides?.onUploaded}
    />,
  );
}

function fillVersion(value: string) {
  fireEvent.change(screen.getByLabelText("Versión"), { target: { value } });
}

function attachFile(file: File) {
  fireEvent.change(screen.getByLabelText("Archivo TensorFlow Lite (.tflite)"), {
    target: { files: [file] },
  });
}

function tfliteFile() {
  return new File([new Uint8Array(20)], "modelo.tflite");
}

function submit() {
  const form = document.querySelector("form");
  if (!form) throw new Error("form not rendered");
  fireEvent.submit(form);
}

beforeEach(() => {
  uploadMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("UploadModelVersionDialog", () => {
  it("renders the US-013 copy: title, fields, help and actions", () => {
    renderDialog();

    expect(screen.getByText("Subir versión de modelo")).toBeTruthy();
    expect(screen.getByText("Detector de plagas", { exact: false })).toBeTruthy();
    expect(screen.getByLabelText("Versión")).toBeTruthy();
    expect(screen.getByLabelText("Archivo TensorFlow Lite (.tflite)")).toBeTruthy();
    expect(
      screen.getByText("No podrás reemplazar una versión publicada con el mismo identificador."),
    ).toBeTruthy();
    expect(screen.getByText("Cancelar")).toBeTruthy();
    expect(screen.getByTestId("upload-version-submit").textContent).toBe("Subir versión");
  });

  it("rejects a non-SemVer version without uploading", () => {
    renderDialog();
    fillVersion("1.0");
    attachFile(tfliteFile());
    submit();

    expect(screen.getByRole("alert").textContent).toBe(
      "Ingresa una versión con formato SemVer, por ejemplo 1.0.0.",
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("requires a file", () => {
    renderDialog();
    fillVersion("1.0.0");
    submit();

    expect(screen.getByRole("alert").textContent).toBe("Selecciona un archivo .tflite.");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects files below the FlatBuffers minimum client-side", () => {
    renderDialog();
    fillVersion("1.0.0");
    attachFile(new File([new Uint8Array(4)], "tiny.tflite"));
    submit();

    expect(screen.getByRole("alert").textContent).toBe(
      "El archivo no es un modelo TensorFlow Lite válido.",
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("shows progress while uploading and closes with a toast on success", async () => {
    const onOpenChange = vi.fn();
    const onUploaded = vi.fn();
    const modelVersion = { id: "mv-1", version: "1.0.0" };
    let reportProgress: (percent: number) => void = () => {};
    let resolveUpload: (value: unknown) => void = () => {};

    uploadMock.mockImplementation((input: { onProgress: (percent: number) => void }) => {
      reportProgress = input.onProgress;
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    });

    renderDialog({ onOpenChange, onUploaded });
    fillVersion("1.0.0");
    attachFile(tfliteFile());
    submit();

    await waitFor(() => expect(screen.getByText(/Subiendo modelo…/)).toBeTruthy());
    act(() => reportProgress(42));
    expect(screen.getByText(/Subiendo modelo… 42%/)).toBeTruthy();
    expect(screen.getByLabelText("Subiendo modelo").getAttribute("aria-valuenow")).toBe("42");

    act(() => resolveUpload({ ok: true, modelVersion }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(modelVersion));

    expect(toastMock.success).toHaveBeenCalledWith("Versión 1.0.0 subida y verificada.");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("maps a duplicated version to the US-013 message and keeps the dialog open", async () => {
    const onOpenChange = vi.fn();
    uploadMock.mockResolvedValue({
      ok: false,
      code: "modelVersionExists",
      message: "Esa versión ya existe para este modelo.",
    });

    renderDialog({ onOpenChange });
    fillVersion("1.0.0");
    attachFile(tfliteFile());
    submit();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Ya existe una versión con este identificador.",
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("upload-version-submit").textContent).toBe("Subir versión");
  });

  it("surfaces typed server messages for invalid files", async () => {
    uploadMock.mockResolvedValue({
      ok: false,
      code: "invalidModelFile",
      message: "El archivo no es un modelo TensorFlow Lite válido.",
    });

    renderDialog();
    fillVersion("1.0.0");
    attachFile(tfliteFile());
    submit();

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "El archivo no es un modelo TensorFlow Lite válido.",
      ),
    );
  });

  it("blocks closing and editing while the upload is in flight", async () => {
    uploadMock.mockReturnValue(new Promise(() => {}));

    renderDialog();
    fillVersion("1.0.0");
    attachFile(tfliteFile());
    submit();

    await waitFor(() => expect(screen.getByText(/Subiendo modelo…/)).toBeTruthy());

    fireEvent.click(screen.getByText("Cancelar"));
    expect(screen.getByText(/Subiendo modelo…/)).toBeTruthy();
    expect((screen.getByLabelText("Versión") as HTMLInputElement).disabled).toBe(true);
  });
});
