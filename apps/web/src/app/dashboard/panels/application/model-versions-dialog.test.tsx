// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  abbreviateSha256,
  formatVersionSize,
  type ModelVersionListItem,
  ModelVersionsDialog,
} from "./model-versions-dialog";

const { client, uploadMock, toastMock, writeTextMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), delete: vi.fn() },
  uploadMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  writeTextMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("./upload-model-version", () => ({
  MODEL_VERSION_UPLOAD_CANCELED: "canceled",
  MODEL_VERSION_UPLOAD_FALLBACK_MESSAGE:
    "No se pudo guardar la versión del modelo. Inténtalo de nuevo.",
  uploadModelVersion: uploadMock,
}));
vi.mock("sonner", () => ({ toast: toastMock }));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });
});

const fullSha = "a".repeat(64);

const listedVersion: ModelVersionListItem = {
  id: "mv-1",
  version: "1.0.0",
  sha256: fullSha,
  sizeBytes: 2048,
  createdAt: "2026-09-20T00:00:00.000Z",
};

const expectedDate = new Date("2026-09-20T00:00:00.000Z").toLocaleDateString("es", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function renderDialog(overrides?: { canManage?: boolean }) {
  return render(
    <ModelVersionsDialog
      open
      onOpenChange={vi.fn()}
      applicationId="app-1"
      modelId="model-1"
      modelName="Detector de plagas"
      canManage={overrides?.canManage ?? false}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  client.get.mockReset();
  client.delete.mockReset();
  uploadMock.mockReset();
  client.get.mockResolvedValue({ data: { versions: [listedVersion] } });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("ModelVersionsDialog", () => {
  it("fetches the versions endpoint and shows Versión, Hash, Tamaño, Subida el and Contrato", async () => {
    renderDialog();

    const row = await screen.findByTestId("model-version-row-mv-1");
    expect(client.get).toHaveBeenCalledWith("/applications/app-1/models/model-1/versions", {
      signal: expect.any(AbortSignal),
    });

    const table = screen.getByTestId("model-versions-table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Versión", "Hash", "Tamaño", "Subida el", "Contrato"]);

    expect(within(row).getByText("1.0.0")).toBeTruthy();
    expect(within(row).getByText(`${"a".repeat(8)}…`)).toBeTruthy();
    expect(within(row).getByText("2 KB")).toBeTruthy();
    expect(within(row).getByText(expectedDate)).toBeTruthy();
    expect(within(row).getByText("—")).toBeTruthy();
  });

  it("shows the title Versiones de <modelo>", async () => {
    renderDialog();

    const dialog = await screen.findByRole("dialog", { name: "Versiones de Detector de plagas" });
    expect(dialog).toBeTruthy();
  });

  it("shows the loading state while versions are being fetched", async () => {
    let resolveVersions: (value: unknown) => void = () => {};
    client.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVersions = resolve;
        }),
    );

    renderDialog();

    const loading = await screen.findByTestId("model-versions-loading");
    expect(loading.textContent).toBe("Cargando versiones…");
    expect(screen.queryByTestId("model-versions-table")).toBeNull();

    resolveVersions({ data: { versions: [listedVersion] } });
    expect(await screen.findByTestId("model-version-row-mv-1")).toBeTruthy();
    expect(screen.queryByTestId("model-versions-loading")).toBeNull();
  });

  it("shows the empty state for a model without versions", async () => {
    client.get.mockResolvedValue({ data: { versions: [] } });

    renderDialog();

    const empty = await screen.findByTestId("model-versions-empty");
    expect(empty.textContent).toBe("Este modelo aún no tiene versiones.");
    expect(screen.queryByTestId("model-versions-table")).toBeNull();
  });

  it("shows a retryable error state when loading fails", async () => {
    let versionsCalls = 0;
    client.get.mockImplementation(() => {
      versionsCalls += 1;
      if (versionsCalls === 1) {
        throw { isAxiosError: true, response: { status: 500, data: {} } };
      }
      return { data: { versions: [listedVersion] } };
    });

    renderDialog();

    expect(
      await screen.findByText("No pudimos cargar las versiones. Inténtalo nuevamente."),
    ).toBeTruthy();
    expect(screen.queryByTestId("model-versions-table")).toBeNull();

    fireEvent.click(screen.getByTestId("model-versions-retry"));

    expect(await screen.findByTestId("model-version-row-mv-1")).toBeTruthy();
    expect(versionsCalls).toBe(2);
  });

  it("copies the full hash through the Copiar hash action", async () => {
    renderDialog();

    const row = await screen.findByTestId("model-version-row-mv-1");
    fireEvent.click(within(row).getByTestId("copy-hash-mv-1"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(fullSha);
    });
  });

  it("hides the Subir versión action for members without administration permissions", async () => {
    renderDialog({ canManage: false });

    await screen.findByTestId("model-version-row-mv-1");
    expect(screen.queryByTestId("upload-version-from-versions")).toBeNull();
  });

  it("lets admins upload a new version from the dialog and refreshes the list after success", async () => {
    renderDialog({ canManage: true });

    await screen.findByTestId("model-version-row-mv-1");
    fireEvent.click(screen.getByTestId("upload-version-from-versions"));

    const uploadDialog = await screen.findByRole("dialog", { name: "Subir versión de modelo" });
    expect(uploadDialog).toBeTruthy();

    fireEvent.change(within(uploadDialog).getByLabelText("Versión"), {
      target: { value: "2.0.0" },
    });
    fireEvent.change(within(uploadDialog).getByLabelText("Archivo TensorFlow Lite (.tflite)"), {
      target: { files: [new File([new Uint8Array(20)], "modelo.tflite")] },
    });
    uploadMock.mockResolvedValue({
      ok: true,
      modelVersion: { ...listedVersion, id: "mv-2", version: "2.0.0" },
    });

    const form = document.querySelector("form");
    if (!form) throw new Error("upload form not rendered");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
      expect(client.get).toHaveBeenCalledTimes(2);
    });
  });

  it("confirms deletion, removes the version, and shows success", async () => {
    renderDialog({ canManage: true });
    await screen.findByTestId("model-version-row-mv-1");
    client.delete.mockResolvedValue({ status: 204 });

    fireEvent.click(screen.getByTestId("delete-version-trigger-mv-1"));
    const confirmation = await screen.findByRole("dialog", { name: "¿Eliminar la versión 1.0.0?" });
    expect(within(confirmation).getByText("Se eliminará el archivo del modelo. Esta acción no se puede deshacer.")).toBeTruthy();

    fireEvent.click(within(confirmation).getByRole("button", { name: "Eliminar versión" }));

    await waitFor(() => {
      expect(client.delete).toHaveBeenCalledWith(
        "/applications/app-1/models/model-1/versions/mv-1",
      );
      expect(toastMock.success).toHaveBeenCalledWith("Versión eliminada.");
      expect(client.get).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the in-use error without removing the version", async () => {
    renderDialog({ canManage: true });
    await screen.findByTestId("model-version-row-mv-1");
    client.delete.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "No puedes eliminar esta versión porque un workflow publicado la usa." } },
    });

    fireEvent.click(screen.getByTestId("delete-version-trigger-mv-1"));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar versión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No puedes eliminar esta versión porque un workflow publicado la usa.",
    );
    expect(screen.getByTestId("model-version-row-mv-1")).toBeTruthy();
  });
});

describe("version display helpers", () => {
  it("formats sizes in binary units", () => {
    expect(formatVersionSize(0)).toBe("0 B");
    expect(formatVersionSize(512)).toBe("512 B");
    expect(formatVersionSize(1536)).toBe("1.5 KB");
    expect(formatVersionSize(1258291)).toBe("1.2 MB");
  });

  it("abbreviates a SHA-256 to its first eight characters", () => {
    expect(abbreviateSha256(fullSha)).toBe(`${"a".repeat(8)}…`);
  });
});
