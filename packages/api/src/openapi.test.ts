import { describe, expect, it } from "vitest";

import { createOpenApiDocument } from "./index";

type JsonObject = Record<string, unknown>;

const document = createOpenApiDocument() as unknown as JsonObject & {
  paths: Record<string, Record<string, JsonObject>>;
  components: { schemas: Record<string, JsonObject>; securitySchemes: Record<string, JsonObject> };
};

/** Follows a local `#/components/...` reference, or returns the schema as is. */
function resolve(schema: unknown): JsonObject {
  const ref = (schema as { $ref?: string }).$ref;
  if (!ref) return schema as JsonObject;
  const [, , section, name] = ref.split("/");
  return resolve(
    (document.components as Record<string, Record<string, unknown>>)[section ?? ""]?.[name ?? ""],
  );
}

function operation(path: string, method: string) {
  const found = document.paths[path]?.[method];
  if (!found) throw new Error(`${method} ${path} is not documented`);
  return found;
}

function jsonContent(path: string, method: string, status: string) {
  const responses = operation(path, method).responses as Record<string, JsonObject>;
  const content = responses[status]?.content as Record<string, JsonObject> | undefined;
  if (!content) throw new Error(`${method} ${path} documents no ${status} response`);
  return content["application/json"] as {
    schema: unknown;
    examples: Record<string, { value: unknown }>;
  };
}

const sdkOperations = [
  { method: "post", path: "/sdk/sync", notFound: undefined, extraErrors: [] },
  { method: "get", path: "/sdk/telemetry-policy", notFound: undefined, extraErrors: [] },
  { method: "get", path: "/sdk/collection-policy", notFound: undefined, extraErrors: [] },
  {
    method: "post",
    path: "/sdk/consents",
    notFound: undefined,
    extraErrors: [
      { status: "400", code: "invalidConsent" },
      { status: "409", code: "consentReceiptConflict" },
      { status: "503", code: "privacyNoticeUnavailable" },
    ],
  },
  {
    method: "post",
    path: "/sdk/traces",
    notFound: undefined,
    extraErrors: [
      { status: "400", code: "invalidTrace" },
      { status: "413", code: "traceTooLarge" },
      { status: "403", code: "telemetryDisabled" },
      { status: "409", code: "traceConflict" },
    ],
  },
  {
    method: "get",
    path: "/sdk/workflow-versions/{workflowVersionId}",
    notFound: "workflowVersionNotFound",
    extraErrors: [],
  },
  {
    method: "get",
    path: "/sdk/model-versions/{modelVersionId}/manifest",
    notFound: "modelVersionNotFound",
    extraErrors: [],
  },
] as const;

function errorCodes(path: string, method: string, status: string) {
  const content = jsonContent(path, method, status);
  const code = (resolve(content.schema).properties as Record<string, JsonObject>).code;
  return {
    schema: code?.enum,
    examples: Object.values(content.examples).map((example) => (example.value as JsonObject).code),
  };
}

describe.each(sdkOperations)("$method $path errors", ({ method, path, notFound, extraErrors }) => {
  it("rejects an invalid or revoked credential with 401 and its code", () => {
    expect(errorCodes(path, method, "401")).toEqual({
      schema: ["invalidCredential", "credentialRevoked"],
      examples: ["invalidCredential", "credentialRevoked"],
    });
  });

  it("lists each error status and code in a table in its description", () => {
    const description = String(document.paths[path]?.[method]?.description);
    const rows = description
      .split("\n")
      .filter((line) => /^\| `\d{3}` \|/.test(line))
      .map((line) =>
        line
          .split("|")
          .slice(1, 3)
          .map((cell) => cell.trim()),
      );

    expect(rows).toEqual([
      ["`401`", "`invalidCredential`"],
      ["`401`", "`credentialRevoked`"],
      ...(notFound ? [["`404`", `\`${notFound}\``]] : []),
      ...extraErrors.map(({ status, code }) => [`\`${status}\``, `\`${code}\``]),
    ]);
  });
});

describe("POST /sdk/traces", () => {
  it("describes a rejected oversized body", () => {
    const responses = operation("/sdk/traces", "post").responses as Record<string, JsonObject>;

    expect(responses["413"]?.description).toBe("El cuerpo supera el tamaño máximo permitido.");
  });
});

describe("POST /sdk/consents", () => {
  it("requires a strict receipt and returns the server acknowledgement", () => {
    const requestBody = operation("/sdk/consents", "post").requestBody as JsonObject;
    const content = requestBody.content as Record<string, JsonObject>;
    const requestSchema = resolve(content["application/json"]?.schema);
    const properties = requestSchema.properties as Record<string, JsonObject>;
    expect(Object.keys(properties).sort()).toEqual([
      "decidedAt",
      "decision",
      "noticeVersion",
      "purpose",
      "receiptId",
      "subjectId",
    ]);
    expect(properties.purpose?.enum).toEqual(["ayniModelImprovement", "ayniSdkImprovement"]);
    expect(properties.decision?.enum).toEqual(["accepted", "declined"]);
    const response = resolve(jsonContent("/sdk/consents", "post", "201").schema);
    expect(Object.keys(response.properties as Record<string, JsonObject>).sort()).toEqual([
      "receiptId",
      "receivedAt",
    ]);
  });

  it("does not answer a consent request with a resource-not-found response", () => {
    expect(document.paths["/sdk/consents"]?.post?.responses).not.toHaveProperty("404");
  });
});

describe.each(sdkOperations.filter((operation) => operation.notFound))(
  "$method $path unavailable resource",
  ({ method, path, notFound }) => {
    it("answers 404 with its not-found code", () => {
      expect(errorCodes(path, method, "404")).toEqual({ schema: [notFound], examples: [notFound] });
    });
  },
);

it("never answers POST /sdk/sync with 404", () => {
  expect(document.paths["/sdk/sync"]?.post?.responses).not.toHaveProperty("404");
});

describe("GET /sdk/telemetry-policy", () => {
  it("returns only the enabled flag and an allowed retention period", () => {
    const response = resolve(jsonContent("/sdk/telemetry-policy", "get", "200").schema);
    const properties = response.properties as Record<string, JsonObject>;

    expect(Object.keys(properties).sort()).toEqual(["enabled", "retentionDays"]);
    expect(properties.enabled?.type).toBe("boolean");
    expect(properties.retentionDays?.anyOf).toEqual([
      { type: "number", enum: [7] },
      { type: "number", enum: [30] },
      { type: "number", enum: [90] },
    ]);
    expect(response.additionalProperties).toBe(false);
  });
});

describe("GET /sdk/collection-policy", () => {
  it("returns the collection settings with the size and quality limits of the policy", () => {
    const response = resolve(jsonContent("/sdk/collection-policy", "get", "200").schema);
    const properties = response.properties as Record<string, JsonObject>;

    expect(Object.keys(properties).sort()).toEqual([
      "consentRequired",
      "enabled",
      "imageQuality",
      "maxImageSize",
      "network",
    ]);
    expect(properties.network?.enum).toEqual(["wifi", "wifiAndCellular"]);
    expect(properties.maxImageSize).toMatchObject({ type: "integer", minimum: 128, maximum: 4096 });
    expect(properties.imageQuality).toMatchObject({ type: "integer", minimum: 10, maximum: 100 });
    expect(response.additionalProperties).toBe(false);
  });
});

describe("GET /sdk/model-versions/{modelVersionId}/manifest", () => {
  it("allows a null contract for a version that has none yet", () => {
    const manifest = resolve(
      jsonContent("/sdk/model-versions/{modelVersionId}/manifest", "get", "200").schema,
    );
    const contract = (
      ((manifest.properties as Record<string, JsonObject>).manifest?.properties ?? {}) as Record<
        string,
        JsonObject
      >
    ).contract;

    expect(contract?.anyOf).toEqual([
      { $ref: "#/components/schemas/SdkModelVersionContract" },
      { type: "null" },
    ]);
  });
});

describe("curl request samples", () => {
  it.each([
    ["/sdk/sync", "post", "curl -X POST https://tu-servidor-ayni.example/sdk/sync"],
    ["/sdk/traces", "post", "curl -X POST https://tu-servidor-ayni.example/sdk/traces"],
    ["/sdk/telemetry-policy", "get", "curl https://tu-servidor-ayni.example/sdk/telemetry-policy"],
    [
      "/sdk/collection-policy",
      "get",
      "curl https://tu-servidor-ayni.example/sdk/collection-policy",
    ],
    [
      "/sdk/workflow-versions/{workflowVersionId}",
      "get",
      "curl https://tu-servidor-ayni.example/sdk/workflow-versions/5d2a7e91-8c3b-4f60-b1d4-9e8f7a6b5c4d",
    ],
    [
      "/sdk/model-versions/{modelVersionId}/manifest",
      "get",
      "curl https://tu-servidor-ayni.example/sdk/model-versions/c7e4b2a1-6d5f-4e3c-8b9a-1f2e3d4c5b6a/manifest",
    ],
  ])("shows %s with the ayni_sk_… placeholder, never a real secret", (path, method, request) => {
    const samples = document.paths[path]?.[method]?.["x-codeSamples"] as {
      lang: string;
      label: string;
      source: string;
    }[];

    expect(samples).toEqual([
      {
        lang: "sh",
        label: "cURL",
        source: `${request} \\\n  -H "Authorization: Bearer ayni_sk_…"`,
      },
    ]);
  });
});

describe("Autenticación section", () => {
  const description = String((document.info as JsonObject).description);
  const section = description.slice(description.indexOf("## Autenticación"));

  it("shows the header with the ayni_sk_… placeholder", () => {
    expect(section).toContain("Authorization: Bearer ayni_sk_…");
  });

  it("says where the credential is generated and what revoking it does", () => {
    expect(section).toContain("Credenciales SDK");
    expect(section).toMatch(/revoca[\s\S]*`credentialRevoked`/);
  });
});

describe("SDK credential security scheme", () => {
  it("describes an opaque bearer credential prefixed with ayni_sk_, not a JWT", () => {
    const [requirement] = operation("/sdk/sync", "post").security as JsonObject[];
    const scheme = document.components.securitySchemes[Object.keys(requirement ?? {})[0] ?? ""];

    expect(scheme).toMatchObject({ type: "http", scheme: "bearer" });
    expect(scheme?.bearerFormat).not.toMatch(/jwt/i);
    expect(scheme?.description).toMatch(/opaca/);
    expect(scheme?.description).toContain("`ayni_sk_`");
    expect(
      Object.values(document.components.securitySchemes).map((each) => each.bearerFormat),
    ).not.toContain("JWT");
  });
});

describe("POST /sdk/sync", () => {
  it("describes the 200 manifest with its workflows and models lists and an example", () => {
    const content = jsonContent("/sdk/sync", "post", "200");
    const schema = resolve(content.schema);

    expect(schema.required).toEqual(["workflows", "models"]);
    expect(Object.keys(schema.properties as JsonObject)).toEqual(["workflows", "models"]);
    const [example] = Object.values(content.examples);
    expect(example?.value).toMatchObject({
      workflows: [expect.objectContaining({ workflowVersionId: expect.any(String) })],
      models: [expect.objectContaining({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })],
    });
  });
});
