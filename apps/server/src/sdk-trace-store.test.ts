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

function expectBoundPredicate(
  query: { sql: string; params: unknown[] },
  predicate: string,
  value: string | number,
  operator = "=",
) {
  const parameterIndex = query.params.indexOf(String(value));
  expect(parameterIndex).toBeGreaterThanOrEqual(0);
  expect(query.sql).toContain(`${predicate} ${operator} $${parameterIndex + 1}`);
}

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
    const tracePath = (path: string) => `"sdk_trace"."trace" ${path}`;
    expectBoundPredicate(query, `${tracePath("->> 'workflowId'")}`, "workflow-1");
    expectBoundPredicate(query, `${tracePath("->> 'workflowVersion'")}`, "1.2.3");
    expectBoundPredicate(query, `${tracePath("->> 'status'")}`, "error");
    expectBoundPredicate(query, `"sdk_trace"."received_at"`, "2026-10-01T00:00:00.000Z", ">=");
    expectBoundPredicate(query, `"sdk_trace"."received_at"`, "2026-10-03T00:00:00.000Z", "<");
    expectBoundPredicate(query, `${tracePath("-> 'profile' ->> 'platform'")}`, "android");
    expectBoundPredicate(query, `${tracePath("-> 'profile' ->> 'model'")}`, "Pixel");
    expectBoundPredicate(query, `${tracePath("-> 'profile' ->> 'osVersion'")}`, "14");
    expectBoundPredicate(query, `${tracePath("-> 'profile' ->> 'apiLevel'")}`, 35);
    expectBoundPredicate(query, `${tracePath("-> 'profile' ->> 'ramRange'")}`, "6-8GB");
    expectBoundPredicate(query, `${tracePath("-> 'profile' ->> 'socModel'")}`, "Tensor");
    expectBoundPredicate(query, `${tracePath("->> 'runId'")}`, "run-1");
    expectBoundPredicate(query, `${tracePath("->> 'repetition'")}`, 2);
    expectBoundPredicate(query, `${tracePath("->> 'condition'")}`, "night");
    expectBoundPredicate(query, `${tracePath("->> 'caseId'")}`, "case-1");
    expectBoundPredicate(query, `${tracePath("->> 'scenario'")}`, "indoors");
    expectBoundPredicate(query, `${tracePath("->> 'backend'")}`, "tflite");
    const modelReferences = JSON.stringify([
      { modelId: "model-1", modelVersionId: "model-version-1", version: "2.0.0" },
    ]);
    const modelReferencesParameter = query.params.indexOf(modelReferences);
    expect(modelReferencesParameter).toBeGreaterThanOrEqual(0);
    expect(query.sql).toContain(
      `"sdk_trace"."model_references" @> $${modelReferencesParameter + 1}::jsonb`,
    );
    expect(query.params).toContain("app-1");
  });

  it("matches model version filters against trace data without live model joins", async () => {
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
      modelVersionId: "deleted-model-version",
      modelVersion: "2.0.0",
    });

    if (!where) throw new Error("Expected the trace query to include a WHERE clause");
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).toContain("trace_model.value ->> 'modelVersionId'");
    expect(query.sql).toContain("trace_model.value ->> 'version'");
    expect(query.sql).not.toContain("inner join");
    expect(query.params).toEqual(expect.arrayContaining(["deleted-model-version", "2.0.0"]));
  });

  it("filters models through the retained server-resolved model reference", async () => {
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
      modelId: "deleted-model-parent",
    });

    if (!where) throw new Error("Expected the trace query to include a WHERE clause");
    const query = new PgDialect().sqlToQuery(where);
    const references = JSON.stringify([{ modelId: "deleted-model-parent" }]);
    const referencesParameter = query.params.indexOf(references);
    expect(referencesParameter).toBeGreaterThanOrEqual(0);
    expect(query.sql).toContain(
      `"sdk_trace"."model_references" @> $${referencesParameter + 1}::jsonb`,
    );
    expect(query.sql).not.toContain("inner join");
  });
});

describe("storeSdkTrace model references", () => {
  it("stores model IDs resolved within the trace application's scope", async () => {
    const modelVersionId = "model-version-1";
    const modelTrace = sdkTraceSchema.parse({
      ...trace,
      models: [{ modelVersionId, version: "1.2.3", sha256: "a".repeat(64) }],
    });
    let versionQuery: SQL | undefined;
    let inserted: Record<string, unknown> | undefined;
    const database = {
      delete: () => ({ where: async () => undefined }),
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: async (condition: SQL) => {
              versionQuery = condition;
              return [{ modelVersionId, modelId: "model-1" }];
            },
          }),
          where: () => ({ limit: async () => [] }),
        }),
      }),
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          inserted = value;
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ receivedAt: value.receivedAt }],
            }),
          };
        },
      }),
    } as unknown as SdkTraceDatabase;

    await storeSdkTrace(database, {
      applicationId: "app-1",
      trace: modelTrace,
      retentionDays: 30,
    });

    expect(inserted?.modelReferences).toEqual([
      { modelId: "model-1", modelVersionId, version: "1.2.3" },
    ]);
    if (!versionQuery) throw new Error("Expected model versions to be resolved");
    const query = new PgDialect().sqlToQuery(versionQuery);
    expect(query.sql).toContain("application_id");
    expect(query.params).toEqual(expect.arrayContaining(["app-1", modelVersionId]));
  });
});
