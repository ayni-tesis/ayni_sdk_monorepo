import {
  extendZodWithOpenApi,
  type OpenAPIRegistry,
  type ResponseConfig,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const SdkSyncWorkflowSchema = z
  .object({
    workflowId: z.string().describe("Identificador del workflow."),
    workflowVersionId: z
      .string()
      .describe("Versión publicada que el SDK descarga con `GET /sdk/workflow-versions/{id}`."),
    name: z.string().describe("Nombre del workflow en el dashboard."),
    version: z.string().describe("Versión publicada, por ejemplo `1.2.0`."),
    modelVersionIds: z
      .array(z.string())
      .describe("Versiones de modelo que usa esta versión; todas están en `models`."),
  })
  .openapi("SdkSyncWorkflow");

export const SdkSyncModelSchema = z
  .object({
    modelVersionId: z.string().describe("Identificador de la versión del modelo."),
    version: z.string().describe("Versión del modelo, por ejemplo `2.0.0`."),
    sha256: z.string().describe("Hash SHA-256 del archivo del modelo, en hexadecimal."),
  })
  .openapi("SdkSyncModel");

export const SdkSyncManifestSchema = z
  .object({
    workflows: z
      .array(SdkSyncWorkflowSchema)
      .describe(
        "La última versión publicada de cada workflow no archivado cuyas dependencias están disponibles.",
      ),
    models: z
      .array(SdkSyncModelSchema)
      .describe("Las versiones de modelo que usan los workflows de la lista."),
  })
  .openapi("SdkSyncManifest");

export const SdkWorkflowNodeSchema = z
  .object({
    id: z.string().describe("Identificador del nodo dentro del workflow."),
    type: z
      .enum(["input.image", "model.tflite", "condition", "output"])
      .describe("Tipo de nodo; los demás campos dependen del tipo."),
  })
  .loose()
  .openapi("SdkWorkflowNode");

export const SdkWorkflowConnectionSchema = z
  .object({
    sourceNodeId: z.string(),
    sourcePort: z.string(),
    targetNodeId: z.string(),
    targetPort: z.string(),
  })
  .openapi("SdkWorkflowConnection");

export const SdkWorkflowVersionDefinitionSchema = z
  .object({
    schemaVersion: z.string(),
    nodes: z.array(SdkWorkflowNodeSchema),
    connections: z.array(SdkWorkflowConnectionSchema),
  })
  .openapi("SdkWorkflowVersionDefinition");

export const SdkModelVersionContractSchema = z
  .object({
    input: z.object({
      type: z.literal("image"),
      width: z.number().int(),
      height: z.number().int(),
      channels: z.union([z.literal(1), z.literal(3), z.literal(4)]),
      normalization: z.enum(["none", "zero_to_one", "minus_one_to_one"]),
    }),
    output: z.discriminatedUnion("type", [
      z.object({ type: z.literal("classification"), labels: z.array(z.string()) }),
      z.object({
        type: z.literal("detection"),
        labels: z.array(z.string()),
        scoreThreshold: z.number(),
      }),
    ]),
  })
  .openapi("SdkModelVersionContract");

export const SdkModelVersionManifestSchema = z
  .object({
    manifest: z.object({
      modelVersionId: z.string(),
      version: z.string(),
      sha256: z.string().describe("Hash SHA-256 del archivo, en hexadecimal; el SDK lo verifica."),
      sizeBytes: z.number().int().describe("Tamaño del archivo en bytes."),
      downloadUrl: z
        .string()
        .describe("URL firmada para descargar el archivo; vence en `downloadUrlExpiresAt`."),
      downloadUrlExpiresAt: z
        .string()
        .describe("Vencimiento de `downloadUrl` (ISO 8601), una hora después de la solicitud."),
      // A union, not `.nullable()`: zod-to-openapi 8.5 drops `null` from a nullable `$ref`.
      contract: z
        .union([SdkModelVersionContractSchema, z.null()])
        .describe("Entrada y salida del modelo, o `null` si la versión aún no tiene contrato."),
    }),
  })
  .openapi("SdkModelVersionManifest");

const modelVersionId = "c7e4b2a1-6d5f-4e3c-8b9a-1f2e3d4c5b6a";
const workflowVersionId = "5d2a7e91-8c3b-4f60-b1d4-9e8f7a6b5c4d";
const sha256 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const contract = {
  input: { type: "image", width: 224, height: 224, channels: 3, normalization: "zero_to_one" },
  output: { type: "classification", labels: ["sana", "enferma"] },
} satisfies z.infer<typeof SdkModelVersionContractSchema>;

const syncManifestExample = {
  workflows: [
    {
      workflowId: "0b9f3c8e-2f4d-4c11-9a57-6f1e2d3c4b5a",
      workflowVersionId,
      name: "Clasificar hojas",
      version: "1.2.0",
      modelVersionIds: [modelVersionId],
    },
  ],
  models: [{ modelVersionId, version: "2.0.0", sha256 }],
} satisfies z.infer<typeof SdkSyncManifestSchema>;

const workflowDefinitionExample = {
  schemaVersion: "1",
  nodes: [
    { id: "imagen", type: "input.image", outputs: { imagen: "image" } },
    {
      id: "modelo",
      type: "model.tflite",
      modelVersionId,
      modelName: "Hojas",
      version: "2.0.0",
      inputs: { image: contract.input },
      outputs: { result: contract.output },
    },
    {
      id: "salida",
      type: "output",
      name: "Diagnóstico",
      sourceNodeId: "modelo",
      sourcePort: "result",
      resultType: "classification",
    },
  ],
  connections: [
    { sourceNodeId: "imagen", sourcePort: "imagen", targetNodeId: "modelo", targetPort: "image" },
  ],
} satisfies z.infer<typeof SdkWorkflowVersionDefinitionSchema>;

const modelManifestExample = {
  manifest: {
    modelVersionId,
    version: "2.0.0",
    sha256,
    sizeBytes: 4_194_304,
    downloadUrl: "https://almacenamiento.example/modelos/hojas-2.0.0.tflite?firma=…",
    downloadUrlExpiresAt: "2026-09-27T15:00:00.000Z",
    contract,
  },
} satisfies z.infer<typeof SdkModelVersionManifestSchema>;

/** An error an SDK endpoint answers with: its status, `code`, `message`, and cause. */
type SdkError = { status: "401" | "404"; code: string; message: string; cause: string };

function credentialErrors(revokedMessage: string): SdkError[] {
  return [
    {
      status: "401",
      code: "invalidCredential",
      message: "La credencial no es válida.",
      cause:
        "Falta el encabezado `Authorization`, el secreto no tiene el formato `ayni_sk_…`, no corresponde a ninguna credencial o la aplicación de la credencial está archivada.",
    },
    {
      status: "401",
      code: "credentialRevoked",
      message: revokedMessage,
      cause: "Un administrador revocó o regeneró la credencial.",
    },
  ];
}

/** The error responses of one endpoint, one schema and one example per `code`. */
function errorResponses(errors: SdkError[]): Record<string, ResponseConfig> {
  const statuses = [...new Set(errors.map(({ status }) => status))];
  return Object.fromEntries(
    statuses.map((status) => {
      const ofStatus = errors.filter((error) => error.status === status);
      const codes = ofStatus.map(({ code }) => code) as [string, ...string[]];
      return [
        status,
        {
          description:
            status === "401" ? "Credencial no válida o revocada." : "Recurso no disponible.",
          content: {
            "application/json": {
              schema: z.object({
                message: z.string().describe("Mensaje en español para mostrar o registrar."),
                code: z.enum(codes).describe("Código estable para decidir qué hacer."),
              }),
              examples: Object.fromEntries(
                ofStatus.map(({ code, message, cause }) => [
                  code,
                  { description: cause, value: { message, code } },
                ]),
              ),
            },
          },
        },
      ];
    }),
  );
}

/** An endpoint's description: what it does, then a table of its errors. */
function describeWithErrors(summary: string, errors: SdkError[]) {
  return [
    summary,
    "",
    "## Errores",
    "",
    "| Estado | `code` | `message` | Cuándo ocurre |",
    "| --- | --- | --- | --- |",
    ...errors.map(
      ({ status, code, message, cause }) =>
        `| \`${status}\` | \`${code}\` | ${message} | ${cause} |`,
    ),
  ].join("\n");
}

/** The overview of the API: what the SDK endpoints are for and how they authenticate. */
export const sdkApiDescription = [
  "Endpoints HTTP que usa el SDK de Ayni para sincronizar workflows y modelos.",
  "",
  "## Autenticación",
  "",
  "Cada solicitud lleva el secreto de una credencial del SDK en el encabezado:",
  "",
  "```http",
  "Authorization: Bearer ayni_sk_…",
  "```",
  "",
  "- Un administrador genera la credencial en el dashboard, en Credenciales SDK de la " +
    "aplicación. El secreto se muestra una sola vez.",
  "- La credencial solo da acceso a los recursos de su aplicación.",
  "- Cuando un administrador revoca o regenera la credencial, estos endpoints responden " +
    "`401` con `credentialRevoked`. Revocarla no borra workflows, modelos ni versiones, ni " +
    "lo que ya está instalado en los dispositivos.",
].join("\n");

/** The server URL of the SDK examples (`packages/sdk_flutter/example/`). */
const exampleServerUrl = "https://tu-servidor-ayni.example";

/**
 * A `curl` request with the `ayni_sk_…` placeholder. Authored because the
 * generated snippets of the docs site would show `Bearer <token>`.
 */
function curlSample(method: "get" | "post", path: string) {
  const request = `curl ${method === "post" ? "-X POST " : ""}${exampleServerUrl}${path}`;
  return [
    {
      lang: "sh",
      label: "cURL",
      source: `${request} \\\n  -H "Authorization: Bearer ayni_sk_…"`,
    },
  ];
}

/** Registers the endpoints the SDK calls, authenticated with an SDK credential. */
export function registerSdkRoutes(registry: OpenAPIRegistry) {
  const sdkCredential = registry.registerComponent("securitySchemes", "sdkCredential", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "ayni_sk_…",
    description:
      "Secreto de una credencial del SDK: una cadena opaca que empieza por `ayni_sk_`, no un JWT. " +
      "El servidor no lee nada dentro del secreto; lo compara con el hash de las credenciales " +
      "activas de la aplicación.",
  });
  const security = [{ [sdkCredential.name]: [] }];
  const revokedMessage = "La credencial fue revocada. Genera una nueva credencial para continuar.";

  const syncErrors = credentialErrors(
    "La credencial fue revocada. Genera una nueva credencial para sincronizar.",
  );
  registry.registerPath({
    method: "post",
    path: "/sdk/sync",
    tags: ["Endpoints"],
    // The operation ids name the pages of the docs site's HTTP reference.
    operationId: "sincronizar",
    summary: "Obtener el manifiesto de sincronización",
    description: describeWithErrors(
      "Devuelve lo que tiene publicado la aplicación de la credencial: la última versión de " +
        "cada workflow no archivado y las versiones de modelo que usa. Un workflow que usa un " +
        "modelo que ya no está disponible no aparece. La solicitud no lleva cuerpo.",
      syncErrors,
    ),
    security,
    "x-codeSamples": curlSample("post", "/sdk/sync"),
    responses: {
      "200": {
        description: "Manifiesto de workflows y modelos publicados de la aplicación.",
        content: {
          "application/json": {
            schema: SdkSyncManifestSchema,
            examples: {
              manifiesto: { summary: "Un workflow con un modelo", value: syncManifestExample },
            },
          },
        },
      },
      ...errorResponses(syncErrors),
    },
  });

  const workflowVersionErrors: SdkError[] = [
    ...credentialErrors(revokedMessage),
    {
      status: "404",
      code: "workflowVersionNotFound",
      message: "El workflow ya no está disponible.",
      cause: "La versión no existe, es de otra aplicación o su workflow está archivado.",
    },
  ];
  registry.registerPath({
    method: "get",
    path: "/sdk/workflow-versions/{workflowVersionId}",
    tags: ["Endpoints"],
    operationId: "descargar-version-de-workflow",
    summary: "Descargar una versión de workflow",
    description: describeWithErrors(
      "Devuelve la definición de una versión publicada: sus nodos y sus conexiones. Una " +
        "versión publicada no cambia nunca.",
      workflowVersionErrors,
    ),
    security,
    "x-codeSamples": curlSample("get", `/sdk/workflow-versions/${workflowVersionId}`),
    request: {
      params: z.object({
        workflowVersionId: z
          .string()
          .describe("Versión publicada, tal como la lista `POST /sdk/sync`.")
          .openapi({ example: workflowVersionId }),
      }),
    },
    responses: {
      "200": {
        description: "Definición inmutable de la versión publicada.",
        content: {
          "application/json": {
            schema: SdkWorkflowVersionDefinitionSchema,
            examples: {
              definicion: {
                summary: "Imagen, modelo y salida",
                value: workflowDefinitionExample,
              },
            },
          },
        },
      },
      ...errorResponses(workflowVersionErrors),
    },
  });

  const modelVersionErrors: SdkError[] = [
    ...credentialErrors(revokedMessage),
    {
      status: "404",
      code: "modelVersionNotFound",
      message: "La versión del modelo ya no está disponible.",
      cause: "La versión no existe o su modelo es de otra aplicación.",
    },
  ];
  registry.registerPath({
    method: "get",
    path: "/sdk/model-versions/{modelVersionId}/manifest",
    tags: ["Endpoints"],
    operationId: "obtener-manifiesto-de-modelo",
    summary: "Obtener el manifiesto de descarga de un modelo",
    description: describeWithErrors(
      "Devuelve dónde descargar el archivo de una versión de modelo y cómo verificarlo. La URL " +
        "de descarga vence una hora después de la solicitud; para volver a descargar, pide un " +
        "manifiesto nuevo.",
      modelVersionErrors,
    ),
    security,
    "x-codeSamples": curlSample("get", `/sdk/model-versions/${modelVersionId}/manifest`),
    request: {
      params: z.object({
        modelVersionId: z
          .string()
          .describe("Versión de modelo, tal como la lista `POST /sdk/sync`.")
          .openapi({ example: modelVersionId }),
      }),
    },
    responses: {
      "200": {
        description: "Manifiesto de descarga de la versión del modelo.",
        content: {
          "application/json": {
            schema: SdkModelVersionManifestSchema,
            examples: {
              manifiesto: { summary: "Modelo de clasificación", value: modelManifestExample },
            },
          },
        },
      },
      ...errorResponses(modelVersionErrors),
    },
  });
}
