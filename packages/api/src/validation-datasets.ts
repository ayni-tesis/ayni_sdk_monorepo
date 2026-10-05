import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

export const MAX_VALIDATION_DATASET_BYTES = 128 * 1024 * 1024;

export const ValidationDatasetCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    source: z.string().trim().min(1).max(1000),
    license: z.string().trim().min(1).max(500),
  })
  .strict();

export const ValidationDatasetVersionUploadRequestSchema = z
  .object({
    version: z
      .string()
      .trim()
      .regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/),
    partition: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const ValidationDatasetUploadRequestSchema =
  ValidationDatasetVersionUploadRequestSchema.extend({
    uploadId: z.string().uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict();

export const ValidationDatasetCancelRequestSchema = z
  .object({ uploadId: z.string().uuid() })
  .merge(ValidationDatasetVersionUploadRequestSchema)
  .strict();

export const ValidationDatasetSchema = z
  .object({
    id: z.string(),
    applicationId: z.string(),
    name: z.string(),
    source: z.string(),
    license: z.string(),
    createdAt: z.string().datetime(),
    createdById: z.string().nullable(),
  })
  .strict();

export const ValidationDatasetVersionSchema = z
  .object({
    id: z.string(),
    datasetId: z.string(),
    version: z.string(),
    partition: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sizeBytes: z.number().int().positive(),
    createdAt: z.string().datetime(),
    uploadedById: z.string().nullable(),
  })
  .strict();

export const ValidationDatasetListResponseSchema = z
  .object({
    datasets: z.array(
      ValidationDatasetSchema.extend({ versions: z.array(ValidationDatasetVersionSchema) }),
    ),
  })
  .strict();

export const ValidationDatasetCreateResponseSchema = z
  .object({ dataset: ValidationDatasetSchema })
  .strict();
export const ValidationDatasetUploadUrlResponseSchema = z
  .object({ uploadId: z.string().uuid(), uploadUrl: z.string().url() })
  .strict();
export const ValidationDatasetCompleteResponseSchema = z
  .object({ datasetVersion: ValidationDatasetVersionSchema })
  .strict();

export const ValidationDatasetApiErrorSchema = z
  .object({ message: z.string(), code: z.string().optional() })
  .strict();

export const SdkValidationDatasetManifestSchema = z
  .object({
    manifest: z
      .object({
        datasetVersionId: z.string(),
        datasetId: z.string(),
        version: z.string(),
        partition: z.string(),
        source: z.string(),
        license: z.string(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        sizeBytes: z.number().int().positive(),
        downloadUrl: z.string().url(),
        downloadUrlExpiresAt: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ValidationDatasetApiErrorSchema } },
  };
}

export function registerValidationDatasetRoutes(registry: OpenAPIRegistry) {
  const userSession = registry.registerComponent("securitySchemes", "userSession", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Cookie de sesión de Better Auth para las rutas del dashboard.",
  });
  const sessionSecurity = [{ [userSession.name]: [] }];
  const applicationId = z.object({ applicationId: z.string().openapi({ example: "app-123" }) });
  const datasetParams = z.object({
    applicationId: z.string().openapi({ example: "app-123" }),
    datasetId: z.string().openapi({ example: "dataset-123" }),
  });

  registry.registerPath({
    method: "get",
    path: "/applications/{applicationId}/validation-datasets",
    tags: ["Validation datasets"],
    operationId: "listar-datasets-de-validacion",
    summary: "Listar datasets privados de validación",
    description:
      "Lista los datasets de la aplicación para sus miembros. Las versiones publicadas son inmutables.",
    security: sessionSecurity,
    request: { params: applicationId },
    responses: {
      "200": {
        description: "Datasets y metadatos de sus versiones; nunca se incluyen claves R2.",
        content: { "application/json": { schema: ValidationDatasetListResponseSchema } },
      },
      "401": errorResponse("La sesión no está autenticada."),
      "404": errorResponse("No encontramos esta aplicación."),
      "500": errorResponse("No se pudieron listar los datasets de validación."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/applications/{applicationId}/validation-datasets",
    tags: ["Validation datasets"],
    operationId: "registrar-dataset-de-validacion",
    summary: "Registrar fuente y licencia de un dataset",
    description:
      "Solo administradores de una aplicación activa. La persona operadora declara la licencia; " +
      "el sistema no certifica cumplimiento legal.",
    security: sessionSecurity,
    request: {
      params: applicationId,
      body: {
        required: true,
        content: { "application/json": { schema: ValidationDatasetCreateRequestSchema } },
      },
    },
    responses: {
      "201": {
        description: "Metadatos registrados.",
        content: { "application/json": { schema: ValidationDatasetCreateResponseSchema } },
      },
      "400": errorResponse("Faltan el nombre, la fuente o la declaración de licencia."),
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para registrar datasets."),
      "404": errorResponse("No encontramos esta aplicación."),
      "409": errorResponse("La aplicación está archivada o el nombre ya existe."),
      "500": errorResponse("No se pudo registrar el dataset."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/applications/{applicationId}/validation-datasets/{datasetId}/versions/upload-url",
    tags: ["Validation datasets"],
    operationId: "iniciar-carga-de-dataset-de-validacion",
    summary: "Iniciar la carga temporal de un ZIP",
    description:
      "Emite una URL de carga temporal al bucket privado para una versión y partición válidas.",
    security: sessionSecurity,
    request: {
      params: datasetParams,
      body: {
        required: true,
        content: {
          "application/json": { schema: ValidationDatasetVersionUploadRequestSchema },
        },
      },
    },
    responses: {
      "200": {
        description: "URL temporal de carga; no se expone una clave R2 independiente.",
        content: { "application/json": { schema: ValidationDatasetUploadUrlResponseSchema } },
      },
      "400": errorResponse("La versión, partición o tamaño del ZIP no son válidos."),
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para subir datasets."),
      "404": errorResponse("No encontramos la aplicación o el dataset."),
      "409": errorResponse("La aplicación está archivada o la versión ya existe."),
      "413": errorResponse("El ZIP supera el límite de 128 MiB."),
      "500": errorResponse("No se pudo iniciar la carga."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/applications/{applicationId}/validation-datasets/{datasetId}/versions/cancel",
    tags: ["Validation datasets"],
    operationId: "cancelar-carga-de-dataset-de-validacion",
    summary: "Eliminar un ZIP de staging cancelado",
    description:
      "Solo administradores de la aplicación. El borrado del objeto temporal es de mejor esfuerzo.",
    security: sessionSecurity,
    request: {
      params: datasetParams,
      body: {
        required: true,
        content: { "application/json": { schema: ValidationDatasetCancelRequestSchema } },
      },
    },
    responses: {
      "204": { description: "Carga temporal eliminada o ya ausente." },
      "400": errorResponse("La identificación o los metadatos de la carga no son válidos."),
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para cancelar cargas de datasets."),
      "404": errorResponse("No encontramos la aplicación o el dataset."),
      "500": errorResponse("No se pudo buscar el dataset para cancelar la carga."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/applications/{applicationId}/validation-datasets/{datasetId}/versions/complete",
    tags: ["Validation datasets"],
    operationId: "completar-carga-de-dataset-de-validacion",
    summary: "Verificar y publicar una versión de ZIP",
    description:
      "Verifica el tamaño y hash SHA-256 del objeto subido, lo mueve a una clave privada e " +
      "inmutable y elimina el objeto de staging.",
    security: sessionSecurity,
    request: {
      params: datasetParams,
      body: {
        required: true,
        content: { "application/json": { schema: ValidationDatasetUploadRequestSchema } },
      },
    },
    responses: {
      "201": {
        description: "Versión publicada con SHA-256 y tamaño verificados.",
        content: { "application/json": { schema: ValidationDatasetCompleteResponseSchema } },
      },
      "400": errorResponse("La solicitud o el objeto ZIP no es válido o su SHA-256 no coincide."),
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para subir datasets."),
      "404": errorResponse("No encontramos la aplicación o el dataset."),
      "409": errorResponse("La aplicación está archivada o la versión ya existe."),
      "413": errorResponse(
        "El ZIP supera el límite de 128 MiB.",
      ),
      "500": errorResponse("No se pudo verificar o guardar el ZIP."),
    },
  });
}
