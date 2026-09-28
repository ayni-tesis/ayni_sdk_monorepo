import { createOpenApiDocument } from "@ayni/api";
import {
  SdkModelVersionManifestSchema,
  SdkSyncManifestSchema,
  SdkWorkflowVersionDefinitionSchema,
} from "@ayni/api/sdk-openapi";
import type { Hono } from "hono";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type { SdkModelVersionManifest } from "./model-version-store";
import {
  INVALID_CREDENTIAL_MESSAGE,
  SDK_CREDENTIAL_REVOKED_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";
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
    output: { type: "detection", labels: ["hoja"], scoreThreshold: 0.5 },
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
  app: (verify: Verify, found?: boolean) => Hono;
}[] = [
  {
    method: "post",
    path: "/sdk/sync",
    url: "/sdk/sync",
    schema: SdkSyncManifestSchema,
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
    app: (verify, found = true) =>
      createSdkModelVersionsApp({
        credentials: { verify },
        modelVersions: {
          getManifest: async () =>
            found ? { ok: true, manifest: modelManifest } : { ok: false, reason: "notFound" },
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

describe.each(endpoints.slice(1))("$method $path unavailable resource", (endpoint) => {
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
});

it("documents the same manifest types the stores return", () => {
  expectTypeOf<z.infer<typeof SdkSyncManifestSchema>>().toEqualTypeOf<SdkSyncManifest>();
  expectTypeOf<z.infer<typeof SdkModelVersionManifestSchema>>().toEqualTypeOf<{
    manifest: SdkModelVersionManifest;
  }>();
});
