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
export const DatasetApiErrorSchema = z
  .object({ message: z.string(), code: z.string().optional() })
  .strict();

export type DatasetTaskType = z.infer<typeof DatasetTaskTypeSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;

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
