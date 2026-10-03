// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationTraceMetricsView } from "./application-trace-metrics-view";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/http-client", () => ({ httpClient: { get } }));

const baseMetrics = {
  period: { from: "2026-10-01", to: "2026-10-02", timeZone: "UTC" as const },
  methodology: {
    workflows: {
      population: "Trazas clientReported no vencidas; una traza por ejecución.",
      errorRate: "Ejecuciones con error / ejecuciones × 100.",
      duration: "Media aritmética del durationMs informado.",
      durationUnit: "ms" as const,
    },
    models: {
      population: "Nodos completed o failed; se excluyen skipped.",
      errorRate: "Nodos fallidos / nodos intentados × 100.",
      duration: "Media aritmética de durationMs informado por nodos.",
      durationUnit: "ms" as const,
    },
  },
  workflows: [
    {
      workflowId: "workflow-1",
      workflowVersionId: "workflow-version-1",
      workflowVersion: "1.2.0",
      executionCount: 2,
      errorCount: 1,
      errorRatePercent: 50,
      durationSampleCount: 2,
      meanDurationMs: 12.5,
    },
  ],
  models: [
    {
      modelId: "model-1",
      modelName: "Clasificador",
      modelVersionId: "model-version-1",
      modelVersion: "2.0.0",
      executionCount: 2,
      errorCount: 1,
      errorRatePercent: 50,
      durationSampleCount: 1,
      meanDurationMs: 4,
    },
  ],
};

describe("ApplicationTraceMetricsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: baseMetrics });
  });

  afterEach(() => cleanup());

  it("shows method, population, samples and metrics by workflow and model version", async () => {
    render(<ApplicationTraceMetricsView applicationId="app-1" />);

    expect(await screen.findByText("Por workflow y versión")).toBeTruthy();
    expect(screen.getByText("Por modelo y versión")).toBeTruthy();
    expect(screen.getByText("workflow-1")).toBeTruthy();
    expect(screen.getByText("1.2.0 · workflow-version-1")).toBeTruthy();
    expect(screen.getByText("Clasificador")).toBeTruthy();
    expect(screen.getByText("2.0.0 · model-version-1")).toBeTruthy();
    expect(screen.getAllByText("50 %")).toHaveLength(2);
    expect(screen.getByText(/12[,.]5 ms · n = 2/)).toBeTruthy();
    expect(screen.getByText("4 ms · n = 1")).toBeTruthy();
    expect(get).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/applications\/app-1\/traces\/metrics\?receivedFrom=\d{4}-\d{2}-\d{2}&receivedTo=\d{4}-\d{2}-\d{2}$/,
      ),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    expect(screen.getByText(baseMetrics.methodology.workflows.population)).toBeTruthy();
    expect(screen.getByText(/Nodos fallidos \/ nodos intentados/)).toBeTruthy();
    expect(screen.getByText(/No valida hipótesis de tesis/)).toBeTruthy();
  });

  it("queries a selected period and shows no fabricated metrics when there are no traces", async () => {
    const emptyMetrics = { ...baseMetrics, workflows: [], models: [] };
    get.mockResolvedValue({ data: emptyMetrics });
    render(<ApplicationTraceMetricsView applicationId="app-1" />);
    expect(
      await screen.findByText(
        "Sin datos disponibles para este periodo. No se calcularon métricas.",
      ),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Desde (UTC)"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Hasta (UTC, inclusive)"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar métricas" }));

    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        "/applications/app-1/traces/metrics?receivedFrom=2026-10-01&receivedTo=2026-10-02",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("0 %")).toBeNull();
  });
});
