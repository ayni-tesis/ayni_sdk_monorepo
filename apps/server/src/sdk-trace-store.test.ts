import { sdkTraceSchema } from "@ayni/api/sdk-trace";
import { sdkTrace } from "@ayni/db/schema/index";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { SdkTraceDatabase } from "./sdk-trace-store";
import { purgeExpiredSdkTraces, storeSdkTrace } from "./sdk-trace-store";

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
    delete: () => ({ where: async () => ({ count: 0 }) }),
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

    await storeSdkTrace(memory.database, {
      applicationId: "app-1",
      trace,
      retentionDays: 7,
    });

    // Counted from receipt with the period saved when the row is written, read
    // under FOR SHARE so a concurrent retention change cannot be missed (US-112).
    const receivedAt = memory.row?.receivedAt;
    expect(receivedAt).toBeInstanceOf(Date);
    const expiry = new PgDialect().sqlToQuery(memory.row?.expiresAt as SQL);
    expect(expiry.sql).toBe(
      '$1::timestamp + make_interval(days => coalesce((select "application_telemetry_policy"."retention_days" from "application_telemetry_policy" where "application_telemetry_policy"."application_id" = $2 for share), $3)::integer)',
    );
    expect(expiry.params).toEqual([(receivedAt as Date).toISOString(), "app-1", 7]);
  });
});

describe("purgeExpiredSdkTraces (US-112)", () => {
  it("deletes every trace whose expiry has passed and counts them", async () => {
    const where = vi.fn();
    const database = {
      delete: (table: unknown) => ({
        where: (condition: SQL) => {
          where(table, condition);
          return Promise.resolve({ count: 2 });
        },
      }),
    } as unknown as SdkTraceDatabase;
    const now = new Date("2026-10-03T00:00:00.000Z");

    await expect(purgeExpiredSdkTraces(database, now)).resolves.toEqual({ deletedTraces: 2 });

    const [table, condition] = where.mock.calls[0] as [unknown, SQL];
    expect(table).toBe(sdkTrace);
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toBe('"sdk_trace"."expires_at" <= $1');
    expect(query.params).toEqual([now.toISOString()]);
  });

  it("does nothing when no trace has expired, so a repeated run is harmless", async () => {
    const database = {
      delete: () => ({ where: async () => ({ count: 0 }) }),
    } as unknown as SdkTraceDatabase;

    await expect(purgeExpiredSdkTraces(database)).resolves.toEqual({ deletedTraces: 0 });
  });
});
