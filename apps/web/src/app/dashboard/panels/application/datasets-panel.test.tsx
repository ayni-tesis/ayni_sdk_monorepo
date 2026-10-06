// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));
vi.mock("@/lib/http-client", () => ({ httpClient: { get: getMock, post: postMock } }));

const { DatasetsPanel } = await import("./datasets-panel");

function renderPanel(
  canManage = true,
  applicationStatus: "active" | "archived" = "active",
  onOpenDataset?: (datasetId: string) => void,
) {
  return render(
    <DatasetsPanel
      applicationId="app-1"
      canManage={canManage}
      applicationStatus={applicationStatus}
      onOpenDataset={onOpenDataset}
    />,
  );
}

describe("DatasetsPanel", () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue({ data: { datasets: [] } });
    postMock.mockReset().mockResolvedValue({
      data: {
        dataset: {
          id: "dataset-1",
          applicationId: "app-1",
          name: "Flores",
          taskType: "classification",
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      },
    });
  });

  afterEach(() => cleanup());

  it("shows the app's datasets and their evidence counts", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        datasets: [
          {
            id: "dataset-1",
            applicationId: "app-1",
            name: "Flores",
            taskType: "classification",
            createdAt: "2026-10-01T00:00:00.000Z",
            evidenceCount: 4,
            approvedCount: 2,
          },
        ],
      },
    });
    renderPanel(false);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("dataset-1")).toBeInTheDocument();
    expect(screen.getByText("Clasificación")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nombre" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Evidencias" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Aprobadas" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actualizado" })).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("opens a selected dataset", async () => {
    getMock.mockResolvedValueOnce({
      data: {
        datasets: [
          {
            id: "dataset-1",
            applicationId: "app-1",
            name: "Flores",
            taskType: "classification",
            createdAt: "2026-10-01T00:00:00.000Z",
            evidenceCount: 0,
            approvedCount: 0,
          },
        ],
      },
    });
    const onOpenDataset = vi.fn();
    renderPanel(false, "active", onOpenDataset);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Flores" }));
    expect(onOpenDataset).toHaveBeenCalledWith("dataset-1");
  });

  it("shows empty and retryable list-error states", async () => {
    getMock.mockReturnValueOnce(new Promise(() => {}));
    renderPanel(false);
    expect(screen.getByText("Cargando datasets…")).toBeInTheDocument();
    cleanup();

    renderPanel(false);
    expect(await screen.findByText("Aún no hay datasets en esta aplicación.")).toBeInTheDocument();

    cleanup();
    getMock.mockReset().mockRejectedValueOnce(new Error("offline"));
    renderPanel(false);
    expect(await screen.findByText("No pudimos cargar los datasets.")).toBeInTheDocument();
    getMock.mockResolvedValueOnce({ data: { datasets: [] } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Aún no hay datasets en esta aplicación.")).toBeInTheDocument();
  });

  it("creates a classification or detection dataset and confirms success", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValueOnce({ data: { datasets: [] } }).mockResolvedValueOnce({
      data: {
        datasets: [
          {
            id: "dataset-1",
            applicationId: "app-1",
            name: "Flores",
            taskType: "classification",
            createdAt: "2026-10-01T00:00:00.000Z",
            evidenceCount: 0,
            approvedCount: 0,
          },
        ],
      },
    });
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Crear dataset" }));
    await user.type(screen.getByLabelText("Nombre del dataset"), "Flores");
    await user.selectOptions(screen.getByLabelText("Tipo de tarea"), "classification");
    await user.click(screen.getByTestId("create-dataset-submit"));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/applications/app-1/datasets", {
        name: "Flores",
        taskType: "classification",
      }),
    );
    expect(await screen.findByText("Dataset creado.")).toBeInTheDocument();
    expect(await screen.findByText("Flores")).toBeInTheDocument();
  });

  it("requires both fields and hides creation from members and archived applications", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Crear dataset" }));
    await user.click(screen.getByTestId("create-dataset-submit"));
    expect(await screen.findByText("Ingresa un nombre para el dataset.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Nombre del dataset"), "Flores");
    await user.click(screen.getByTestId("create-dataset-submit"));
    expect(await screen.findByText("Selecciona el tipo de tarea.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();

    rerender(<DatasetsPanel applicationId="app-1" canManage={false} applicationStatus="active" />);
    expect(screen.queryByRole("button", { name: "Crear dataset" })).not.toBeInTheDocument();
    rerender(<DatasetsPanel applicationId="app-1" canManage={true} applicationStatus="archived" />);
    expect(screen.queryByRole("button", { name: "Crear dataset" })).not.toBeInTheDocument();
  });
});
