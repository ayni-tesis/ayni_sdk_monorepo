import {
  extendZodWithOpenApi,
  type OpenAPIRegistry,
  type ResponseConfig,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { sdkCollectionPolicySchema } from "./sdk-collection-policy";
import { sdkConsentReceiptSchema } from "./sdk-consent";
import {
  EVIDENCE_IMAGE_MAX_BYTES,
  EVIDENCE_UPLOAD_URL_TTL_SECONDS,
  SDK_EVIDENCE_MAX_BYTES,
  sdkEvidenceReceiptSchema,
  sdkEvidenceSchema,
  sdkEvidenceUploadSchema,
} from "./sdk-evidence";
import { sdkTelemetryPolicySchema } from "./sdk-telemetry-policy";
import { SDK_TRACE_MAX_BYTES, sdkTraceSchema } from "./sdk-trace";
import {
  SDK_TRACE_ARTIFACT_MAX_BYTES,
  sdkTraceArtifactCompletionSchema,
  sdkTraceArtifactUploadIntentSchema,
  sdkTraceArtifactUploadRequestSchema,
} from "./sdk-trace-artifact";
import { SdkValidationDatasetManifestSchema as validationDatasetManifestSchema } from "./validation-datasets";

extendZodWithOpenApi(z);

const SdkConsentReceiptSchema = sdkConsentReceiptSchema.extend({}).openapi("SdkConsentReceipt");
const SdkConsentAcknowledgementSchema = z
  .object({ receiptId: z.uuid(), receivedAt: z.iso.datetime() })
  .openapi("SdkConsentAcknowledgement");
const SdkTraceAcknowledgementSchema = z
  .object({ traceId: z.uuid(), receivedAt: z.iso.datetime() })
  .openapi("SdkTraceAcknowledgement");
const SdkTraceArtifactUploadRequestSchema = sdkTraceArtifactUploadRequestSchema
  .extend({})
  .openapi("SdkTraceArtifactUploadRequest");
const SdkTraceArtifactUploadIntentSchema = sdkTraceArtifactUploadIntentSchema
  .extend({})
  .openapi("SdkTraceArtifactUploadIntent");
const SdkTraceArtifactCompletionSchema = sdkTraceArtifactCompletionSchema
  .extend({})
  .openapi("SdkTraceArtifactCompletion");
const SdkWorkflowTraceSchema = sdkTraceSchema.extend({}).openapi("SdkWorkflowTrace");
const SdkValidationDatasetManifestSchema = validationDatasetManifestSchema;
const SdkEvidenceSchema = sdkEvidenceSchema.extend({}).openapi("SdkEvidence");
const SdkEvidenceReceiptSchema = sdkEvidenceReceiptSchema.extend({}).openapi("SdkEvidenceReceipt");
const SdkEvidenceStartSchema = z
  .discriminatedUnion("status", [
    sdkEvidenceUploadSchema.extend({}).openapi("SdkEvidenceUpload"),
    SdkEvidenceReceiptSchema,
  ])
  .openapi("SdkEvidenceStart");

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
      .enum(["input.image", "model.tflite", "condition", "output", "dataset.capture"])
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
        tensorIndices: z
          .object({
            boxes: z.number().int().min(0).max(3),
            classes: z.number().int().min(0).max(3),
            scores: z.number().int().min(0).max(3),
            count: z.number().int().min(0).max(3),
          })
          .strict()
          .refine((indices) => new Set(Object.values(indices)).size === 4)
          .optional(),
      }),
      z.object({
        type: z.literal("segmentation"),
        labels: z.array(z.string()),
        scoreType: z.enum(["logits", "probabilities"]),
      }),
    ]),
  })
  .openapi("SdkModelVersionContract");

export type SdkModelVersionContract = z.infer<typeof SdkModelVersionContractSchema>;

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
const datasetVersionId = "de47be43-2b8c-41b0-9adb-a5841102d419";
const datasetId = "8b6fcb85-3d1d-4a73-b8cb-8a2648571290";
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

const validationDatasetManifestExample = {
  manifest: {
    datasetVersionId,
    datasetId,
    version: "1.0.0",
    partition: "validation",
    source: "Colección de hojas para la tesis",
    license: "CC BY 4.0",
    sha256,
    sizeBytes: 184320,
    downloadUrl: "https://r2.example/temporary-signed-download",
    downloadUrlExpiresAt: "2026-10-04T12:15:00.000Z",
  },
} satisfies z.infer<typeof SdkValidationDatasetManifestSchema>;

/** An error an SDK endpoint answers with: its status, `code`, `message`, and cause. */
type SdkError = {
  status: "400" | "401" | "403" | "404" | "409" | "413" | "500" | "503";
  code: string;
  message: string;
  cause: string;
};

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
function errorResponses(
  errors: SdkError[],
  descriptions: Partial<Record<SdkError["status"], string>> = {},
): Record<string, ResponseConfig> {
  const statuses = [...new Set(errors.map(({ status }) => status))];
  return Object.fromEntries(
    statuses.map((status) => {
      const ofStatus = errors.filter((error) => error.status === status);
      const codes = ofStatus.map(({ code }) => code) as [string, ...string[]];
      return [
        status,
        {
          description:
            descriptions[status] ??
            (status === "401"
              ? "Credencial no válida o revocada."
              : status === "400"
                ? "Solicitud no válida."
                : status === "403"
                  ? "La política de telemetría no está habilitada."
                  : status === "409"
                    ? "El identificador ya se usó con otros datos."
                    : status === "413"
                      ? "El cuerpo supera el tamaño máximo permitido."
                      : status === "503"
                        ? "El aviso de privacidad de Ayni todavía no está publicado."
                        : status === "500"
                          ? "No se pudo completar la solicitud por un fallo temporal del servidor."
                          : "Recurso no disponible."),
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

  const consentErrors: SdkError[] = [
    ...credentialErrors(revokedMessage),
    {
      status: "400",
      code: "invalidConsent",
      message: "La decisión de consentimiento no es válida.",
      cause: "Falta un campo o su propósito, decisión, fecha o identificador no es válido.",
    },
    {
      status: "409",
      code: "consentReceiptConflict",
      message: "El recibo de consentimiento ya existe con otros datos.",
      cause: "Se reutilizó el mismo identificador de recibo para otra decisión.",
    },
    {
      status: "503",
      code: "privacyNoticeUnavailable",
      message: "El aviso de privacidad de Ayni aún no está publicado.",
      cause: "Ayni no registra decisiones para usos propios hasta publicar su aviso vigente.",
    },
  ];
  registry.registerPath({
    method: "post",
    path: "/sdk/consents",
    tags: ["Endpoints"],
    operationId: "registrar-decision-de-consentimiento",
    summary: "Registrar una decisión opcional de privacidad",
    description: describeWithErrors(
      "Registra de forma idempotente la elección de una persona para un uso adicional " +
        "de Ayni. La identidad es un UUID aleatorio y opaco generado por la app integradora; " +
        "no envíes nombre, correo, teléfono ni hashes derivados de ellos. Reutiliza el mismo " +
        "`receiptId` al reintentar una decisión guardada sin conexión.",
      consentErrors,
    ),
    security,
    "x-codeSamples": curlSample("post", "/sdk/consents"),
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: SdkConsentReceiptSchema } },
      },
    },
    responses: {
      "201": {
        description: "El servidor guardó o ya había recibido este recibo.",
        content: {
          "application/json": {
            schema: SdkConsentAcknowledgementSchema,
            examples: {
              recibido: {
                summary: "Recibo sincronizado",
                value: {
                  receiptId: "550e8400-e29b-41d4-a716-446655440001",
                  receivedAt: "2026-09-30T12:00:00.000Z",
                },
              },
            },
          },
        },
      },
      ...errorResponses(consentErrors),
    },
  });

  const traceErrors: SdkError[] = [
    ...credentialErrors(revokedMessage),
    {
      status: "400",
      code: "invalidTrace",
      message: "La traza no tiene un formato válido.",
      cause: "Debe seguir el esquema tipado del SDK y no puede incluir campos adicionales.",
    },
    {
      status: "413",
      code: "traceTooLarge",
      message: "La traza supera el tamaño máximo permitido.",
      cause: `El cuerpo puede ocupar hasta ${SDK_TRACE_MAX_BYTES / 1024} KiB.`,
    },
    {
      status: "403",
      code: "telemetryDisabled",
      message: "La política de telemetría de esta aplicación está deshabilitada.",
      cause: "La aplicación puede recibir trazas solo cuando habilita la política de telemetría.",
    },
    {
      status: "409",
      code: "traceConflict",
      message: "El ID de traza ya se usó con otros datos.",
      cause: "Un mismo ID solo puede confirmar contenido idéntico para la misma aplicación.",
    },
  ];
  registry.registerPath({
    method: "post",
    path: "/sdk/traces",
    tags: ["Endpoints"],
    operationId: "enviar-traza-de-ejecucion",
    summary: "Enviar una traza de ejecución pendiente",
    description: describeWithErrors(
      "Recibe una traza tipada y sanitizada para la aplicación de la credencial, únicamente " +
        "cuando su política de telemetría está habilitada. Los valores y el perfil informados " +
        "por el cliente se conservan como `clientReported` y no se verifican de forma " +
        `independiente. El cuerpo admite hasta ${SDK_TRACE_MAX_BYTES / 1024} KiB. ` +
        "La retención sigue los días configurados para la aplicación.",
      traceErrors,
    ),
    security,
    "x-codeSamples": curlSample("post", "/sdk/traces"),
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: SdkWorkflowTraceSchema } },
      },
    },
    responses: {
      "201": {
        description: "La traza quedó guardada o ya había sido recibida con el mismo contenido.",
        content: {
          "application/json": {
            schema: SdkTraceAcknowledgementSchema,
            examples: {
              recibido: {
                summary: "Traza confirmada",
                value: {
                  traceId: "550e8400-e29b-41d4-a716-446655440001",
                  receivedAt: "2026-10-02T12:00:00.000Z",
                },
              },
            },
          },
        },
      },
      ...errorResponses(traceErrors),
    },
  });

  const traceArtifactErrors: SdkError[] = [
    ...credentialErrors(revokedMessage),
    {
      status: "400",
      code: "invalidArtifact",
      message: "La solicitud del artefacto no es válida.",
      cause: "Se requiere un nombre lógico, tamaño y SHA-256 válidos.",
    },
    {
      status: "400",
      code: "invalidArtifactContent",
      message: "El archivo no coincide con el tamaño, SHA-256 o formato permitidos.",
      cause: "Solo se aceptan trazas nativas de Perfetto en formato protobuf binario.",
    },
    {
      status: "403",
      code: "telemetryDisabled",
      message: "La política de telemetría de esta aplicación está deshabilitada.",
      cause: "La política debe seguir habilitada al crear y completar la carga.",
    },
    {
      status: "404",
      code: "traceNotFound",
      message: "No encontramos esta traza o artefacto.",
      cause:
        "La traza debe existir, pertenecer a la aplicación de la credencial y no haber vencido.",
    },
    {
      status: "409",
      code: "artifactUploadExpired",
      message: "La carga del artefacto venció.",
      cause: "La URL firmada tiene una vigencia limitada.",
    },
    {
      status: "409",
      code: "artifactUploadInProgress",
      message: "La carga del artefacto aún se está verificando.",
      cause:
        "Solo una verificación por artefacto se ejecuta a la vez; vuelve a intentar cuando termine.",
    },
    {
      status: "409",
      code: "artifactUploadChanged",
      message: "El archivo cambió durante la verificación.",
      cause: "El objeto de staging se reemplazó durante la comprobación; solicita otra carga.",
    },
    {
      status: "413",
      code: "artifactTooLarge",
      message: "El artefacto supera el tamaño máximo permitido.",
      cause: `La carga directa de una sola operación admite hasta ${SDK_TRACE_ARTIFACT_MAX_BYTES} bytes (4.995 GiB).`,
    },
    {
      status: "413",
      code: "invalidArtifact",
      message: "La solicitud del artefacto no es válida.",
      cause: "El cuerpo del endpoint de confirmación supera el límite permitido.",
    },
  ];
  registry.registerPath({
    method: "post",
    path: "/sdk/traces/{traceId}/artifacts",
    tags: ["Endpoints"],
    operationId: "iniciar-carga-de-artefacto-de-traza",
    summary: "Solicitar una carga directa de artefacto de validación",
    description: describeWithErrors(
      "Crea una carga privada de un archivo fuente vinculado a una traza vigente. El servidor fija el tamaño, el SHA-256 y el nombre lógico declarados y devuelve una URL de R2 de una hora para un único PUT de `application/octet-stream`. El cliente no debe reenviar `Authorization` al almacenamiento ni seguir redirecciones a otro origen. Al completar, el servidor verifica bytes, hash y estructura protobuf nativa de Perfetto. Se aceptan hasta 4.995 GiB por PUT directo; cargas mayores requieren multipart y no están habilitadas.",
      traceArtifactErrors,
    ),
    security,
    request: {
      params: z.object({ traceId: z.uuid() }),
      body: {
        required: true,
        content: { "application/json": { schema: SdkTraceArtifactUploadRequestSchema } },
      },
    },
    responses: {
      "201": {
        description: "Carga directa autorizada; usa solo los encabezados devueltos en el PUT a R2.",
        content: { "application/json": { schema: SdkTraceArtifactUploadIntentSchema } },
      },
      ...errorResponses(traceArtifactErrors),
    },
  });
  registry.registerPath({
    method: "post",
    path: "/sdk/traces/{traceId}/artifacts/{artifactId}/complete",
    tags: ["Endpoints"],
    operationId: "confirmar-artefacto-de-traza",
    summary: "Verificar y confirmar un artefacto cargado",
    description: describeWithErrors(
      "Lee el objeto de staging en streaming, vuelve a comprobar la política de telemetría y la vigencia de la traza, calcula tamaño y SHA-256, valida la estructura protobuf de Perfetto y lo copia a una clave privada que el cliente no puede modificar.",
      traceArtifactErrors,
    ),
    security,
    request: { params: z.object({ traceId: z.uuid(), artifactId: z.uuid() }) },
    responses: {
      "200": {
        description: "Metadatos del artefacto verificado.",
        content: { "application/json": { schema: SdkTraceArtifactCompletionSchema } },
      },
      ...errorResponses(traceArtifactErrors),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/sdk/telemetry-policy",
    tags: ["Endpoints"],
    operationId: "obtener-politica-de-telemetria",
    summary: "Obtener la política de captura y envío de trazas",
    description: describeWithErrors(
      "Devuelve si la aplicación de la credencial tiene habilitados la captura local y el envío de trazas, además de su periodo de retención. El SDK refresca esta política antes de cada envío. Sin configuración, la captura está deshabilitada. No incluye el identificador de aplicación.",
      credentialErrors(revokedMessage),
    ),
    security,
    "x-codeSamples": curlSample("get", "/sdk/telemetry-policy"),
    responses: {
      "200": {
        description: "Política de telemetría de la aplicación autenticada.",
        content: { "application/json": { schema: sdkTelemetryPolicySchema } },
      },
      ...errorResponses(credentialErrors(revokedMessage)),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/sdk/collection-policy",
    tags: ["Endpoints"],
    operationId: "obtener-politica-de-recoleccion",
    summary: "Obtener la política de recolección de evidencia",
    description: describeWithErrors(
      "Devuelve la política de recolección de evidencia de la aplicación de la credencial. El SDK intenta refrescarla en cada sincronización, justo antes de pedir el manifiesto, y optimiza cada imagen de evidencia con su tamaño máximo y su calidad. Sin configuración, la recolección está deshabilitada, con 1024 px y calidad 80. No incluye el identificador de aplicación.",
      credentialErrors(revokedMessage),
    ),
    security,
    "x-codeSamples": curlSample("get", "/sdk/collection-policy"),
    responses: {
      "200": {
        description: "Política de recolección de la aplicación autenticada.",
        content: {
          "application/json": {
            schema: sdkCollectionPolicySchema,
            examples: {
              habilitada: {
                summary: "Recolección habilitada solo por Wi-Fi",
                value: {
                  enabled: true,
                  consentRequired: true,
                  network: "wifi",
                  maxImageSize: 1024,
                  imageQuality: 80,
                },
              },
            },
          },
        },
      },
      ...errorResponses(credentialErrors(revokedMessage)),
    },
  });

  const collectionDisabled: SdkError = {
    status: "403",
    code: "collectionDisabled",
    message: "La recolección de evidencia de esta aplicación está deshabilitada.",
    cause:
      "La aplicación recibe evidencia solo mientras su política de recolección está habilitada.",
  };
  const evidenceStartErrors: SdkError[] = [
    ...credentialErrors(revokedMessage),
    collectionDisabled,
    {
      status: "400",
      code: "invalidEvidence",
      message: "La evidencia no tiene un formato válido.",
      cause:
        "Debe seguir el esquema de la evidencia del SDK, sin campos adicionales, con una imagen `image/jpeg` que no supera el tamaño máximo con que se optimizó.",
    },
    {
      status: "413",
      code: "evidenceTooLarge",
      message: "La evidencia supera el tamaño máximo permitido.",
      cause: `El cuerpo puede ocupar hasta ${SDK_EVIDENCE_MAX_BYTES / 1024} KiB y la imagen, hasta ${EVIDENCE_IMAGE_MAX_BYTES / 1024 / 1024} MiB.`,
    },
    {
      status: "404",
      code: "evidenceSourceNotFound",
      message: "La evidencia no corresponde a un workflow publicado de esta aplicación.",
      cause:
        "La versión de workflow no es de la aplicación de la credencial, su nodo `dataset.capture` no recibe el resultado del modelo indicado, o ese modelo no es de la aplicación o no coincide en versión, SHA-256, tipo de tarea o etiquetas.",
    },
    {
      status: "409",
      code: "evidenceConflict",
      message: "El ID de evidencia ya se usó con otros datos.",
      cause: "Un mismo ID solo puede repetir los mismos datos en la misma aplicación.",
    },
  ];
  const evidenceExample = {
    evidenceSchemaVersion: 1,
    evidenceId: "6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f",
    capturedAt: "2026-10-03T12:00:00.000Z",
    workflowId: "0b9f3c8e-2f4d-4c11-9a57-6f1e2d3c4b5a",
    workflowVersionId,
    workflowVersion: "1.2.0",
    captureNodeId: "captura",
    model: { modelVersionId, version: "2.0.0", sha256 },
    result: {
      type: "classification",
      nodeId: "modelo",
      label: "enferma",
      confidence: 0.62,
      confidences: { sana: 0.38, enferma: 0.62 },
    },
    image: {
      mediaType: "image/jpeg",
      width: 1024,
      height: 768,
      maxImageSize: 1024,
      imageQuality: 80,
      byteSize: 182_431,
      sha256: "3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
    },
  } satisfies z.infer<typeof sdkEvidenceSchema>;
  registry.registerPath({
    method: "post",
    path: "/sdk/evidence",
    tags: ["Endpoints"],
    operationId: "iniciar-carga-de-evidencia",
    summary: "Iniciar la carga de una evidencia",
    description: describeWithErrors(
      "Recibe los datos de una evidencia pendiente del SDK para la aplicación de la credencial, " +
        "solo mientras su política de recolección está habilitada, y comprueba que su versión de " +
        "workflow, su nodo `dataset.capture` y su versión de modelo son de esa aplicación. " +
        "Guarda los datos una sola vez por `evidenceId` y responde una URL firmada para subir la " +
        "imagen con `PUT` directamente al almacenamiento de objetos, sin la credencial; la URL " +
        `vence ${EVIDENCE_UPLOAD_URL_TTL_SECONDS / 60} minutos después. La evidencia queda ` +
        "recibida solo cuando `POST /sdk/evidence/{evidenceId}/complete` lo confirma. Si el " +
        "servidor ya la recibió, responde `received` y no hace falta subir la imagen otra vez.",
      evidenceStartErrors,
    ),
    security,
    "x-codeSamples": curlSample("post", "/sdk/evidence"),
    request: {
      body: {
        required: true,
        content: {
          "application/json": {
            schema: SdkEvidenceSchema,
            examples: { evidencia: { summary: "Clasificación", value: evidenceExample } },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Dónde subir la imagen, o la confirmación si el servidor ya la recibió.",
        content: {
          "application/json": {
            schema: SdkEvidenceStartSchema,
            examples: {
              subir: {
                summary: "Falta la imagen",
                value: {
                  evidenceId: evidenceExample.evidenceId,
                  status: "uploadRequired",
                  uploadUrl: "https://almacenamiento.example/staging/evidencia.jpg?firma=…",
                  uploadUrlExpiresAt: "2026-10-03T12:16:00.000Z",
                },
              },
              recibida: {
                summary: "Ya recibida",
                value: {
                  evidenceId: evidenceExample.evidenceId,
                  status: "received",
                  receivedAt: "2026-10-03T12:01:00.000Z",
                },
              },
            },
          },
        },
      },
      ...errorResponses(evidenceStartErrors, {
        "403": "La política de recolección no está habilitada.",
        "413": "La evidencia o su imagen superan el tamaño máximo permitido.",
      }),
    },
  });

  const evidenceCompleteErrors: SdkError[] = [
    ...credentialErrors(revokedMessage),
    collectionDisabled,
    {
      status: "404",
      code: "evidenceNotFound",
      message: "No encontramos esta evidencia.",
      cause: "Su carga no se inició con `POST /sdk/evidence` para la aplicación de la credencial.",
    },
    {
      status: "409",
      code: "evidenceImageMissing",
      message: "La imagen de la evidencia todavía no se subió.",
      cause: "No hay una imagen en la URL firmada de esta evidencia.",
    },
    {
      status: "400",
      code: "invalidEvidenceImage",
      message: "La imagen no coincide con la evidencia.",
      cause:
        "La imagen subida no es un JPEG o su tamaño, su SHA-256 o sus dimensiones no son los de la evidencia; el servidor la descarta.",
    },
  ];
  registry.registerPath({
    method: "post",
    path: "/sdk/evidence/{evidenceId}/complete",
    tags: ["Endpoints"],
    operationId: "confirmar-carga-de-evidencia",
    summary: "Confirmar la carga de una evidencia",
    description: describeWithErrors(
      "Comprueba la imagen que el SDK subió a la URL firmada: debe ser un JPEG con el tamaño, el " +
        "SHA-256 y las dimensiones de la evidencia. La guarda junto a sus datos y confirma la " +
        "recepción; el SDK solo considera enviada la evidencia con esta confirmación. Confirmar " +
        "otra vez una evidencia recibida devuelve la misma fecha. La solicitud no lleva cuerpo.",
      evidenceCompleteErrors,
    ),
    security,
    "x-codeSamples": curlSample("post", `/sdk/evidence/${evidenceExample.evidenceId}/complete`),
    request: {
      params: z.object({
        evidenceId: z
          .uuid()
          .describe("ID de la evidencia, el mismo de `POST /sdk/evidence`.")
          .openapi({ example: evidenceExample.evidenceId }),
      }),
    },
    responses: {
      "200": {
        description: "La evidencia quedó recibida.",
        content: {
          "application/json": {
            schema: SdkEvidenceReceiptSchema,
            examples: {
              recibida: {
                summary: "Evidencia recibida",
                value: {
                  evidenceId: evidenceExample.evidenceId,
                  status: "received",
                  receivedAt: "2026-10-03T12:01:00.000Z",
                },
              },
            },
          },
        },
      },
      ...errorResponses(evidenceCompleteErrors, {
        "403": "La política de recolección no está habilitada.",
        "409": "La imagen todavía no está en el almacenamiento.",
      }),
    },
  });

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

  const validationDatasetErrors: SdkError[] = [
    ...credentialErrors(revokedMessage),
    {
      status: "404",
      code: "datasetVersionNotFound",
      message: "El dataset de validación ya no está disponible.",
      cause: "La versión no existe, pertenece a otra aplicación o la aplicación está archivada.",
    },
    {
      status: "500",
      code: "datasetManifestUnavailable",
      message: "No se pudo preparar la descarga del dataset.",
      cause: "El servidor no pudo consultar el manifiesto o firmar una URL temporal.",
    },
  ];
  registry.registerPath({
    method: "get",
    path: "/sdk/dataset-versions/{datasetVersionId}/manifest",
    tags: ["Endpoints"],
    operationId: "obtener-manifiesto-de-dataset-de-validacion",
    summary: "Obtener el manifiesto de un dataset privado",
    description: describeWithErrors(
      "Devuelve metadatos para verificar el ZIP y una URL privada que vence a los 15 minutos. " +
        "La versión debe pertenecer a la aplicación activa de la credencial; las claves R2 no se exponen.",
      validationDatasetErrors,
    ),
    security,
    "x-codeSamples": curlSample("get", `/sdk/dataset-versions/${datasetVersionId}/manifest`),
    request: {
      params: z.object({
        datasetVersionId: z
          .string()
          .describe("Versión de dataset que el operador seleccionó para esta aplicación.")
          .openapi({ example: datasetVersionId }),
      }),
    },
    responses: {
      "200": {
        description: "Manifiesto para descargar y verificar el ZIP privado.",
        content: {
          "application/json": {
            schema: SdkValidationDatasetManifestSchema,
            examples: {
              manifiesto: {
                summary: "Versión verificada de dataset",
                value: validationDatasetManifestExample,
              },
            },
          },
        },
      },
      ...errorResponses(validationDatasetErrors),
    },
  });
}
