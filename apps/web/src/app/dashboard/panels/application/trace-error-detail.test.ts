import type { ApplicationTraceRecord } from "@ayni/api/application-traces";
import { describe, expect, it } from "vitest";
import { traceErrorDetail } from "./trace-error-detail";

const record: ApplicationTraceRecord = {
  source: "clientReported",
  receivedAt: "2026-10-02T12:01:00.000Z",
  expiresAt: "2026-11-01T12:01:00.000Z",
  trace: {
    traceSchemaVersion: 1,
    traceId: "550e8400-e29b-41d4-a716-446655440001",
    runId: "run-7",
    repetition: 3,
    installationId: "550e8400-e29b-41d4-a716-446655440000",
    timestamp: "2026-10-02T12:00:00.000Z",
    condition: "treatment",
    appVersion: "2.1.0",
    sdkVersion: "0.1.0",
    datasetId: "plantas",
    datasetSha256: "c".repeat(64),
    measurements: [],
    incidents: [],
    workflowId: "workflow-1",
    workflowVersionId: "workflow-version-1",
    workflowVersion: "1.0.0",
    models: [{ modelVersionId: "model-version-1", version: "1.2.0", sha256: "b".repeat(64) }],
    profile: {
      schemaVersion: 1,
      platform: "android",
      osVersion: "14",
      apiLevel: 34,
      model: "Pixel 8",
      ramRange: "8-12 GB",
    },
    status: "error",
    durationMs: 40,
    nodes: [
      { nodeId: "input", type: "input.image", status: "completed", durationMs: 2 },
      {
        nodeId: "classifier",
        type: "model.tflite",
        status: "failed",
        durationMs: 38,
        modelVersionId: "model-version-1",
      },
    ],
    outputs: {},
    clientReportedFields: [
      "runId",
      "repetition",
      "condition",
      "appVersion",
      "sdkVersion",
      "datasetId",
      "datasetSha256",
      "ramRange",
    ],
    error: {
      category: "modelOutputInvalid",
      phase: "modelOutputValidation",
      nodeId: "classifier",
      modelVersionId: "model-version-1",
    },
  },
};

function field(detail: ReturnType<typeof traceErrorDetail>, label: string) {
  return detail?.sections.flatMap((section) => section.fields).find((f) => f.label === label);
}

describe("traceErrorDetail", () => {
  it("returns nothing for a trace without an error", () => {
    const { error: _error, ...trace } = record.trace;
    expect(traceErrorDetail({ ...record, trace: { ...trace, status: "success" } })).toBeNull();
  });

  it("names the category, phase, node, workflow, model and versions of the error", () => {
    const detail = traceErrorDetail(record);
    expect(field(detail, "Categoría")?.value).toBe(
      "Salida del modelo no válida (modelOutputInvalid)",
    );
    expect(field(detail, "Fase")).toEqual({
      label: "Fase",
      value: "Validación de la salida del modelo",
      source: "sdk",
    });
    expect(field(detail, "Nodo")?.value).toBe("classifier · Modelo");
    expect(field(detail, "Workflow")?.value).toBe("workflow-1");
    expect(field(detail, "Versión")?.value).toBe("1.0.0 · workflow-version-1");
    expect(field(detail, "Modelo")?.value).toBe("1.2.0 · model-version-1");
    expect(field(detail, "SHA-256 del modelo")?.value).toBe("b".repeat(64));
  });

  it("relates the error to the run, repetition, condition, provenance and device profile", () => {
    const detail = traceErrorDetail(record);
    expect(field(detail, "Corrida")).toMatchObject({ value: "run-7", source: "app" });
    expect(field(detail, "Repetición")).toMatchObject({ value: "3", source: "app" });
    expect(field(detail, "Condición")).toMatchObject({ value: "treatment", source: "app" });
    expect(field(detail, "Versión de la app")).toMatchObject({ value: "2.1.0", source: "app" });
    expect(field(detail, "Versión del SDK")).toMatchObject({ value: "0.1.0", source: "app" });
    expect(field(detail, "SHA-256 del dataset")).toMatchObject({
      value: "c".repeat(64),
      source: "app",
    });
    expect(field(detail, "Plataforma")).toMatchObject({ value: "Android", source: "sdk" });
    expect(field(detail, "Sistema operativo")).toMatchObject({ value: "14", source: "sdk" });
    expect(field(detail, "Nivel de API")).toMatchObject({ value: "34", source: "sdk" });
    expect(field(detail, "Dispositivo")).toMatchObject({ value: "Pixel 8", source: "sdk" });
    expect(field(detail, "RAM (rango)")).toMatchObject({ value: "8-12 GB", source: "app" });
  });

  it("marks only the reception and expiry dates as calculated by Ayni", () => {
    const detail = traceErrorDetail(record);
    const ayni = detail?.sections
      .flatMap((section) => section.fields)
      .filter((f) => f.source === "ayni")
      .map((f) => f.label);
    expect(ayni).toEqual(["Recibida", "Disponible hasta"]);
    expect(field(detail, "Recibida")?.value).toBe(record.receivedAt);
  });

  it("omits values the trace does not carry instead of inventing them", () => {
    const detail = traceErrorDetail(record);
    expect(field(detail, "Caso")).toBeUndefined();
    expect(field(detail, "SoC")).toBeUndefined();
    expect(field(detail, "Commit de la app")).toBeUndefined();
  });

  it("falls back to the failed node and its model when the error does not name them", () => {
    const detail = traceErrorDetail({
      ...record,
      trace: { ...record.trace, error: { category: "runtimeError" } },
    });
    expect(field(detail, "Categoría")?.value).toBe("Error durante la ejecución (runtimeError)");
    expect(field(detail, "Fase")).toBeUndefined();
    expect(field(detail, "Nodo")?.value).toBe("classifier · Modelo");
    expect(field(detail, "Modelo")?.value).toBe("1.2.0 · model-version-1");
  });

  it("still details a failed trace whose error object is missing", () => {
    const { error: _error, ...trace } = record.trace;
    const detail = traceErrorDetail({ ...record, trace });
    expect(field(detail, "Categoría")?.value).toBe("No disponible");
    expect(field(detail, "Nodo")?.value).toBe("classifier · Modelo");
  });

  it("names an affected model that the trace could not resolve by its id only", () => {
    const detail = traceErrorDetail({
      ...record,
      trace: {
        ...record.trace,
        models: [],
        nodes: [],
        error: {
          category: "modelNotAvailable",
          phase: "modelResolution",
          modelVersionId: "model-version-9",
        },
      },
    });
    expect(field(detail, "Nodo")?.value).toBe("No disponible");
    expect(field(detail, "Modelo")?.value).toBe("model-version-9");
    expect(field(detail, "SHA-256 del modelo")).toBeUndefined();
  });
});
