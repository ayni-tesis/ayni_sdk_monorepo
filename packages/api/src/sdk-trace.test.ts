import { describe, expect, it } from "vitest";

import { sdkTraceSchema } from "./sdk-trace";

const trace = {
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
  outputs: {},
  clientReportedFields: ["runId", "repetition"],
};

describe("sdkTraceSchema nodes", () => {
  it("accepts the dataset capture an SDK runs since US-066, without its image", () => {
    const capture = { nodeId: "capture-1", type: "dataset.capture", status: "completed" };

    expect(sdkTraceSchema.safeParse({ ...trace, nodes: [capture] }).success).toBe(true);
    expect(
      sdkTraceSchema.safeParse({ ...trace, nodes: [{ ...capture, image: "aGVsbG8=" }] }).success,
    ).toBe(false);
  });

  it("rejects a node type no SDK runs", () => {
    const transform = { nodeId: "transform-1", type: "image.transform", status: "completed" };

    expect(sdkTraceSchema.safeParse({ ...trace, nodes: [transform] }).success).toBe(false);
  });
});
