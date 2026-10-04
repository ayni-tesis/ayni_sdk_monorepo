import {
  EVIDENCE_IMAGE_MAX_BYTES,
  SDK_EVIDENCE_MAX_BYTES,
  type SdkEvidence,
} from "@ayni/api/sdk-evidence";
import { describe, expect, it, vi } from "vitest";
import type { CollectionPolicy } from "./collection-policy-store";
import {
  INVALID_CREDENTIAL_MESSAGE,
  SDK_CREDENTIAL_REVOKED_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";
import {
  type CompleteSdkEvidenceResult,
  createSdkEvidenceApp,
  type StartSdkEvidenceResult,
} from "./sdk-evidence";

const SECRET = "ayni_sk_abcd1234rest-of-secret";
const EVIDENCE_ID = "6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f";

const evidence: SdkEvidence = {
  evidenceSchemaVersion: 1,
  evidenceId: EVIDENCE_ID,
  capturedAt: "2026-10-03T12:00:00.000Z",
  workflowId: "workflow-1",
  workflowVersionId: "workflow-version-1",
  workflowVersion: "1.0.0",
  captureNodeId: "capture-1",
  model: { modelVersionId: "model-version-1", version: "2.0.0", sha256: "a".repeat(64) },
  result: {
    type: "classification",
    nodeId: "model-1",
    label: "sana",
    confidence: 0.9,
    confidences: { sana: 0.9, enferma: 0.1 },
  },
  image: {
    mediaType: "image/jpeg",
    width: 640,
    height: 480,
    maxImageSize: 1024,
    imageQuality: 80,
    byteSize: 2048,
    sha256: "b".repeat(64),
  },
};

const enabledPolicy: CollectionPolicy = {
  applicationId: "app-1",
  enabled: true,
  consentRequired: true,
  network: "wifi",
  maxImageSize: 1024,
  imageQuality: 80,
  updatedAt: null,
};

function makeApp({
  verify = async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "cred-1", applicationId: "app-1" },
  }),
  enabled = true,
  start = async (): Promise<StartSdkEvidenceResult> => ({
    ok: true,
    status: "uploadRequired",
    uploadUrl: "https://storage.example/staging/evidence.jpg?signature=x",
    uploadUrlExpiresAt: "2026-10-03T12:15:00.000Z",
  }),
  complete = async (): Promise<CompleteSdkEvidenceResult> => ({
    ok: true,
    receivedAt: "2026-10-03T12:01:00.000Z",
  }),
}: {
  verify?: () => Promise<VerifySdkCredentialResult>;
  enabled?: boolean;
  start?: () => Promise<StartSdkEvidenceResult>;
  complete?: () => Promise<CompleteSdkEvidenceResult>;
} = {}) {
  const startMock = vi.fn(start);
  const completeMock = vi.fn(complete);
  const getPolicy = vi.fn(async (applicationId: string) => ({
    ...enabledPolicy,
    applicationId,
    enabled,
  }));
  return {
    app: createSdkEvidenceApp({
      credentials: { verify },
      policies: { get: getPolicy },
      evidence: { start: startMock, complete: completeMock },
    }),
    startMock,
    completeMock,
    getPolicy,
  };
}

function post(
  app: ReturnType<typeof makeApp>["app"],
  path: string,
  body?: unknown,
  authorization: string | null = `Bearer ${SECRET}`,
) {
  return app.request(path, {
    method: "POST",
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /sdk/evidence (US-070)", () => {
  it("saves the evidence for the credential's application and answers where to upload its image", async () => {
    const { app, startMock, getPolicy } = makeApp();

    const response = await post(app, "/sdk/evidence", evidence);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      evidenceId: EVIDENCE_ID,
      status: "uploadRequired",
      uploadUrl: "https://storage.example/staging/evidence.jpg?signature=x",
      uploadUrlExpiresAt: "2026-10-03T12:15:00.000Z",
    });
    expect(getPolicy).toHaveBeenCalledWith("app-1");
    expect(startMock).toHaveBeenCalledWith("app-1", evidence);
  });

  it("confirms an evidence the server already received, without a new upload", async () => {
    const { app } = makeApp({
      start: async () => ({
        ok: true,
        status: "received",
        receivedAt: "2026-10-03T12:01:00.000Z",
      }),
    });

    const response = await post(app, "/sdk/evidence", evidence);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      evidenceId: EVIDENCE_ID,
      status: "received",
      receivedAt: "2026-10-03T12:01:00.000Z",
    });
  });

  it.each([
    ["no credential", null, "invalidCredential", INVALID_CREDENTIAL_MESSAGE],
    ["a malformed credential", "Bearer nope", "invalidCredential", INVALID_CREDENTIAL_MESSAGE],
  ])("rejects %s before reading the evidence", async (_, header, code, message) => {
    const { app, startMock } = makeApp();

    const response = await post(app, "/sdk/evidence", evidence, header);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message, code });
    expect(startMock).not.toHaveBeenCalled();
  });

  it("rejects a revoked credential and saves nothing", async () => {
    const { app, startMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      }),
    });

    const response = await post(app, "/sdk/evidence", evidence);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      code: "credentialRevoked",
    });
    expect(startMock).not.toHaveBeenCalled();
  });

  it("rejects evidence while the application's collection policy is disabled", async () => {
    const { app, startMock } = makeApp({ enabled: false });

    const response = await post(app, "/sdk/evidence", evidence);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "La recolección de evidencia de esta aplicación está deshabilitada.",
      code: "collectionDisabled",
    });
    expect(startMock).not.toHaveBeenCalled();
  });

  it.each([
    ["is not JSON", "{"],
    ["has an extra field", { ...evidence, applicationId: "app-2" }],
    ["is not a UUID", { ...evidence, evidenceId: "evidence-1" }],
    ["is not a JPEG", { ...evidence, image: { ...evidence.image, mediaType: "image/png" } }],
    [
      "is larger than the size it was optimized for",
      { ...evidence, image: { ...evidence.image, width: 2000 } },
    ],
    [
      "has a boolean result",
      { ...evidence, result: { type: "boolean", nodeId: "c", value: true } },
    ],
  ])("rejects evidence that %s", async (_, body) => {
    const { app, startMock } = makeApp();

    const response = await post(app, "/sdk/evidence", body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "La evidencia no tiene un formato válido.",
      code: "invalidEvidence",
    });
    expect(startMock).not.toHaveBeenCalled();
  });

  it("rejects an image larger than the server accepts", async () => {
    const { app, startMock } = makeApp();

    const response = await post(app, "/sdk/evidence", {
      ...evidence,
      image: { ...evidence.image, byteSize: EVIDENCE_IMAGE_MAX_BYTES + 1 },
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      message: "La evidencia supera el tamaño máximo permitido.",
      code: "evidenceTooLarge",
    });
    expect(startMock).not.toHaveBeenCalled();
  });

  it("rejects a body larger than the metadata limit", async () => {
    const { app, startMock } = makeApp();

    const response = await post(app, "/sdk/evidence", {
      ...evidence,
      captureNodeId: "x".repeat(SDK_EVIDENCE_MAX_BYTES),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "evidenceTooLarge" });
    expect(startMock).not.toHaveBeenCalled();
  });

  it("rejects evidence of a workflow, capture or model outside the credential's application", async () => {
    const { app } = makeApp({ start: async () => ({ ok: false, reason: "sourceNotFound" }) });

    const response = await post(app, "/sdk/evidence", evidence);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "La evidencia no corresponde a un workflow publicado de esta aplicación.",
      code: "evidenceSourceNotFound",
    });
  });

  it("rejects an evidence ID already used with other data", async () => {
    const { app } = makeApp({ start: async () => ({ ok: false, reason: "conflict" }) });

    const response = await post(app, "/sdk/evidence", evidence);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: "El ID de evidencia ya se usó con otros datos.",
      code: "evidenceConflict",
    });
  });
});

describe("POST /sdk/evidence/:evidenceId/complete (US-070)", () => {
  const path = `/sdk/evidence/${EVIDENCE_ID}/complete`;

  it("confirms the evidence once the server checked and saved its image", async () => {
    const { app, completeMock } = makeApp();

    const response = await post(app, path);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      evidenceId: EVIDENCE_ID,
      status: "received",
      receivedAt: "2026-10-03T12:01:00.000Z",
    });
    expect(completeMock).toHaveBeenCalledWith("app-1", EVIDENCE_ID);
  });

  it("rejects a revoked credential and confirms nothing", async () => {
    const { app, completeMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      }),
    });

    const response = await post(app, path);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "credentialRevoked" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("confirms nothing while the collection policy is disabled", async () => {
    const { app, completeMock } = makeApp({ enabled: false });

    const response = await post(app, path);

    expect(response.status).toBe(403);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("answers 404 for an ID that is not a UUID without looking it up", async () => {
    const { app, completeMock } = makeApp();

    const response = await post(app, "/sdk/evidence/evidence-1/complete");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "evidenceNotFound" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "notFound",
      404,
      {
        message: "No encontramos esta evidencia.",
        code: "evidenceNotFound",
      },
    ],
    [
      "imageMissing",
      409,
      {
        message: "La imagen de la evidencia todavía no se subió.",
        code: "evidenceImageMissing",
      },
    ],
    [
      "invalidImage",
      400,
      {
        message: "La imagen no coincide con la evidencia.",
        code: "invalidEvidenceImage",
      },
    ],
  ] as const)("answers %s", async (reason, status, body) => {
    const { app } = makeApp({ complete: async () => ({ ok: false, reason }) });

    const response = await post(app, path);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
  });
});
