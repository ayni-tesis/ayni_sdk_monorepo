// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteMock, getMock, patchMock, postMock, putMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  patchMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock("@/lib/http-client", () => ({
  httpClient: { delete: deleteMock, get: getMock, patch: patchMock, post: postMock, put: putMock },
}));

const { DatasetDetailView } = await import("./dataset-detail-view");

const application = {
  id: "app-1",
  name: "Invernos",
  status: "active" as const,
  organizationId: "org-1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const dataset = {
  id: "dataset-1",
  applicationId: "app-1",
  name: "Flores",
  taskType: "classification" as const,
  createdAt: "2026-10-01T00:00:00.000Z",
  evidenceCount: 0,
  approvedCount: 0,
};

const evidence = {
  evidenceId: "evidence-1",
  modelId: "model-1",
  modelVersion: "1.0.0",
  taskType: "classification" as const,
  result: {
    type: "classification",
    label: "pino",
    confidence: 0.9,
    confidences: { pino: 0.9, cedro: 0.1 },
  },
  capturedAt: "2026-10-01T00:00:00.000Z",
};

const item = {
  id: "item-1",
  ...evidence,
  originalResult: evidence.result,
  addedAt: "2026-10-02T00:00:00.000Z",
  imageUrl: "https://evidence.example/image",
  imageWidth: 640,
  imageHeight: 480,
  reviewStatus: "pending" as const,
  reviewerName: null,
  reviewedAt: null,
  reviewReason: null,
  reviewedLabel: null as string | null,
};

function renderDetail(onBackToDatasets?: () => void) {
  return render(
    <DatasetDetailView
      application={application}
      datasetId="dataset-1"
      onBackToDatasets={onBackToDatasets}
    />,
  );
}

function renderManagedDetail() {
  return render(<DatasetDetailView application={application} datasetId="dataset-1" canManage />);
}

describe("DatasetDetailView", () => {
  beforeEach(() => {
    getMock
      .mockReset()
      .mockImplementation(async (url: string) =>
        url.endsWith("/available-evidence")
          ? { data: { evidence: [evidence], nextOffset: null } }
          : { data: { dataset, items: [], nextItemOffset: null } },
      );
    postMock.mockReset().mockResolvedValue({ data: { items: [item] } });
    deleteMock.mockReset().mockResolvedValue({ data: undefined });
    putMock.mockReset().mockImplementation(async (_url: string, body: { label: string }) => ({
      data: { reviewedLabel: body.label.trim() },
    }));
    patchMock.mockReset().mockResolvedValue({
      data: {
        status: "rejected",
        reviewerName: "Diego",
        reviewedAt: "2026-10-03T00:00:00.000Z",
        reason: "Imagen borrosa",
      },
    });
  });

  afterEach(() => cleanup());

  it("shows the dataset metadata and evidence and export tabs", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Flores" })).toBeInTheDocument();
    expect(screen.getByText("dataset-1")).toBeInTheDocument();
    expect(screen.getByText("Clasificación")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay evidencias en este dataset.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Exportaciones" }));
    expect(screen.getByText("Aún no hay exportaciones para este dataset.")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("lets an administrator add selected evidence and shows its original prediction", async () => {
    let added = false;
    getMock.mockImplementation(async (url: string) =>
      url.endsWith("/available-evidence")
        ? { data: { evidence: [evidence], nextOffset: null } }
        : {
            data: added
              ? { dataset: { ...dataset, evidenceCount: 1 }, items: [item], nextItemOffset: null }
              : { dataset, items: [], nextItemOffset: null },
          },
    );
    postMock.mockImplementation(async () => {
      added = true;
      return { data: { items: [item] } };
    });
    renderManagedDetail();
    await screen.findByRole("heading", { name: "Flores" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar evidencia" }));
    await screen.findByText("Predicción: pino (90%)");
    await userEvent.setup().click(screen.getByRole("checkbox"));
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar seleccionadas" }));

    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    expect(screen.getByText("Evidencia agregada al dataset.")).toBeInTheDocument();
    expect(postMock).toHaveBeenCalledWith("/applications/app-1/datasets/dataset-1/evidence", {
      evidenceIds: ["evidence-1"],
    });
  });

  it("shows the image and lets a workspace member reject evidence with an optional reason", async () => {
    getMock.mockResolvedValue({
      data: { dataset: { ...dataset, evidenceCount: 1 }, items: [item], nextItemOffset: null },
    });
    renderDetail();
    expect(await screen.findByRole("img", { name: "Evidencia evidence-1" })).toHaveAttribute(
      "src",
      "https://evidence.example/image",
    );
    expect(screen.getByText("Estado: Pendiente")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Rechazar" }));
    await user.type(screen.getByLabelText("Motivo opcional"), "Imagen borrosa");
    await user.click(screen.getByRole("button", { name: "Rechazar evidencia" }));

    expect(patchMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/review",
      { status: "rejected", reason: "Imagen borrosa" },
    );
    expect(await screen.findByText("Estado: Rechazada")).toBeInTheDocument();
    expect(screen.getByText("Evidencia rechazada.")).toBeInTheDocument();
    expect(screen.getByText("Motivo: Imagen borrosa")).toBeInTheDocument();
    expect(screen.getByText(/Revisada por Diego/)).toBeInTheDocument();
  });

  it("saves a reviewed label apart from the read-only original prediction", async () => {
    getMock.mockResolvedValue({
      data: { dataset: { ...dataset, evidenceCount: 1 }, items: [item], nextItemOffset: null },
    });
    renderDetail();
    const panel = await screen.findByRole("region", { name: "Etiqueta revisada" });
    expect(within(panel).getByText("Predicción original: pino (90%)")).toBeInTheDocument();
    expect(within(panel).getByText("Sin etiqueta revisada")).toBeInTheDocument();
    const field = within(panel).getByLabelText("Etiqueta correcta");
    expect(field).toBeRequired();
    expect(
      Array.from(document.querySelectorAll(`#${field.getAttribute("list")} option`)).map((option) =>
        option.getAttribute("value"),
      ),
    ).toEqual(["pino", "cedro"]);

    const user = userEvent.setup();
    await user.type(field, " cedro ");
    await user.click(within(panel).getByRole("button", { name: "Guardar etiqueta" }));

    expect(putMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/evidence/item-1/label",
      { label: "cedro" },
    );
    expect(await screen.findByText("Etiqueta revisada guardada.")).toBeInTheDocument();
    expect(within(panel).getByText("Etiqueta revisada: cedro")).toBeInTheDocument();
    expect(within(panel).getByText("Predicción original: pino (90%)")).toBeInTheDocument();
  });

  it("rejects an empty label and keeps the previous reviewed label", async () => {
    getMock.mockResolvedValue({
      data: {
        dataset: { ...dataset, evidenceCount: 1 },
        items: [{ ...item, reviewStatus: "approved" as const, reviewedLabel: "cedro" }],
        nextItemOffset: null,
      },
    });
    renderDetail();
    const panel = await screen.findByRole("region", { name: "Etiqueta revisada" });
    const field = within(panel).getByLabelText("Etiqueta correcta");
    expect(field).toHaveValue("cedro");

    const user = userEvent.setup();
    await user.clear(field);
    await user.type(field, "   ");
    await user.click(within(panel).getByRole("button", { name: "Guardar etiqueta" }));

    expect(within(panel).getByRole("alert")).toHaveTextContent(
      "Ingresa una etiqueta para una evidencia aprobada.",
    );
    expect(putMock).not.toHaveBeenCalled();
    expect(within(panel).getByText("Etiqueta revisada: cedro")).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Cancelar" }));
    expect(field).toHaveValue("cedro");
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the server error when saving a label fails", async () => {
    getMock.mockResolvedValue({
      data: { dataset: { ...dataset, evidenceCount: 1 }, items: [item], nextItemOffset: null },
    });
    putMock.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "No encontramos esta evidencia del dataset." } },
    });
    renderDetail();
    const panel = await screen.findByRole("region", { name: "Etiqueta revisada" });
    const user = userEvent.setup();
    await user.type(within(panel).getByLabelText("Etiqueta correcta"), "cedro");
    await user.click(within(panel).getByRole("button", { name: "Guardar etiqueta" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "No encontramos esta evidencia del dataset.",
    );
    expect(within(panel).getByText("Sin etiqueta revisada")).toBeInTheDocument();
  });

  it("shows labels and confidence from detection predictions", async () => {
    const detectionItem = {
      ...item,
      taskType: "detection" as const,
      result: {
        type: "detection",
        detections: [
          {
            label: "gato",
            confidence: 0.914,
            box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 },
          },
          {
            label: "perro",
            confidence: 0.718,
            box: { xMin: 0.5, yMin: 0.4, xMax: 0.7, yMax: 0.9 },
          },
        ],
      },
      originalResult: {
        type: "detection",
        detections: [
          {
            label: "gato",
            confidence: 0.914,
            box: { xMin: 0.1, yMin: 0.2, xMax: 0.5, yMax: 0.6 },
          },
          {
            label: "perro",
            confidence: 0.718,
            box: { xMin: 0.5, yMin: 0.4, xMax: 0.7, yMax: 0.9 },
          },
        ],
      },
    };
    getMock.mockResolvedValue({
      data: {
        dataset: { ...dataset, taskType: "detection", evidenceCount: 1 },
        items: [detectionItem],
        nextItemOffset: null,
      },
    });
    renderDetail();

    expect(
      await screen.findByText(
        "Predicción original: 2 detecciones: gato (91%; caja x 10–50%, y 20–60%), perro (72%; caja x 50–70%, y 40–90%)",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Etiqueta revisada" })).not.toBeInTheDocument();
  });

  it("does not show a stale review success after the item was retired", async () => {
    getMock.mockResolvedValue({
      data: { dataset: { ...dataset, evidenceCount: 1 }, items: [item], nextItemOffset: null },
    });
    let resolveReview!: (response: {
      data: {
        status: "approved";
        reviewerName: string;
        reviewedAt: string;
        reason: null;
      };
    }) => void;
    patchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReview = resolve;
        }),
    );
    renderManagedDetail();
    const user = userEvent.setup();
    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    await user.click(screen.getByRole("button", { name: "Retirar del dataset" }));
    await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));
    expect(await screen.findByText("Evidencia retirada del dataset.")).toBeInTheDocument();

    await act(async () => {
      resolveReview({
        data: {
          status: "approved",
          reviewerName: "Diego",
          reviewedAt: "2026-10-03T00:00:00.000Z",
          reason: null,
        },
      });
    });

    expect(screen.queryByText("Evidencia aprobada.")).not.toBeInTheDocument();
    expect(screen.queryByText("Predicción original: pino (90%)")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("does not duplicate newly added evidence when loading later dataset pages", async () => {
    const user = userEvent.setup();
    const existingItems = Array.from({ length: 55 }, (_, index) => ({
      ...item,
      id: `item-${index}`,
      evidenceId: `evidence-${index}`,
      originalResult: {
        type: "classification" as const,
        label: `existente-${index}`,
        confidence: 0.9,
      },
    }));
    const addedItem = {
      ...item,
      id: "item-new",
      evidenceId: "evidence-new",
      originalResult: { type: "classification" as const, label: "nueva", confidence: 0.9 },
    };
    const updatedDataset = { ...dataset, evidenceCount: 56 };
    let added = false;
    getMock.mockImplementation(async (url: string, options?: { params?: { offset?: number } }) => {
      if (url.endsWith("/available-evidence")) {
        return { data: { evidence: [evidence], nextOffset: null } };
      }
      if (options?.params?.offset === 50) {
        return {
          data: {
            dataset: updatedDataset,
            items: [...existingItems.slice(50), addedItem],
            nextItemOffset: null,
          },
        };
      }
      return {
        data: {
          dataset: added ? updatedDataset : { ...dataset, evidenceCount: 55 },
          items: existingItems.slice(0, 50),
          nextItemOffset: 50,
        },
      };
    });
    postMock.mockImplementation(async () => {
      added = true;
      return { data: { items: [addedItem] } };
    });
    renderManagedDetail();
    await screen.findByRole("heading", { name: "Flores" });
    await user.click(screen.getByRole("button", { name: "Agregar evidencia" }));
    await screen.findByText("Predicción: pino (90%)");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Agregar seleccionadas" }));

    expect(await screen.findByText("Evidencia agregada al dataset.")).toBeInTheDocument();
    expect(screen.queryByText("Predicción original: nueva (90%)")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.body).not.toHaveAttribute("data-scroll-locked"), {
      timeout: 4_000,
    });
    await user.click(
      await screen.findByRole("button", { name: "Cargar más evidencias del dataset" }),
    );

    expect(screen.getAllByText("Predicción original: nueva (90%)")).toHaveLength(1);
    expect(getMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1",
      expect.objectContaining({ params: { offset: 50 } }),
    );
  }, 20_000);

  it("lets administrators retire a dataset item while preserving its source evidence", async () => {
    let removed = false;
    getMock.mockImplementation(async (url: string) =>
      url.endsWith("/available-evidence")
        ? { data: { evidence: [evidence], nextOffset: null } }
        : {
            data: removed
              ? {
                  dataset: { ...dataset, evidenceCount: 0 },
                  items: [],
                  nextItemOffset: null,
                }
              : {
                  dataset: { ...dataset, evidenceCount: 1 },
                  items: [item],
                  nextItemOffset: null,
                },
          },
    );
    deleteMock.mockImplementation(async () => {
      removed = true;
      return { data: undefined };
    });
    renderManagedDetail();
    const user = userEvent.setup();
    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirar del dataset" }));
    expect(
      screen.getByText("La evidencia se conservará, pero no se incluirá en futuras exportaciones."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));

    expect(await screen.findByText("Evidencia retirada del dataset.")).toBeInTheDocument();
    await screen.findByRole("button", { name: "Agregar evidencia" });
    expect(screen.getByText("Aún no hay evidencias en este dataset.")).toBeInTheDocument();
    expect(deleteMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/evidence/item-1",
    );
    await user.click(screen.getByRole("button", { name: "Agregar evidencia" }));
    expect(await screen.findByText("Predicción: pino (90%)")).toBeInTheDocument();
  });

  it("retires an item from a later page without discarding loaded items or reloading the detail", async () => {
    const olderItem = {
      ...item,
      id: "item-2",
      evidenceId: "evidence-2",
      originalResult: { type: "classification", label: "cedro", confidence: 0.7 },
    };
    const laterItem = {
      ...item,
      id: "item-3",
      evidenceId: "evidence-3",
      originalResult: { type: "classification", label: "roble", confidence: 0.6 },
    };
    let removed = false;
    getMock.mockImplementation(async (url: string, options?: { params?: { offset?: number } }) => {
      if (url.endsWith("/available-evidence")) {
        return { data: { evidence: [evidence], nextOffset: null } };
      }
      if (options?.params?.offset === 1 && removed) {
        return {
          data: {
            dataset: { ...dataset, evidenceCount: 2 },
            items: [laterItem],
            nextItemOffset: null,
          },
        };
      }
      if (options?.params?.offset === 1) {
        return {
          data: {
            dataset: { ...dataset, evidenceCount: 3 },
            items: [olderItem],
            nextItemOffset: 2,
          },
        };
      }
      return {
        data: { dataset: { ...dataset, evidenceCount: 3 }, items: [item], nextItemOffset: 1 },
      };
    });
    deleteMock.mockImplementation(async () => {
      removed = true;
      return { data: undefined };
    });
    renderManagedDetail();
    const user = userEvent.setup();
    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));
    expect(await screen.findByText("Predicción original: cedro (70%)")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Retirar del dataset" });
    expect(removeButtons).toHaveLength(2);
    const laterItemRemoveButton = removeButtons[1];
    if (!laterItemRemoveButton) throw new Error("Expected a remove button for the later page");
    await user.click(laterItemRemoveButton);
    await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));

    expect(await screen.findByText("Evidencia retirada del dataset.")).toBeInTheDocument();
    expect(screen.getByText("Predicción original: pino (90%)")).toBeInTheDocument();
    expect(screen.queryByText("Predicción original: cedro (70%)")).not.toBeInTheDocument();
    expect(screen.getByText("Evidencias", { selector: "dt" }).nextElementSibling).toHaveTextContent(
      "2",
    );
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Cargando dataset…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));
    expect(await screen.findByText("Predicción original: roble (60%)")).toBeInTheDocument();
    expect(getMock).toHaveBeenLastCalledWith(
      "/applications/app-1/datasets/dataset-1",
      expect.objectContaining({ params: { offset: 1 } }),
    );
  });

  it("keeps the dataset item and shows a missing-item error when retirement fails", async () => {
    getMock.mockResolvedValue({ data: { dataset, items: [item], nextItemOffset: null } });
    deleteMock.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "No encontramos este ítem del dataset." } },
    });
    renderManagedDetail();
    const user = userEvent.setup();
    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirar del dataset" }));
    await user.click(screen.getByRole("button", { name: "Retirar evidencia" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No encontramos este ítem del dataset.",
    );
    expect(screen.getByText("Predicción original: pino (90%)")).toBeInTheDocument();
  });

  it("does not offer retirement to workspace members", async () => {
    getMock.mockResolvedValue({ data: { dataset, items: [item], nextItemOffset: null } });
    renderDetail();

    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirar del dataset" })).not.toBeInTheDocument();
  });

  it("loads additional compatible evidence pages on demand", async () => {
    const olderEvidence = {
      ...evidence,
      evidenceId: "evidence-2",
      result: { type: "classification", label: "cedro", confidence: 0.7 },
    };
    getMock.mockImplementation(async (url: string, options?: { params?: { offset?: number } }) => {
      if (url.endsWith("/available-evidence")) {
        return options?.params?.offset
          ? { data: { evidence: [olderEvidence], nextOffset: null } }
          : { data: { evidence: [evidence], nextOffset: 50 } };
      }
      return { data: { dataset, items: [] } };
    });
    renderManagedDetail();
    await screen.findByRole("heading", { name: "Flores" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Agregar evidencia" }));
    await screen.findByText("Predicción: pino (90%)");
    await userEvent.setup().click(screen.getByRole("button", { name: "Cargar más evidencias" }));

    expect(await screen.findByText("Predicción: cedro (70%)")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1/available-evidence",
      expect.objectContaining({ params: { offset: 50 } }),
    );
  });

  it("loads additional attached evidence pages on demand", async () => {
    const olderItem = {
      ...item,
      id: "item-2",
      evidenceId: "evidence-2",
      originalResult: { type: "classification", label: "cedro", confidence: 0.7 },
    };
    getMock.mockImplementation(async (url: string, options?: { params?: { offset?: number } }) => {
      if (url.endsWith("/available-evidence")) {
        return { data: { evidence: [evidence], nextOffset: null } };
      }
      return options?.params?.offset
        ? { data: { dataset, items: [olderItem], nextItemOffset: null } }
        : { data: { dataset, items: [item], nextItemOffset: 1 } };
    });
    renderDetail();

    expect(await screen.findByText("Predicción original: pino (90%)")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cargar más evidencias del dataset" }));

    expect(await screen.findByText("Predicción original: cedro (70%)")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(
      "/applications/app-1/datasets/dataset-1",
      expect.objectContaining({ params: { offset: 1 } }),
    );
  });

  it("shows loading, not-found, and retryable error states", async () => {
    getMock.mockReturnValueOnce(new Promise(() => {}));
    renderDetail();
    expect(screen.getByText("Cargando dataset…")).toBeInTheDocument();
    cleanup();

    getMock.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
    renderDetail();
    expect(await screen.findByText("No encontramos este dataset.")).toBeInTheDocument();
    cleanup();

    getMock.mockRejectedValueOnce(new Error("offline"));
    renderDetail();
    expect(await screen.findByText("No pudimos cargar el dataset.")).toBeInTheDocument();
    getMock.mockResolvedValueOnce({ data: { dataset, items: [], nextItemOffset: null } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Flores" })).toBeInTheDocument();
  });

  it("returns to the dataset list from the breadcrumb", async () => {
    const onBackToDatasets = vi.fn();
    renderDetail(onBackToDatasets);
    await screen.findByRole("heading", { name: "Flores" });
    await userEvent.setup().click(screen.getByRole("link", { name: "Datasets" }));
    expect(onBackToDatasets).toHaveBeenCalledOnce();
  });
});
