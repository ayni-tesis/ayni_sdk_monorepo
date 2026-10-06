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

  it("accepts SemVer values and HTTP routes without their query strings", async () => {
    const { app, storeMock } = makeApp();
    const received = {
      ...trace,
      workflowVersion: "1.0.0-20261002",
      appVersion: "10.123.4567",
      sdkVersion: "2.1.0",
      datasetPartition: "2026-10-02",
      scenario: "GET /api/v1, GET /users/123, GET /app/v1, GET /api/items?sortKey=createdAt",
      condition: "session: expired",
      validity: "cookie: disabled",
      network: "password: unset.",
      incidents: ["session: active", "cookie: present"],
    };
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(received),
    });

    expect(response.status).toBe(201);
    expect(storeMock).toHaveBeenCalledWith("app-1", received, 90);
  });

  it("validates adversarial version text without regex backtracking", async () => {
    const { app } = makeApp();
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...trace, appVersion: `0.0.0-0.${"--.".repeat(1_000)}` }),
    });

    expect(response.status).toBe(201);
  });

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

  // US-073: the strict schema leaves no place for the input image, its bytes or
  // other raw input, at the top level or inside any nested object.
  it.each([
    { inputBytes: [137, 80, 78, 71] },
    { incidents: ["iVBORw0KGgoAAAANSUhEUgAAAAQAAAAE"] },
    { scenario: "data:image/png;base64,iVBORw0KGgo=" },
    { condition: "captura /9j/4AAQSkZJRgABAQ" },
    { input: { bytes: "iVBORw0KGgo=" } },
    { profile: { ...trace.profile, image: "iVBORw0KGgo=" } },
    { nodes: [{ nodeId: "input-1", type: "input.image", status: "completed", image: "AA==" }] },
    {
      models: [{ modelVersionId: "m-1", version: "1.0.0", sha256: "a".repeat(64), bytes: "AA==" }],
    },
    {
      measurements: [
        {
          name: "latency",
          value: 1,
          unit: "ms",
          method: "clock",
          source: "app",
          provenance: "clientReported",
          raw: [1, 2],
        },
      ],
    },
    { error: { category: "runtimeError", phase: "workflowExecution", message: "raw input" } },
    {
      outputs: {
        result: {
          type: "classification",
          nodeId: "node-1",
          label: "perro",
          confidence: 0.9,
          confidences: { perro: 0.9 },
          image: "iVBORw0KGgo=",
        },
      },
    },
    { outputs: { image: { type: "image", nodeId: "input-1", bytes: "iVBORw0KGgo=" } } },
  ])(
    "rejects the input image or raw input anywhere in the trace without storing it",
    async (fields) => {
      const { app, storeMock } = makeApp();
      const response = await app.request("/sdk/traces", {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...trace, ...fields }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "invalidTrace" });
      expect(storeMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { condition: "contacto: diego@example.com" },
    { scenario: "Authorization: Bearer abc.def.ghi" },
    { scenario: "Authorization: Basic YWxpY2U6cGFzcw==" },
    { scenario: "Authorization: Token opaque-value" },
    { scenario: "Cookie: session=opaque-value" },
    { scenario: "Set-Cookie: session=opaque-value; HttpOnly" },
    { scenario: "password: active" },
    { scenario: '{"sessionId":"opaque-value"}' },
    { scenario: '{"sessionCookie":"opaque-value"}' },
    { scenario: "dbPassword=opaque-value" },
    { scenario: '{"dbPassword":"opaque-value"}' },
    { scenario: "password=unset not-a-placeholder" },
    { scenario: "password=unset,not-a-placeholder" },
    { scenario: "password=unset;not-a-placeholder" },
    { scenario: "password=unset}not-a-placeholder" },
    { scenario: "session: expired secret-value" },
    { scenario: '{"password":"unset,not-a-placeholder"}' },
    { scenario: '{"password":"unset;not-a-placeholder"}' },
    { scenario: "ENCRYPTION_KEY=opaque-value" },
    { scenario: '{"encryptionKey":"opaque-value"}' },
    { scenario: '{"Authorization":"Basic YWxpY2U6cGFzcw=="}' },
    { scenario: `GET /api/v1?token=${SECRET}` },
    { scenario: "GET /blob?sv=2022&sig=opaque-value" },
    { scenario: "GET /api/v1?client_secret=opaque-value" },
    { scenario: "GET /api/v1?token=opaque-value" },
    { scenario: "GET /api/v1?clientSecret=opaque-value" },
    { scenario: "GET /api/v1?accessToken=opaque-value" },
    { scenario: "GET /api/v1?AWSSecret=opaque-value" },
    { scenario: "GET /api/v1?AWS_SECRET_ACCESS_KEY=opaque-value" },
    { scenario: "GET /api/v1?clientApiKey=opaque-value" },
    { scenario: '{"clientSecret":"opaque-value"}' },
    { scenario: '{"AWS_SECRET_ACCESS_KEY":"opaque-value"}' },
    { scenario: '{"clientApiKey":"opaque-value"}' },
    { scenario: "postgres://alice:opaque-value@127.0.0.1:5432/app" },
    { scenario: "redis://:opaque-value@127.0.0.1:6379" },
    { scenario: `GET /reset/${SECRET}` },
    { scenario: "212.555.0123" },
    { appVersion: "212.555.0123" },
    { workflowVersion: "1.0.0-212.555.0123" },
    {
      models: [
        { modelVersionId: "model-version-1", version: "212.555.0123", sha256: "a".repeat(64) },
      ],
    },
    { incidents: ["password=secret-value"] },
    { scenario: "C:\\Users\\diego\\client-secrets.json" },
    { scenario: "/etc/ssl/private/sdk.env" },
    { scenario: "artifact=/etc/ssl/private/sdk.env" },
    { scenario: "artifact=../../var/lib/ayni/state.json" },
    { scenario: "failed opening ../secrets/sdk.env" },
    { scenario: "file:///etc/ssl/private/sdk.env" },
    { scenario: "failed opening /run/secrets/db" },
    { validity: "ayni_sk_abcd1234rest-of-secret" },
    { validity: "sk_live_abc123secretvalue" },
    {
      outputs: {
        result: {
          type: "classification",
          nodeId: "node-1",
          label: "+51 987 654 321",
          confidence: 0.9,
          confidences: { cat: 0.9 },
        },
      },
    },
  ])("rejects sensitive client text without storing it", async (fields) => {
    const { app, storeMock } = makeApp();
    const response = await app.request("/sdk/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...trace, ...fields }),
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

  describe("segmentation outputs", () => {
    const segmentation = {
      type: "segmentation",
      nodeId: "node-1",
      width: 257,
      height: 257,
      confidence: 0.8,
      areaFractions: { background: 0.75, leaf: 0.25 },
    };
    const post = (app: ReturnType<typeof makeApp>["app"], result: unknown) =>
      app.request("/sdk/traces", {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...trace, outputs: { result } }),
      });

    it("accepts the summary without the mask", async () => {
      const { app, storeMock } = makeApp();
      const response = await post(app, segmentation);

      expect(response.status).toBe(201);
      expect(storeMock).toHaveBeenCalledWith(
        "app-1",
        { ...trace, outputs: { result: segmentation } },
        90,
      );
    });

    it("rejects the mask without storing it", async () => {
      const { app, storeMock } = makeApp();
      const response = await post(app, { ...segmentation, mask: [0, 1, 1, 0] });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "invalidTrace" });
      expect(storeMock).not.toHaveBeenCalled();
    });
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
