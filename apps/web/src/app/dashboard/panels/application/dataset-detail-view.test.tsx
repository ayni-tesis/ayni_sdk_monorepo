// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));
vi.mock("@/lib/http-client", () => ({ httpClient: { get: getMock, post: postMock } }));

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
  result: { type: "classification", label: "pino", confidence: 0.9 },
  capturedAt: "2026-10-01T00:00:00.000Z",
};

const item = {
  id: "item-1",
  ...evidence,
  originalResult: evidence.result,
  addedAt: "2026-10-02T00:00:00.000Z",
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
