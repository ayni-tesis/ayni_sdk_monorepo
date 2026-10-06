// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock("@/lib/http-client", () => ({ httpClient: { post: postMock } }));

const { DatasetsPanel } = await import("./datasets-panel");

function renderPanel(canManage = true, applicationStatus: "active" | "archived" = "active") {
  return render(
    <DatasetsPanel
      applicationId="app-1"
      canManage={canManage}
      applicationStatus={applicationStatus}
    />,
  );
}

describe("DatasetsPanel", () => {
  beforeEach(() => {
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

  it("creates a classification or detection dataset and confirms success", async () => {
    const user = userEvent.setup();
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
