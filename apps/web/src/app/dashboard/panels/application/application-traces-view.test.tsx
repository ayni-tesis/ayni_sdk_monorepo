// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationTracesView } from "./application-traces-view";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/http-client", () => ({ httpClient: { get } }));

const application = {
  id: "app-1",
  organizationId: "workspace-1",
  name: "Ayni",
  status: "active" as const,
};
const traceId = "550e8400-e29b-41d4-a716-446655440001";
const summary = {
  source: "clientReported" as const,
  receivedAt: "2026-10-02T12:01:00.000Z",
  trace: {
    traceId,
    timestamp: "2026-10-02T12:00:00.000Z",
    workflowId: "workflow-1",
    workflowVersionId: "workflow-version-1",
    workflowVersion: "1.0.0",
    profile: {
      schemaVersion: 1 as const,
      platform: "android" as const,
      osVersion: "14",
      model: "Pixel",
    },
    status: "success" as const,
    durationMs: 12,
    models: [{ version: "1.2.0" }],
  },
};
const record = {
  source: "clientReported" as const,
  receivedAt: "2026-10-02T12:01:00.000Z",
  expiresAt: "2026-11-01T12:01:00.000Z",
  trace: {
    traceSchemaVersion: 1 as const,
    traceId,
    runId: "run-1",
    repetition: 1,
    installationId: "550e8400-e29b-41d4-a716-446655440000",
    timestamp: "2026-10-02T12:00:00.000Z",
    measurements: [],
    incidents: [],
    workflowId: "workflow-1",
    workflowVersionId: "workflow-version-1",
    workflowVersion: "1.0.0",
    models: [{ modelVersionId: "model-version-1", version: "1.2.0", sha256: "b".repeat(64) }],
    profile: {
      schemaVersion: 1 as const,
      platform: "android" as const,
      osVersion: "14",
      model: "Pixel",
    },
    status: "success" as const,
    durationMs: 12,
    nodes: [],
    outputs: { resultado: { type: "boolean" as const, nodeId: "node-1", value: true } },
    clientReportedFields: ["runId", "repetition"],
  },
};

describe("ApplicationTracesView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation(async (url: string) => {
      if (url.includes("/export")) return { data: new Blob(["{}\n"]) };
      if (url.endsWith(traceId)) return { data: { record } };
      if (url.includes("cursor=")) return { data: { traces: [], nextCursor: null } };
      return { data: { traces: [summary], nextCursor: "next-page" } };
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => cleanup());

  it("lets a workspace member inspect the full trace and paginate", async () => {
    render(<ApplicationTracesView application={application} />);
    expect(await screen.findByText("Workflow 1.0.0 · workflow-1")).toBeTruthy();
    expect(screen.getByText("Duración: 12 ms")).toBeTruthy();
    expect(screen.getByText("Modelos: 1.2.0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `Ver detalle de la traza ${traceId}` }));
    expect(await screen.findByText("12 ms")).toBeTruthy();
    fireEvent.click(screen.getByText("Registro versionado completo"));
    expect(screen.getByText(/modelVersionId/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/applications/app-1/traces?limit=50&cursor=next-page",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("opens the sanitized detail of a failed execution from its row", async () => {
    const errorTraceId = "550e8400-e29b-41d4-a716-446655440002";
    const errorSummary = {
      ...summary,
      trace: { ...summary.trace, traceId: errorTraceId, status: "error" as const },
    };
    const errorRecord = {
      ...record,
      trace: {
        ...record.trace,
        traceId: errorTraceId,
        status: "error" as const,
        condition: "treatment",
        nodes: [
          {
            nodeId: "classifier",
            type: "model.tflite" as const,
            status: "failed" as const,
            modelVersionId: "model-version-1",
          },
        ],
        outputs: {},
        clientReportedFields: ["runId", "repetition", "condition"] as Array<
          "runId" | "repetition" | "condition"
        >,
        error: {
          category: "modelOutputInvalid" as const,
          phase: "modelOutputValidation" as const,
          nodeId: "classifier",
          modelVersionId: "model-version-1",
        },
      },
    };
    get.mockImplementation(async (url: string) => {
      if (url.endsWith(errorTraceId)) return { data: { record: errorRecord } };
      if (url.endsWith(traceId)) return { data: { record } };
      return { data: { traces: [summary, errorSummary], nextCursor: null } };
    });

    render(<ApplicationTracesView application={application} />);
    const errorRow = await screen.findByRole("button", {
      name: `Ver detalle de la traza ${errorTraceId}`,
    });
    expect(errorRow.textContent).toContain("Ver detalle");
    expect(
      screen.getByRole("button", { name: `Ver detalle de la traza ${traceId}` }).textContent,
    ).not.toContain("Ver detalle");

    fireEvent.click(errorRow);
    const errorSection = await screen.findByRole("region", { name: "Error de ejecución" });
    const detail = within(errorSection);
    expect(detail.getByText("No se muestran secretos ni rutas internas.")).toBeTruthy();
    expect(detail.getByText("Salida del modelo no válida (modelOutputInvalid)")).toBeTruthy();
    expect(detail.getByText("classifier · Modelo")).toBeTruthy();
    expect(detail.getByText("workflow-1")).toBeTruthy();
    expect(detail.getByText("1.0.0 · workflow-version-1")).toBeTruthy();
    expect(detail.getByText("1.2.0 · model-version-1")).toBeTruthy();
    expect(detail.getByText("Pixel")).toBeTruthy();
    expect(detail.getByText("treatment")).toBeTruthy();
    expect(detail.getByText(/no están verificados por Ayni/)).toBeTruthy();
    expect(detail.queryByText(/verificad[oa]s?$/i)).toBeNull();
    expect(detail.getAllByText("Ayni")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: `Ver detalle de la traza ${traceId}` }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Error de ejecución" })).toBeNull(),
    );
  });

  it("filters traces by workflow, status, date, profile, and run context", async () => {
    render(<ApplicationTracesView application={application} />);
    await screen.findByText("Workflow 1.0.0 · workflow-1");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/applications/app-1/traces?limit=50&cursor=next-page",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Workflow ID"), { target: { value: "workflow-1" } });
    fireEvent.change(screen.getByLabelText("Modelo ID"), { target: { value: "model-1" } });
    fireEvent.change(screen.getByLabelText("Versión de modelo ID"), {
      target: { value: "model-version-1" },
    });
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "error" } });
    fireEvent.change(screen.getByLabelText("Recibida desde"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("Recibida hasta"), {
      target: { value: "2026-10-02" },
    });
    fireEvent.click(screen.getByText("Perfil técnico"));
    fireEvent.change(screen.getByLabelText("Plataforma"), { target: { value: "android" } });
    fireEvent.click(screen.getByText("Repetición y contexto"));
    fireEvent.change(screen.getByLabelText("Run ID"), { target: { value: "run-1" } });
    fireEvent.change(screen.getByLabelText("Repetición"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Backend efectivo"), {
      target: { value: "tflite" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/applications/app-1/traces?limit=50&workflowId=workflow-1&modelId=model-1&modelVersionId=model-version-1&status=error&receivedFrom=2026-10-01&receivedTo=2026-10-02&platform=android&runId=run-1&repetition=2&backend=tflite",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("downloads the complete application trace export", async () => {
    render(<ApplicationTracesView application={application} />);
    fireEvent.click(screen.getByRole("button", { name: "Exportar JSONL" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/applications/app-1/traces/export", {
        responseType: "blob",
      }),
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
