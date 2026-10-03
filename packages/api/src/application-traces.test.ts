import { describe, expect, it } from "vitest";
import { applicationTracePageQuerySchema } from "./application-traces";

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
});
