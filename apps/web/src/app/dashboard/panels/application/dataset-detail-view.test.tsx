// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/lib/http-client", () => ({ httpClient: { get: getMock } }));

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

function renderDetail(onBackToDatasets?: () => void) {
  return render(
    <DatasetDetailView
      application={application}
      datasetId="dataset-1"
      onBackToDatasets={onBackToDatasets}
    />,
  );
}

describe("DatasetDetailView", () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue({ data: { dataset } });
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
    getMock.mockResolvedValueOnce({ data: { dataset } });
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
