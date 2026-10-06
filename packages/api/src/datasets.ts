import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

export const DatasetTaskTypeSchema = z.enum(["classification", "detection"]);

export const DatasetCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    taskType: DatasetTaskTypeSchema,
  })
  .strict();

export const DatasetSchema = z
  .object({
    id: z.string(),
    applicationId: z.string(),
    name: z.string(),
    taskType: DatasetTaskTypeSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const DatasetCreateResponseSchema = z.object({ dataset: DatasetSchema }).strict();
export const DatasetListItemSchema = DatasetSchema.extend({
  evidenceCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
}).strict();
export const DatasetListResponseSchema = z
  .object({ datasets: z.array(DatasetListItemSchema) })
  .strict();
const DatasetEvidenceResultSchema = z.record(z.string(), z.unknown());
export const DatasetEvidenceSchema = z
  .object({
    evidenceId: z.string(),
    modelId: z.string(),
    modelVersion: z.string(),
    taskType: DatasetTaskTypeSchema,
    result: DatasetEvidenceResultSchema,
    capturedAt: z.string().datetime(),
  })
  .strict();
export const DatasetItemSchema = z
  .object({
    id: z.string(),
    evidenceId: z.string(),
    modelId: z.string(),
    modelVersion: z.string(),
    taskType: DatasetTaskTypeSchema,
    originalResult: DatasetEvidenceResultSchema,
    capturedAt: z.string().datetime(),
    addedAt: z.string().datetime(),
  })
  .strict();
export const DatasetDetailResponseSchema = z
  .object({ dataset: DatasetListItemSchema, items: z.array(DatasetItemSchema) })
  .strict();
export const DatasetAvailableEvidenceResponseSchema = z
  .object({
    evidence: z.array(DatasetEvidenceSchema),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const DatasetAvailableEvidenceQuerySchema = z
  .object({ offset: z.coerce.number().int().nonnegative().max(1_000_000).default(0) })
  .strict();
export const DatasetAddEvidenceRequestSchema = z
  .object({ evidenceIds: z.array(z.string().min(1)).min(1) })
  .strict();
export const DatasetAddEvidenceResponseSchema = z
  .object({ items: z.array(DatasetItemSchema) })
  .strict();
export const DatasetApiErrorSchema = z
  .object({ message: z.string(), code: z.string().optional() })
  .strict();

export type DatasetTaskType = z.infer<typeof DatasetTaskTypeSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;
export type DatasetListItem = z.infer<typeof DatasetListItemSchema>;
export type DatasetListResponse = z.infer<typeof DatasetListResponseSchema>;
export type DatasetItem = z.infer<typeof DatasetItemSchema>;
export type DatasetEvidence = z.infer<typeof DatasetEvidenceSchema>;
export type DatasetDetailResponse = z.infer<typeof DatasetDetailResponseSchema>;
export type DatasetAvailableEvidenceResponse = z.infer<
  typeof DatasetAvailableEvidenceResponseSchema
>;
export type DatasetAddEvidenceRequest = z.infer<typeof DatasetAddEvidenceRequestSchema>;
export type DatasetAddEvidenceResponse = z.infer<typeof DatasetAddEvidenceResponseSchema>;

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: DatasetApiErrorSchema } },
  };
}

export function registerDatasetRoutes(registry: OpenAPIRegistry) {
  const userSession = registry.registerComponent("securitySchemes", "datasetUserSession", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Cookie de sesión de Better Auth para las rutas del dashboard.",
  });

  registry.registerPath({
    method: "get",
    path: "/applications/{applicationId}/datasets/{datasetId}",
    tags: ["Datasets"],
    operationId: "obtener-detalle-dataset",
    summary: "Consultar el detalle de un dataset",
    description: "Cualquier miembro del workspace puede consultar un dataset de la aplicación.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
      }),
    },
    responses: {
      "200": {
        description: "Detalle del dataset y sus evidencias.",
        content: { "application/json": { schema: DatasetDetailResponseSchema } },
      },
      "401": errorResponse("La sesión no está autenticada."),
      "404": errorResponse("No encontramos este dataset."),
      "500": errorResponse("No pudimos cargar el dataset."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/applications/{applicationId}/datasets/{datasetId}/available-evidence",
    tags: ["Datasets"],
    operationId: "listar-evidencia-disponible-dataset",
    summary: "Listar evidencia compatible para un dataset",
    description:
      "Solo administradores y propietarios pueden consultar evidencia recibida y compatible que aún no pertenece al dataset.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
      }),
      query: DatasetAvailableEvidenceQuerySchema,
    },
    responses: {
      "200": {
        description: "Página de evidencia compatible disponible.",
        content: { "application/json": { schema: DatasetAvailableEvidenceResponseSchema } },
      },
      "400": errorResponse("El desplazamiento de página no es válido."),
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para agregar evidencia."),
      "404": errorResponse("No encontramos este dataset."),
      "409": errorResponse("No puedes modificar datasets de una aplicación archivada."),
      "500": errorResponse("No pudimos cargar las evidencias."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/applications/{applicationId}/datasets/{datasetId}/evidence",
    tags: ["Datasets"],
    operationId: "agregar-evidencia-dataset",
    summary: "Agregar evidencia a un dataset",
    description:
      "Agrega de forma atómica evidencia recibida de la misma aplicación y tipo de tarea, sin duplicarla ni modificar su predicción original.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
      }),
      body: {
        required: true,
        content: { "application/json": { schema: DatasetAddEvidenceRequestSchema } },
      },
    },
    responses: {
      "201": {
        description: "Evidencia agregada al dataset.",
        content: { "application/json": { schema: DatasetAddEvidenceResponseSchema } },
      },
      "400": errorResponse("Selecciona evidencia para agregar al dataset."),
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para agregar evidencia."),
      "404": errorResponse("No encontramos este dataset o evidencia."),
      "409": errorResponse("La evidencia no coincide o ya está agregada al dataset."),
      "500": errorResponse("No pudimos agregar la evidencia al dataset."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/applications/{applicationId}/datasets",
    tags: ["Datasets"],
    operationId: "listar-datasets",
    summary: "Listar datasets de una aplicación",
    description: "Cualquier miembro del workspace puede listar los datasets de la aplicación.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({ applicationId: z.string().openapi({ example: "app-123" }) }),
    },
    responses: {
      "200": {
        description: "Datasets de la aplicación.",
        content: { "application/json": { schema: DatasetListResponseSchema } },
      },
      "401": errorResponse("La sesión no está autenticada."),
      "404": errorResponse("No encontramos esta aplicación."),
      "500": errorResponse("No pudimos cargar los datasets."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/applications/{applicationId}/datasets",
    tags: ["Datasets"],
    operationId: "crear-dataset",
    summary: "Crear un dataset de aplicación",
    description: "Solo administradores de una aplicación activa pueden crear datasets vacíos.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({ applicationId: z.string().openapi({ example: "app-123" }) }),
      body: {
        required: true,
        content: { "application/json": { schema: DatasetCreateRequestSchema } },
      },
    },
    responses: {
      "201": {
        description: "Dataset vacío creado.",
        content: { "application/json": { schema: DatasetCreateResponseSchema } },
      },
      "400": errorResponse("Ingresa un nombre y selecciona el tipo de tarea."),
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para crear datasets."),
      "404": errorResponse("No encontramos esta aplicación."),
      "409": errorResponse("No puedes modificar datasets de una aplicación archivada."),
      "500": errorResponse("No se pudo crear el dataset."),
    },
  });
}
