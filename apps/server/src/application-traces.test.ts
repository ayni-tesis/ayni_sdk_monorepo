import type { ApplicationTraceRecord } from "@ayni/api/application-traces";
import { describe, expect, it, vi } from "vitest";
import { createApplicationTracesApp } from "./application-traces";
import {
  type ApplicationTracePage,
  type ApplicationTraceRecordPage,
  InvalidApplicationTraceCursorError,
} from "./sdk-trace-store";

const traceId = "550e8400-e29b-41d4-a716-446655440001";
const otherTraceId = "550e8400-e29b-41d4-a716-446655440002";
const application = {
  id: "app-1",
  organizationId: "workspace-1",
  name: "Ayni",
  status: "active" as const,
};
const record: ApplicationTraceRecord = {
  source: "clientReported",
  receivedAt: "2026-10-02T12:01:00.000Z",
  expiresAt: "2026-11-01T12:01:00.000Z",
  trace: {
    traceSchemaVersion: 1,
    traceId,
    runId: "run-1",
    repetition: 1,
    installationId: "550e8400-e29b-41d4-a716-446655440000",
    timestamp: "2026-10-02T12:00:00.000Z",
    measurements: [
      {
        name: "inferencia",
        value: 12,
        unit: "ms",
        method: "clock",
        source: "client",
        provenance: "clientReported",
      },
    ],
    incidents: [],
    datasetSha256: "a".repeat(64),
    workflowId: "workflow-1",
    workflowVersionId: "workflow-version-1",
    workflowVersion: "1.0.0",
    models: [{ modelVersionId: "model-version-1", version: "1.2.0", sha256: "b".repeat(64) }],
    profile: { schemaVersion: 1, platform: "android", osVersion: "14", model: "Pixel" },
    status: "success",
    durationMs: 12,
    nodes: [],
    outputs: { resultado: { type: "boolean", nodeId: "node-1", value: true } },
    clientReportedFields: ["runId", "repetition", "datasetSha256"],
  },
};

function makeApp({
  userId = "user-1",
  isMember = true,
  getApplication = async () => application,
  list = async (): Promise<ApplicationTracePage> => ({ traces: [], nextCursor: null }),
  get = async (): Promise<ApplicationTraceRecord | undefined> => record,
  listRecords = async (): Promise<ApplicationTraceRecordPage> => ({
    records: [record],
    nextCursor: null,
  }),
}: {
  userId?: string | null;
  isMember?: boolean;
  getApplication?: () => Promise<typeof application | undefined>;
  list?: (query: {
    applicationId: string;
    cursor?: string;
    limit: number;
  }) => Promise<ApplicationTracePage>;
  get?: (applicationId: string, traceId: string) => Promise<ApplicationTraceRecord | undefined>;
  listRecords?: (query: {
    applicationId: string;
    cursor?: string;
    limit: number;
  }) => Promise<ApplicationTraceRecordPage>;
} = {}) {
  const applicationGet = vi.fn(getApplication);
  const membershipGet = vi.fn(async () => (isMember ? "member" : undefined));
  const listTraces = vi.fn(list);
  const getTrace = vi.fn(get);
  const listTraceRecords = vi.fn(listRecords);
  return {
    app: createApplicationTracesApp({
      getSession: async () => (userId ? { user: { id: userId } } : null),
      applications: { get: applicationGet, getMembership: membershipGet },
      traces: { list: listTraces, get: getTrace, listRecords: listTraceRecords },
    }),
    applicationGet,
    membershipGet,
    listTraces,
    getTrace,
    listTraceRecords,
  };
}

describe("application traces routes", () => {
  it("requires a session and application membership before reading traces", async () => {
    const anonymous = makeApp({ userId: null });
    const anonymousResponse = await anonymous.app.request("/applications/app-1/traces");
    expect(anonymousResponse.status).toBe(401);
    expect(anonymous.applicationGet).not.toHaveBeenCalled();

    const nonMember = makeApp({ isMember: false });
    const response = await nonMember.app.request("/applications/app-1/traces");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "No encontramos esta aplicación." });
    expect(nonMember.listTraces).not.toHaveBeenCalled();
  });

  it("lists member traces with a bounded page query", async () => {
    const { app, listTraces } = makeApp({
      list: async () => ({ traces: [], nextCursor: "next-page" }),
    });
    const response = await app.request("/applications/app-1/traces?limit=1&cursor=Y3Vyc29y");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ traces: [], nextCursor: "next-page" });
    expect(listTraces).toHaveBeenCalledWith({
      applicationId: "app-1",
      limit: 1,
      cursor: "Y3Vyc29y",
    });

    const invalid = await app.request("/applications/app-1/traces?limit=101");
    expect(invalid.status).toBe(400);
  });

  it("passes validated trace filters to the application-scoped query", async () => {
    const { app, listTraces } = makeApp();
    const response = await app.request(
      "/applications/app-1/traces?workflowId=workflow-1&modelId=model-1&modelVersionId=model-version-1&status=error&runId=run-1&repetition=2&backend=tflite",
    );
    expect(response.status).toBe(200);
    expect(listTraces).toHaveBeenCalledWith({
      applicationId: "app-1",
      limit: 50,
      workflowId: "workflow-1",
      modelId: "model-1",
      modelVersionId: "model-version-1",
      status: "error",
      runId: "run-1",
      repetition: 2,
      backend: "tflite",
    });
  });

  it("rejects an unsupported trace filter without querying the store", async () => {
    const { app, listTraces } = makeApp();
    const response = await app.request("/applications/app-1/traces?unknown=anything");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "La consulta de trazas no es válida." });
    expect(listTraces).not.toHaveBeenCalled();
  });

  it("rejects a malformed keyset cursor", async () => {
    const { app } = makeApp({
      list: async () => {
        throw new InvalidApplicationTraceCursorError();
      },
    });
    const response = await app.request("/applications/app-1/traces?cursor=Y3Vyc29y");
    expect(response.status).toBe(400);
  });

  it("returns the full strict record only while it is available", async () => {
    const { app, getTrace } = makeApp();
    const response = await app.request(`/applications/app-1/traces/${traceId}`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ record });
    expect(getTrace).toHaveBeenCalledWith("app-1", traceId);

    const missing = makeApp({ get: async () => undefined });
    expect((await missing.app.request(`/applications/app-1/traces/${otherTraceId}`)).status).toBe(
      404,
    );
  });

  it("rejects opening an execution error from another workspace without revealing it", async () => {
    const errorRecord: ApplicationTraceRecord = {
      ...record,
      trace: {
        ...record.trace,
        status: "error",
        error: { category: "runtimeError", phase: "workflowExecution", nodeId: "node-1" },
      },
    };
    const outsider = makeApp({ isMember: false, get: async () => errorRecord });
    const response = await outsider.app.request(`/applications/app-1/traces/${traceId}`);
    const unknown = makeApp({ getApplication: async () => undefined });
    const unknownResponse = await unknown.app.request(`/applications/app-9/traces/${traceId}`);

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain("runtimeError");
    expect(body).not.toContain(traceId);
    expect(unknownResponse.status).toBe(404);
    expect(await unknownResponse.text()).toBe(body);
    expect(outsider.getTrace).not.toHaveBeenCalled();
  });

  it("streams JSONL pages and preserves client values, provenance, and artifact hashes", async () => {
    const secondRecord = { ...record, trace: { ...record.trace, traceId: otherTraceId } };
    const listRecords = vi.fn(async ({ cursor }: { cursor?: string }) =>
      cursor
        ? { records: [secondRecord], nextCursor: null }
        : { records: [record], nextCursor: "next" },
    );
    const { app } = makeApp({ listRecords });
    const response = await app.request("/applications/app-1/traces/export");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([record, secondRecord]);
    expect(lines[0].source).toBe("clientReported");
    expect(lines[0].trace.measurements[0].provenance).toBe("clientReported");
    expect(lines[0].trace.models[0].sha256).toBe("b".repeat(64));
    expect(listRecords).toHaveBeenCalledTimes(2);
  });

  it("does not export traces to a non-member", async () => {
    const { app, listTraceRecords } = makeApp({ isMember: false });
    expect((await app.request("/applications/app-1/traces/export")).status).toBe(404);
    expect(listTraceRecords).not.toHaveBeenCalled();
  });
});
