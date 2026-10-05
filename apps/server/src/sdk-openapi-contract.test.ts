import { createOpenApiDocument } from "@ayni/api";
import { sdkCollectionPolicySchema } from "@ayni/api/sdk-collection-policy";
import {
  sdkEvidenceReceiptSchema,
  sdkEvidenceSchema,
  sdkEvidenceStartSchema,
} from "@ayni/api/sdk-evidence";
import {
  SdkModelVersionManifestSchema,
  SdkSyncManifestSchema,
  SdkWorkflowVersionDefinitionSchema,
} from "@ayni/api/sdk-openapi";
import type { Hono } from "hono";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type { SdkModelVersionManifest } from "./model-version-store";
import { createSdkCollectionPolicyApp } from "./sdk-collection-policy";
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
import { createSdkModelVersionsApp } from "./sdk-model-versions";
import { createSdkSyncApp } from "./sdk-sync";
import type { SdkSyncManifest } from "./sdk-sync-manifest-store";
import { createSdkWorkflowVersionsApp } from "./sdk-workflow-versions";

/**
 * The OpenAPI document (US-144) is written apart from the handlers, so these
 * tests run the real `/sdk/*` handlers and check their bodies against the
 * document's schemas and error examples.
 */
const document = createOpenApiDocument();
const SECRET = "ayni_sk_abcd1234rest-of-secret";

const syncManifest: SdkSyncManifest = {
  workflows: [
    {
      workflowId: "workflow-1",
      workflowVersionId: "workflow-version-1",
      name: "Clasificar hojas",
      version: "1.2.0",
      modelVersionIds: ["model-version-1"],
    },
  ],
  models: [{ modelVersionId: "model-version-1", version: "2.0.0", sha256: "a".repeat(64) }],
};
const workflowDefinition = {
  schemaVersion: "1",
  nodes: [
    { id: "imagen", type: "input.image", outputs: { imagen: "image" } },
    {
      id: "salida",
      type: "output",
      name: "Diagnóstico",
      sourceNodeId: "imagen",
      sourcePort: "imagen",
      resultType: "classification",
    },
  ],
  connections: [
    { sourceNodeId: "imagen", sourcePort: "imagen", targetNodeId: "salida", targetPort: "source" },
  ],
};
const modelManifest: SdkModelVersionManifest = {
  modelVersionId: "model-version-1",
  version: "2.0.0",
  sha256: "c".repeat(64),
  sizeBytes: 2048,
  downloadUrl: "https://signed.example/model.tflite",
  downloadUrlExpiresAt: "2026-09-21T01:00:00.000Z",
  contract: {
    input: { type: "image", width: 224, height: 224, channels: 3, normalization: "zero_to_one" },
    output: {
      type: "detection",
      labels: ["hoja"],
      scoreThreshold: 0.5,
      tensorIndices: { boxes: 2, classes: 0, scores: 3, count: 1 },
    },
  },
};

type Verify = (secret: string) => Promise<VerifySdkCredentialResult>;
const active: Verify = async () => ({
  ok: true,
  credential: { credentialId: "credential-1", applicationId: "application-1" },
});
const revoked: Verify = async () => ({
  ok: false,
  code: "credentialRevoked",
  message: SDK_CREDENTIAL_REVOKED_MESSAGE,
});
const unknown: Verify = async () => ({
  ok: false,
  code: "invalidCredential",
  message: INVALID_CREDENTIAL_MESSAGE,
});

const endpoints: {
  method: "get" | "post";
  path: string;
  url: string;
  schema: z.ZodType;
  /** Whether it answers 404 for a resource that is no longer available. */
  notFound: boolean;
  app: (verify: Verify, found?: boolean) => Hono;
}[] = [
  {
    method: "post",
    path: "/sdk/sync",
    url: "/sdk/sync",
    schema: SdkSyncManifestSchema,
    notFound: false,
    app: (verify) =>
      createSdkSyncApp({
        credentials: { verify },
        sync: { getManifest: async () => syncManifest },
      }),
  },
  {
    method: "get",
    path: "/sdk/workflow-versions/{workflowVersionId}",
    url: "/sdk/workflow-versions/workflow-version-1",
    schema: SdkWorkflowVersionDefinitionSchema,
    notFound: true,
    app: (verify, found = true) =>
      createSdkWorkflowVersionsApp({
        credentials: { verify },
        workflowVersions: {
          getDefinition: async () =>
            found
              ? { ok: true, definition: workflowDefinition }
              : { ok: false, reason: "notFound" },
        },
      }),
  },
  {
    method: "get",
    path: "/sdk/model-versions/{modelVersionId}/manifest",
    url: "/sdk/model-versions/model-version-1/manifest",
    schema: SdkModelVersionManifestSchema,
    notFound: true,
    app: (verify, found = true) =>
      createSdkModelVersionsApp({
        credentials: { verify },
        modelVersions: {
          getManifest: async () =>
            found ? { ok: true, manifest: modelManifest } : { ok: false, reason: "notFound" },
        },
      }),
  },
  {
    method: "get",
    path: "/sdk/collection-policy",
    url: "/sdk/collection-policy",
    schema: sdkCollectionPolicySchema,
    notFound: false,
    app: (verify) =>
      createSdkCollectionPolicyApp({
        credentials: { verify },
        policies: {
          get: async (applicationId) => ({
            applicationId,
            enabled: true,
            consentRequired: true,
            network: "wifi",
            maxImageSize: 1024,
            imageQuality: 80,
            updatedAt: null,
          }),
        },
      }),
  },
];

type DocumentedResponse = {
  content: { "application/json": { examples: Record<string, { value: unknown }> } };
};

/** The documented error examples of one endpoint and status, by `code`. */
function documentedErrors(path: string, method: string, status: string) {
  const operations = document.paths?.[path] as
    | Record<string, { responses: Record<string, DocumentedResponse> }>
    | undefined;
  const response = operations?.[method]?.responses[status];
  if (!response) throw new Error(`${method} ${path} documents no ${status} response`);
  return response.content["application/json"].examples;
}

async function send(app: Hono, method: string, url: string, authorization?: string) {
  const response = await app.request(url, {
    method: method.toUpperCase(),
    headers: authorization ? { Authorization: authorization } : {},
  });
  return { status: String(response.status), body: await response.json() };
}

describe.each(endpoints)("$method $path matches the OpenAPI document", (endpoint) => {
  const { method, path, url, schema } = endpoint;

  it("answers 200 with a body of the documented schema and nothing else", async () => {
    const { status, body } = await send(endpoint.app(active), method, url, `Bearer ${SECRET}`);

    expect(status).toBe("200");
    expect(schema.parse(body)).toEqual(body);
  });

  it.each([
    ["a missing credential", unknown, undefined, "invalidCredential"],
    ["a malformed credential", unknown, "Bearer invalid", "invalidCredential"],
    ["an unknown credential", unknown, `Bearer ${SECRET}`, "invalidCredential"],
    ["a revoked credential", revoked, `Bearer ${SECRET}`, "credentialRevoked"],
  ] as const)("answers %s with the documented 401 example", async (_, verify, header, code) => {
    const { status, body } = await send(endpoint.app(verify), method, url, header);

    expect(status).toBe("401");
    expect(body).toEqual(documentedErrors(path, method, "401")[code]?.value);
  });
});

describe.each(endpoints.filter((endpoint) => endpoint.notFound))(
  "$method $path unavailable resource",
  (endpoint) => {
    it("answers with the documented 404 example", async () => {
      const { method, path, url } = endpoint;
      const { status, body } = await send(
        endpoint.app(active, false),
        method,
        url,
        `Bearer ${SECRET}`,
      );
      const examples = Object.values(documentedErrors(path, method, "404"));

      expect(status).toBe("404");
      expect(examples).toHaveLength(1);
      expect(body).toEqual(examples[0]?.value);
    });
  },
);

it("documents the same manifest types the stores return", () => {
  expectTypeOf<z.infer<typeof SdkSyncManifestSchema>>().toEqualTypeOf<SdkSyncManifest>();
  expectTypeOf<z.infer<typeof SdkModelVersionManifestSchema>>().toEqualTypeOf<{
    manifest: SdkModelVersionManifest;
  }>();
});

describe("the evidence endpoints (US-070) match the OpenAPI document", () => {
  const evidenceId = "6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f";
  const evidenceBody = {
    evidenceSchemaVersion: 1,
    evidenceId,
    capturedAt: "2026-10-03T12:00:00.000Z",
    workflowId: "workflow-1",
    workflowVersionId: "workflow-version-1",
    workflowVersion: "1.0.0",
    captureNodeId: "captura",
    model: { modelVersionId: "model-version-1", version: "2.0.0", sha256: "a".repeat(64) },
    result: {
      type: "classification",
      nodeId: "modelo",
      label: "sana",
      confidence: 0.9,
      confidences: { sana: 0.9 },
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
  const received = { ok: true, receivedAt: "2026-10-03T12:01:00.000Z" } as const;

  function evidenceApp({
    verify = active,
    enabled = true,
    start = async (): Promise<StartSdkEvidenceResult> => ({
      ok: true,
      status: "uploadRequired",
      uploadUrl: "https://signed.example/staging/evidence.jpg",
      uploadUrlExpiresAt: "2026-10-03T12:16:00.000Z",
    }),
    complete = async (): Promise<CompleteSdkEvidenceResult> => received,
  }: {
    verify?: Verify;
    enabled?: boolean;
    start?: () => Promise<StartSdkEvidenceResult>;
    complete?: () => Promise<CompleteSdkEvidenceResult>;
  } = {}) {
    return createSdkEvidenceApp({
      credentials: { verify },
      policies: {
        get: async (applicationId) => ({
          applicationId,
          enabled,
          consentRequired: true,
          network: "wifi",
          maxImageSize: 1024,
          imageQuality: 80,
          updatedAt: null,
        }),
      },
      evidence: { start, complete },
    });
  }

  async function request(app: Hono, url: string, body?: unknown, authorization?: string) {
    const response = await app.request(url, {
      method: "POST",
      headers: {
        ...(authorization === undefined ? { Authorization: `Bearer ${SECRET}` } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: String(response.status), body: await response.json() };
  }

  const startUrl = "/sdk/evidence";
  const completeUrl = `/sdk/evidence/${evidenceId}/complete`;
  const completePath = "/sdk/evidence/{evidenceId}/complete";

  it("answers each 200 with a body of the documented schema", async () => {
    const upload = await request(evidenceApp(), startUrl, evidenceBody);
    const again = await request(
      evidenceApp({ start: async () => ({ ...received, status: "received" }) }),
      startUrl,
      evidenceBody,
    );
    const completed = await request(evidenceApp(), completeUrl);

    expect(sdkEvidenceSchema.parse(evidenceBody)).toEqual(evidenceBody);
    for (const { status, body } of [upload, again]) {
      expect(status).toBe("200");
      expect(sdkEvidenceStartSchema.parse(body)).toEqual(body);
    }
    expect(completed.status).toBe("200");
    expect(sdkEvidenceReceiptSchema.parse(completed.body)).toEqual(completed.body);
  });

  const cases: [
    string,
    string,
    string,
    string,
    () => Promise<{ status: string; body: unknown }>,
  ][] = [
    [
      startUrl,
      startUrl,
      "401",
      "invalidCredential",
      () => request(evidenceApp(), startUrl, evidenceBody, ""),
    ],
    [
      startUrl,
      startUrl,
      "401",
      "credentialRevoked",
      () => request(evidenceApp({ verify: revoked }), startUrl, evidenceBody),
    ],
    [
      startUrl,
      startUrl,
      "403",
      "collectionDisabled",
      () => request(evidenceApp({ enabled: false }), startUrl, evidenceBody),
    ],
    [
      startUrl,
      startUrl,
      "400",
      "invalidEvidence",
      () => request(evidenceApp(), startUrl, { ...evidenceBody, extra: true }),
    ],
    [
      startUrl,
      startUrl,
      "413",
      "evidenceTooLarge",
      () =>
        request(evidenceApp(), startUrl, {
          ...evidenceBody,
          image: { ...evidenceBody.image, byteSize: 64 * 1024 * 1024 },
        }),
    ],
    [
      startUrl,
      startUrl,
      "404",
      "evidenceSourceNotFound",
      () =>
        request(
          evidenceApp({ start: async () => ({ ok: false, reason: "sourceNotFound" }) }),
          startUrl,
          evidenceBody,
        ),
    ],
    [
      startUrl,
      startUrl,
      "409",
      "evidenceConflict",
      () =>
        request(
          evidenceApp({ start: async () => ({ ok: false, reason: "conflict" }) }),
          startUrl,
          evidenceBody,
        ),
    ],
    [
      completePath,
      completeUrl,
      "401",
      "invalidCredential",
      () => request(evidenceApp({ verify: unknown }), completeUrl),
    ],
    [
      completePath,
      completeUrl,
      "401",
      "credentialRevoked",
      () => request(evidenceApp({ verify: revoked }), completeUrl),
    ],
    [
      completePath,
      completeUrl,
      "403",
      "collectionDisabled",
      () => request(evidenceApp({ enabled: false }), completeUrl),
    ],
    [
      completePath,
      completeUrl,
      "404",
      "evidenceNotFound",
      () =>
        request(
          evidenceApp({ complete: async () => ({ ok: false, reason: "notFound" }) }),
          completeUrl,
        ),
    ],
    [
      completePath,
      completeUrl,
      "409",
      "evidenceImageMissing",
      () =>
        request(
          evidenceApp({ complete: async () => ({ ok: false, reason: "imageMissing" }) }),
          completeUrl,
        ),
    ],
    [
      completePath,
      completeUrl,
      "400",
      "invalidEvidenceImage",
      () =>
        request(
          evidenceApp({ complete: async () => ({ ok: false, reason: "invalidImage" }) }),
          completeUrl,
        ),
    ],
  ];

  it.each(cases)(
    "%s answers %s %s %s with its documented example",
    async (path, _, status, code, send) => {
      const response = await send();

      expect(response.status).toBe(status);
      expect(response.body).toEqual(documentedErrors(path, "post", status)[code]?.value);
    },
  );

  it("documents exactly the errors the handlers answer", () => {
    for (const path of [startUrl, completePath]) {
      const operations = document.paths?.[path] as
        | { post: { responses: Record<string, unknown> } }
        | undefined;
      const documented = Object.entries(operations?.post.responses ?? {})
        .filter(([status]) => status !== "200")
        .flatMap(([status]) =>
          Object.keys(documentedErrors(path, "post", status)).map((code) => `${status} ${code}`),
        )
        .sort();
      const tested = cases
        .filter(([casePath]) => casePath === path)
        .map(([, , status, code]) => `${status} ${code}`)
        .sort();

      expect(documented).toEqual(tested);
    }
  });
});
