import type { SdkWorkflowTrace } from "@ayni/api/sdk-trace";
import { SDK_TRACE_MAX_BYTES } from "@ayni/api/sdk-trace";
import { describe, expect, it, vi } from "vitest";
import {
  SDK_CREDENTIAL_REVOKED_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";
import { createSdkTracesApp } from "./sdk-traces";

const SECRET = "ayni_sk_abcd1234rest-of-secret";
const trace: SdkWorkflowTrace = {
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

function makeApp({
  verify = async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "cred-1", applicationId: "app-1" },
  }),
  enabled = true,
  store = async (_applicationId: string, received: typeof trace, retentionDays: 7 | 30 | 90) => ({
    ok: true as const,
    traceId: received.traceId,
    receivedAt: "2026-10-02T12:01:00.000Z",
    retentionDays,
  }),
}: {
  verify?: () => Promise<VerifySdkCredentialResult>;
  enabled?: boolean;
  store?: (
    applicationId: string,
    receivedTrace: typeof trace,
    retentionDays: 7 | 30 | 90,
  ) => Promise<
    | { ok: true; traceId: string; receivedAt: string; retentionDays: 7 | 30 | 90 }
    | { ok: false; reason: "conflict" }
  >;
} = {}) {
  const verifyMock = vi.fn(verify);
  const getPolicy = vi.fn(async (applicationId: string) => ({
    applicationId,
    enabled,
    retentionDays: 90 as const,
    updatedAt: null,
  }));
  const storeMock = vi.fn(store);
  return {
    app: createSdkTracesApp({
      credentials: { verify: verifyMock },
      policies: { get: getPolicy },
      traces: { store: storeMock },
    }),
    verifyMock,
    getPolicy,
    storeMock,
  };
}

describe("POST /sdk/traces", () => {
  it("stores a trace for the credential's application and confirms it", async () => {
    const { app, getPolicy, storeMock } = makeApp();
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(trace),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      traceId: trace.traceId,
      receivedAt: "2026-10-02T12:01:00.000Z",
    });
    expect(getPolicy).toHaveBeenCalledWith("app-1");
    expect(storeMock).toHaveBeenCalledWith("app-1", trace, 90);
  });

  it.each(["control", "treatment"])(
    "accepts %s traces through the same ingestion schema",
    async (condition) => {
      const { app, storeMock } = makeApp();
      const received = { ...trace, condition };
      const response = await app.request("/sdk/traces", {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify(received),
      });

      expect(response.status).toBe(201);
      expect(storeMock).toHaveBeenCalledWith("app-1", received, 90);
    },
  );

  it("accepts a full classification confidence map within the body cap", async () => {
    const { app, storeMock } = makeApp();
    const confidences = Object.fromEntries(
      Array.from({ length: 1001 }, (_, index) => [
        `${String(index).padStart(4, "0")}${"\u0800".repeat(252)}`,
        0.5,
      ]),
    );
    const received = {
      ...trace,
      outputs: {
        result: {
          type: "classification",
          nodeId: "node-1",
          label: "class-0",
          confidence: 0.5,
          confidences,
        },
      },
    };
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(received),
    });

    expect(response.status).toBe(201);
    expect(storeMock).toHaveBeenCalledWith("app-1", received, 90);
  });

  it("accepts client-reported strings and collections within the body cap", async () => {
    const { app, storeMock } = makeApp();
    const received = {
      ...trace,
      runId: "r".repeat(129),
      measurements: Array.from({ length: 51 }, () => ({
        name: "m".repeat(257),
        value: 1,
        unit: "ms",
        method: "clock",
        source: "client",
        provenance: "clientReported" as const,
      })),
    };
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(received),
    });

    expect(response.status).toBe(201);
    expect(storeMock).toHaveBeenCalledWith("app-1", received, 90);
  });

  it("rejects binary or untyped fields without storing them", async () => {
    const { app, storeMock } = makeApp();
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...trace, image: "base64" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalidTrace" });
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("rejects arbitrary tensor-shaped output values", async () => {
    const { app, storeMock } = makeApp();
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...trace, outputs: { result: { tensor: [1, 2, 3] } } }),
    });

    expect(response.status).toBe(400);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("rejects request bodies over 2 MiB", async () => {
    const { app, storeMock } = makeApp();
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...trace, condition: "x".repeat(SDK_TRACE_MAX_BYTES) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "traceTooLarge" });
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("does not store a trace while the application policy is disabled", async () => {
    const { app, storeMock } = makeApp({ enabled: false });
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(trace),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "telemetryDisabled" });
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("preserves idempotent conflicts as an explicit rejection", async () => {
    const { app } = makeApp({
      store: async () => ({ ok: false, reason: "conflict" }),
    });
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(trace),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "traceConflict" });
  });

  it("does not query policy for a revoked credential", async () => {
    const { app, getPolicy, storeMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      }),
    });
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(trace),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "credentialRevoked" });
    expect(getPolicy).not.toHaveBeenCalled();
    expect(storeMock).not.toHaveBeenCalled();
  });
});
