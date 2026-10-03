import { describe, expect, it } from "vitest";
import {
  applicationTraceMetricsQuerySchema,
  applicationTraceMetricsResponseSchema,
  applicationTracePageQuerySchema,
} from "./application-traces";

describe("applicationTracePageQuerySchema", () => {
  it("defaults to the first page", () => {
    expect(applicationTracePageQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("accepts a bounded limit and opaque base64url cursor", () => {
    expect(
      applicationTracePageQuerySchema.parse({ limit: "25", cursor: "eyJyZWNlaXZlZEF0IjoifQ" }),
    ).toEqual({ limit: 25, cursor: "eyJyZWNlaXZlZEF0IjoifQ" });
  });

  it("accepts trace filters for execution, versions, dates, and device profile", () => {
    expect(
      applicationTracePageQuerySchema.parse({
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
        apiLevel: "35",
        ramRange: "6-8GB",
        socModel: "Tensor",
        runId: "run-1",
        repetition: "2",
        condition: "night",
        caseId: "case-1",
        scenario: "indoors",
        backend: "tflite",
      }),
    ).toEqual({
      limit: 50,
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
  });

  it("trims workflow and model versions before matching", () => {
    expect(
      applicationTracePageQuerySchema.parse({
        workflowVersion: " 1.2.3 ",
        modelVersion: " 2.0.0 ",
      }),
    ).toMatchObject({ workflowVersion: "1.2.3", modelVersion: "2.0.0" });
  });

  it("preserves long trace-context and technical-profile filter values exactly", () => {
    const context = ` ${"value".repeat(100)} `;
    const filters = {
      runId: context,
      condition: context,
      caseId: context,
      scenario: context,
      backend: context,
      deviceModel: context,
      osVersion: context,
      ramRange: context,
      socModel: context,
    };
    expect(applicationTracePageQuerySchema.parse(filters)).toMatchObject(filters);
  });

  it.each(["0", "101", "1.5", "NaN"])("rejects invalid page size %s", (limit) => {
    expect(applicationTracePageQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("rejects malformed cursors and unexpected query parameters", () => {
    expect(applicationTracePageQuerySchema.safeParse({ cursor: "not+base64" }).success).toBe(false);
    expect(applicationTracePageQuerySchema.safeParse({ page: "2" }).success).toBe(false);
  });

  it("rejects invalid filters and date ranges", () => {
    expect(applicationTracePageQuerySchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(
      applicationTracePageQuerySchema.safeParse({
        receivedFrom: "2026-10-03",
        receivedTo: "2026-10-02",
      }).success,
    ).toBe(false);
    expect(applicationTracePageQuerySchema.safeParse({ repetition: "0" }).success).toBe(false);
  });

  it("rejects oversized bounded filters, malformed dates, and nonnumeric API levels", () => {
    expect(applicationTracePageQuerySchema.safeParse({ workflowId: "w".repeat(129) }).success).toBe(
      false,
    );
    expect(applicationTracePageQuerySchema.safeParse({ receivedFrom: "2026-02-30" }).success).toBe(
      false,
    );
    expect(applicationTracePageQuerySchema.safeParse({ apiLevel: "not-a-number" }).success).toBe(
      false,
    );
  });

  it("accepts a one-day range when the date bounds are equal", () => {
    expect(
      applicationTracePageQuerySchema.parse({
        receivedFrom: "2026-10-02",
        receivedTo: "2026-10-02",
      }),
    ).toMatchObject({ receivedFrom: "2026-10-02", receivedTo: "2026-10-02" });
  });
});

describe("applicationTraceMetricsQuerySchema", () => {
  it("requires an inclusive UTC date range no longer than 90 days", () => {
    expect(
      applicationTraceMetricsQuerySchema.parse({
        receivedFrom: "2026-01-01",
        receivedTo: "2026-03-31",
      }),
    ).toEqual({ receivedFrom: "2026-01-01", receivedTo: "2026-03-31" });
    expect(
      applicationTraceMetricsQuerySchema.safeParse({
        receivedFrom: "2026-01-01",
        receivedTo: "2026-04-01",
      }).success,
    ).toBe(false);
  });

  it("rejects missing, invalid, reversed, and unexpected period fields", () => {
    expect(applicationTraceMetricsQuerySchema.safeParse({}).success).toBe(false);
    expect(
      applicationTraceMetricsQuerySchema.safeParse({
        receivedFrom: "2026-02-30",
        receivedTo: "2026-03-01",
      }).success,
    ).toBe(false);
    expect(
      applicationTraceMetricsQuerySchema.safeParse({
        receivedFrom: "2026-03-02",
        receivedTo: "2026-03-01",
      }).success,
    ).toBe(false);
    expect(
      applicationTraceMetricsQuerySchema.safeParse({
        receivedFrom: "2026-03-01",
        receivedTo: "2026-03-02",
        status: "error",
      }).success,
    ).toBe(false);
  });
});

describe("applicationTraceMetricsResponseSchema", () => {
  it("accepts aggregates with explicit populations and permits no duration samples", () => {
    expect(
      applicationTraceMetricsResponseSchema.parse({
        period: { from: "2026-10-01", to: "2026-10-02", timeZone: "UTC" },
        methodology: {
          workflows: {
            population: "one retained client-reported trace per workflow execution",
            errorRate: "error executions divided by executions times 100",
            duration: "arithmetic mean of reported durationMs values",
            durationUnit: "ms",
          },
          models: {
            population: "completed or failed model node attempts; skipped nodes excluded",
            errorRate: "failed model node attempts divided by attempts times 100",
            duration: "arithmetic mean of reported model node durationMs values",
            durationUnit: "ms",
          },
        },
        workflows: [
          {
            workflowId: "workflow-1",
            workflowVersionId: "workflow-version-1",
            workflowVersion: "1.0.0",
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
            executionCount: 1,
            errorCount: 0,
            errorRatePercent: 0,
            durationSampleCount: 0,
            meanDurationMs: null,
          },
        ],
      }),
    ).toMatchObject({ workflows: [{ errorRatePercent: 50 }], models: [{ meanDurationMs: null }] });
  });

  it("rejects raw trace payloads in aggregate rows", () => {
    expect(
      applicationTraceMetricsResponseSchema.safeParse({
        period: { from: "2026-10-01", to: "2026-10-02", timeZone: "UTC" },
        methodology: {
          workflows: { population: "x", errorRate: "x", duration: "x", durationUnit: "ms" },
          models: { population: "x", errorRate: "x", duration: "x", durationUnit: "ms" },
        },
        workflows: [
          {
            workflowId: "workflow-1",
            workflowVersionId: "workflow-version-1",
            workflowVersion: "1.0.0",
            executionCount: 1,
            errorCount: 0,
            errorRatePercent: 0,
            durationSampleCount: 1,
            meanDurationMs: 10,
            trace: { outputs: { secret: "image payload" } },
          },
        ],
        models: [],
      }).success,
    ).toBe(false);
  });
});
