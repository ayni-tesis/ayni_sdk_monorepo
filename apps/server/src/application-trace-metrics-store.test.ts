import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { getApplicationTraceMetrics } from "./application-trace-metrics-store";
import type { SdkTraceDatabase } from "./sdk-trace-store";

const period = { receivedFrom: "2026-10-01", receivedTo: "2026-10-02" };

function metricsDatabase(rows: [Record<string, unknown>[], Record<string, unknown>[]]) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  let queryIndex = 0;
  const database = {
    execute: async (query: SQL) => {
      queries.push(new PgDialect().sqlToQuery(query));
      return rows[queryIndex++] ?? [];
    },
  } as unknown as SdkTraceDatabase;
  return { database, queries };
}

describe("getApplicationTraceMetrics", () => {
  it("aggregates application workflows and model node attempts without returning raw trace data", async () => {
    const memory = metricsDatabase([
      [
        {
          workflow_id: "workflow-1",
          workflow_version_id: "workflow-version-1",
          workflow_version: "1.2.0",
          execution_count: "4",
          error_count: "1",
          duration_sample_count: "4",
          mean_duration_ms: "12.5",
        },
      ],
      [
        {
          model_id: "model-1",
          model_name: "Clasificador",
          model_version_id: "model-version-1",
          model_version: "2.0.0",
          execution_count: "3",
          error_count: "1",
          duration_sample_count: "2",
          mean_duration_ms: "4.5",
        },
      ],
    ]);

    const result = await getApplicationTraceMetrics(memory.database, {
      applicationId: "app-1",
      ...period,
    });

    expect(result).toMatchObject({
      period: { from: period.receivedFrom, to: period.receivedTo, timeZone: "UTC" },
      workflows: [
        {
          workflowId: "workflow-1",
          workflowVersionId: "workflow-version-1",
          workflowVersion: "1.2.0",
          executionCount: 4,
          errorCount: 1,
          errorRatePercent: 25,
          durationSampleCount: 4,
          meanDurationMs: 12.5,
        },
      ],
      models: [
        {
          modelId: "model-1",
          modelName: "Clasificador",
          modelVersionId: "model-version-1",
          modelVersion: "2.0.0",
          executionCount: 3,
          errorCount: 1,
          errorRatePercent: 100 / 3,
          durationSampleCount: 2,
          meanDurationMs: 4.5,
        },
      ],
    });
    expect(result).not.toHaveProperty("traces");
    expect(memory.queries).toHaveLength(2);
    for (const query of memory.queries) {
      expect(query.params).toContain("app-1");
      expect(query.sql).toContain("'clientReported'");
      expect(query.sql).toContain("expires_at");
      expect(query.sql).not.toContain("'outputs'");
      expect(query.sql).not.toContain("'measurements'");
      expect(
        query.params.some(
          (value) => value instanceof Date && value.toISOString() === "2026-10-01T00:00:00.000Z",
        ),
      ).toBe(true);
      expect(
        query.params.some(
          (value) => value instanceof Date && value.toISOString() === "2026-10-03T00:00:00.000Z",
        ),
      ).toBe(true);
    }
    expect(memory.queries[1]?.sql).toContain("model_node.value ->> 'type'");
    expect(memory.queries[1]?.sql).toContain("model_node.value ->> 'status'");
    expect(memory.queries[1]?.sql).toContain("'completed', 'failed'");
    expect(memory.queries[1]?.sql).toContain("model_node.value ->> 'modelVersionId' is not null");
    expect(memory.queries[1]?.sql).toContain("model_references");
    expect(memory.queries[1]?.sql).toContain('"model"."application_id"');
  });

  it("returns empty aggregates instead of fabricated zero-valued rows", async () => {
    const memory = metricsDatabase([[], []]);

    const result = await getApplicationTraceMetrics(memory.database, {
      applicationId: "app-1",
      ...period,
    });

    expect(result.workflows).toEqual([]);
    expect(result.models).toEqual([]);
  });

  it("preserves null model timings when the client reports no duration samples", async () => {
    const memory = metricsDatabase([
      [],
      [
        {
          model_id: null,
          model_name: null,
          model_version_id: "deleted-version",
          model_version: "2.0.0",
          execution_count: "1",
          error_count: "0",
          duration_sample_count: "0",
          mean_duration_ms: null,
        },
      ],
    ]);

    const result = await getApplicationTraceMetrics(memory.database, {
      applicationId: "app-1",
      ...period,
    });

    expect(result.models).toEqual([
      expect.objectContaining({
        modelId: null,
        modelVersionId: "deleted-version",
        executionCount: 1,
        durationSampleCount: 0,
        meanDurationMs: null,
      }),
    ]);
  });
});
