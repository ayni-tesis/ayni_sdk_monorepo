import { sdkTraceSchema } from "@ayni/api/sdk-trace";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { SdkTraceDatabase } from "./sdk-trace-store";
import { listApplicationTraceSummaries, storeSdkTrace } from "./sdk-trace-store";

const trace = sdkTraceSchema.parse({
  traceSchemaVersion: 1,
  traceId: "550e8400-e29b-41d4-a716-446655440001",
  runId: "run-1",
  repetition: 1,
  installationId: "550e8400-e29b-41d4-a716-446655440000",
  timestamp: "2026-10-02T12:00:00.000Z",
  measurements: [],
  incidents: [],
  workflowId: "workflow-1",
  workflowVersionId: "workflow-version-1",
  workflowVersion: "1.0.0",
  models: [],
  profile: { schemaVersion: 1, platform: "android" },
  status: "success",
  durationMs: 12,
  nodes: [],
  outputs: {
    result: {
      type: "classification",
      nodeId: "output-1",
      label: "perro",
      confidence: 0.9,
      confidences: { perro: 0.9, gato: 0.1 },
    },
  },
  clientReportedFields: ["runId", "repetition"],
});

function memoryDatabase() {
  let row: Record<string, unknown> | undefined;
  const database = {
    delete: () => ({ where: async () => undefined }),
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (row) return [];
            row = value;
            return [{ receivedAt: value.receivedAt }];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            row ? [{ contentSha256: row.contentSha256, receivedAt: row.receivedAt }] : [],
        }),
      }),
    }),
  };
  return {
    database: database as unknown as SdkTraceDatabase,
    get row() {
      return row;
    },
  };
}

describe("storeSdkTrace", () => {
  it("confirms the same content idempotently and rejects changed content", async () => {
    const memory = memoryDatabase();
    const received = await storeSdkTrace(memory.database, {
      applicationId: "app-1",
      trace,
      retentionDays: 30,
    });
    const result = trace.outputs.result;
    if (result?.type !== "classification") throw new Error("Expected classification trace output");
    const reordered = sdkTraceSchema.parse({
      ...trace,
      outputs: {
        result: { ...result, confidences: { gato: 0.1, perro: 0.9 } },
      },
    });
    const retried = await storeSdkTrace(memory.database, {
      applicationId: "app-1",
      trace: reordered,
      retentionDays: 30,
    });
    const changed = await storeSdkTrace(memory.database, {
      applicationId: "app-1",
      trace: { ...trace, durationMs: 13 },
      retentionDays: 30,
    });

    expect(retried).toEqual(received);
    expect(changed).toEqual({ ok: false, reason: "conflict" });
    expect(memory.row?.source).toBe("clientReported");
  });

  it("expires the stored record according to the application's retention policy", async () => {
    const memory = memoryDatabase();
    const before = Date.now();

    await storeSdkTrace(memory.database, {
      applicationId: "app-1",
      trace,
      retentionDays: 7,
    });

    const storedExpiry = memory.row?.expiresAt;
    expect(storedExpiry).toBeInstanceOf(Date);
    const expiresAt = storedExpiry instanceof Date ? storedExpiry.getTime() : Number.NaN;
    expect(expiresAt).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000);
  });
});

describe("listApplicationTraceSummaries", () => {
  it("combines trace filters with application scope and retention", async () => {
    let where: SQL | undefined;
    const database = {
      select: () => ({
        from: () => ({
          where: (condition: SQL) => {
            where = condition;
            return { orderBy: () => ({ limit: async () => [] }) };
          },
        }),
      }),
    } as unknown as SdkTraceDatabase;

    await listApplicationTraceSummaries(database, {
      applicationId: "app-1",
      limit: 10,
      workflowId: "workflow-1",
      workflowVersion: "1.2.3",
      modelId: "model-1",
      modelVersionId: "model-version-1",
      modelVersion: "2.0.0",
      status: "error",
      receivedFrom: "2026-10-01",
      receivedTo: "2026-10-02",
      platform: "android",
      deviceModel: "Pixel",
      osVersion: "14",
      apiLevel: 35,
      ramRange: "6-8GB",
      socModel: "Tensor",
      runId: "run-1",
      repetition: 2,
      condition: "night",
      caseId: "case-1",
      scenario: "indoors",
      backend: "tflite",
    });

    if (!where) throw new Error("Expected the trace query to include a WHERE clause");
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).toContain("application_id");
    expect(query.sql).toContain("expires_at");
    for (const field of [
      "workflowId",
      "workflowVersion",
      "model_id",
      "model_version",
      "modelVersionId",
      "status",
      "received_at",
      "profile",
      "runId",
      "repetition",
      "condition",
      "caseId",
      "scenario",
      "backend",
    ]) {
      expect(query.sql).toContain(field);
    }
    expect(query.params).toEqual(
      expect.arrayContaining([
        "app-1",
        "workflow-1",
        "1.2.3",
        "model-1",
        "model-version-1",
        "2.0.0",
        "error",
        "Pixel",
        "run-1",
        "night",
        "case-1",
        "indoors",
        "tflite",
      ]),
    );
  });
});
