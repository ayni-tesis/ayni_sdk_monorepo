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
export const DatasetReviewStatusSchema = z.enum(["pending", "approved", "rejected"]);
export const DATASET_LABEL_MAX_LENGTH = 160;
/** The most boxes a reviewed detection may hold. */
export const DATASET_ANNOTATIONS_MAX = 100;

/**
 * The errors of a reviewed detection, by priority: an out-of-bounds box comes
 * first, since a body can break several rules at once. Each message is unique,
 * because `parseDatasetAnnotationsRequest` finds the code by its message.
 */
export const DATASET_ANNOTATIONS_ERRORS = {
  boxOutOfBounds: "La caja debe permanecer dentro de la imagen.",
  emptyBox: "La caja debe tener ancho y alto.",
  labelRequired: "Ingresa una etiqueta para cada caja.",
  invalidAnnotations: "Las anotaciones revisadas no son válidas.",
} as const;
export type DatasetAnnotationsErrorCode = keyof typeof DATASET_ANNOTATIONS_ERRORS;

const boxCoordinate = z
  .number()
  .min(0, DATASET_ANNOTATIONS_ERRORS.boxOutOfBounds)
  .max(1, DATASET_ANNOTATIONS_ERRORS.boxOutOfBounds);
/**
 * A box in the convention of the SDK's detection results (`originalResult`):
 * its edges relative to the image width (`x`) and height (`y`), from `0` (left
 * or top) to `1` (right or bottom). Pixels are `x * imageWidth` and
 * `y * imageHeight` of the item's image.
 */
export const DatasetBoxSchema = z
  .object({
    xMin: boxCoordinate.describe("Borde izquierdo, relativo al ancho de la imagen (0 a 1)."),
    yMin: boxCoordinate.describe("Borde superior, relativo al alto de la imagen (0 a 1)."),
    xMax: boxCoordinate.describe("Borde derecho, relativo al ancho de la imagen (0 a 1)."),
    yMax: boxCoordinate.describe("Borde inferior, relativo al alto de la imagen (0 a 1)."),
  })
  .strict()
  .refine(({ xMin, yMin, xMax, yMax }) => xMin < xMax && yMin < yMax, {
    message: DATASET_ANNOTATIONS_ERRORS.emptyBox,
  });
export const DatasetAnnotationSchema = z
  .object({
    label: z
      .string(DATASET_ANNOTATIONS_ERRORS.labelRequired)
      .trim()
      .min(1, DATASET_ANNOTATIONS_ERRORS.labelRequired)
      .max(DATASET_LABEL_MAX_LENGTH, DATASET_ANNOTATIONS_ERRORS.invalidAnnotations),
    box: DatasetBoxSchema,
  })
  .strict();
const DatasetAnnotationsSchema = z.array(DatasetAnnotationSchema).max(DATASET_ANNOTATIONS_MAX);
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
    imageUrl: z.string().url(),
    imageWidth: z.number().int().positive(),
    imageHeight: z.number().int().positive(),
    reviewStatus: DatasetReviewStatusSchema,
    reviewerName: z.string().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    reviewReason: z.string().nullable(),
    reviewedLabel: z
      .string()
      .nullable()
      .describe(
        "Etiqueta de clasificación revisada por una persona; null mientras nadie la asigna. Nunca reemplaza originalResult.",
      ),
    reviewedAnnotations: DatasetAnnotationsSchema.nullable().describe(
      "Cajas de detección revisadas por una persona, con coordenadas relativas a imageWidth e imageHeight (0 a 1); null mientras nadie las guarda y [] si la imagen no muestra objetos. Nunca reemplazan originalResult.",
    ),
  })
  .strict();
const DatasetFilterOptionSchema = z.object({ id: z.string(), name: z.string() }).strict();
export const DatasetFilterOptionsSchema = z
  .object({
    workflows: z.array(DatasetFilterOptionSchema),
    models: z.array(DatasetFilterOptionSchema),
  })
  .strict()
  .describe(
    "Workflows y modelos de todas las evidencias del dataset, sin aplicar filtros, para elegir los filtros Workflow y Modelo.",
  );
export const DatasetDetailResponseSchema = z
  .object({
    dataset: DatasetListItemSchema,
    items: z.array(DatasetItemSchema),
    nextItemOffset: z.number().int().nonnegative().nullable(),
    filterOptions: DatasetFilterOptionsSchema,
  })
  .strict();
export const DatasetAvailableEvidenceResponseSchema = z
  .object({
    evidence: z.array(DatasetEvidenceSchema),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();
const pageOffset = z.coerce.number().int().nonnegative().max(1_000_000).default(0);
export const DatasetPageQuerySchema = z.object({ offset: pageOffset }).strict();

export const DATASET_FILTER_ERROR_MESSAGE = "No se pudo aplicar uno de los filtros.";
const DATASET_PAGE_ERROR_MESSAGE = "El desplazamiento de página no es válido.";
const filterIdentifier = z.string().min(1).max(128);
// A query string read as a number, so the document describes the number it must hold.
const confidenceFilter = z
  .string()
  .trim()
  .min(1)
  .transform(Number)
  .pipe(z.number().min(0).max(1))
  .meta({ type: "number", minimum: 0, maximum: 1 });
const CONFIDENCE_DESCRIPTION =
  "la confianza de la predicción original, de 0 a 1. En clasificación es la confianza de la etiqueta predicha; en detección es la mayor confianza entre sus detecciones, y una evidencia sin detecciones no coincide con ningún filtro de confianza.";

/**
 * The query of a dataset detail page (US-083): its offset and the filters,
 * which the server applies to the requested dataset before paginating, so
 * `nextItemOffset` counts filtered items. Any other parameter is rejected.
 */
export const DatasetItemsQuerySchema = z
  .object({
    offset: pageOffset,
    status: DatasetReviewStatusSchema.optional().describe("Estado de revisión de la evidencia."),
    workflowId: filterIdentifier.optional().describe("Workflow que capturó la evidencia."),
    modelId: filterIdentifier.optional().describe("Modelo que produjo la predicción original."),
    capturedFrom: z.iso
      .date()
      .optional()
      .describe("Primer día de captura (AAAA-MM-DD, UTC), incluido."),
    capturedTo: z.iso
      .date()
      .optional()
      .describe("Último día de captura (AAAA-MM-DD, UTC), incluido."),
    minConfidence: confidenceFilter
      .optional()
      .describe(`Mínimo, incluido, de ${CONFIDENCE_DESCRIPTION}`),
    maxConfidence: confidenceFilter
      .optional()
      .describe(`Máximo, incluido, de ${CONFIDENCE_DESCRIPTION}`),
  })
  .strict()
  .refine(
    ({ capturedFrom, capturedTo }) => !capturedFrom || !capturedTo || capturedFrom <= capturedTo,
    { path: ["capturedTo"], error: "The end date must not be before the start date." },
  )
  .refine(
    ({ minConfidence, maxConfidence }) =>
      minConfidence === undefined || maxConfidence === undefined || minConfidence <= maxConfidence,
    { path: ["maxConfidence"], error: "The minimum confidence must not exceed the maximum." },
  );
export const DatasetAddEvidenceRequestSchema = z
  .object({ evidenceIds: z.array(z.string().min(1)).min(1).max(500) })
  .strict();
export const DatasetReviewRequestSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export const DatasetReviewResponseSchema = z
  .object({
    status: DatasetReviewStatusSchema,
    reviewerName: z.string().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    reason: z.string().nullable(),
  })
  .strict();
export const DatasetLabelRequestSchema = z
  .object({ label: z.string().trim().min(1).max(DATASET_LABEL_MAX_LENGTH) })
  .strict();
export const DatasetLabelResponseSchema = z.object({ reviewedLabel: z.string() }).strict();
export const DatasetExportFormatSchema = z.literal("classification_images_csv");
export const DatasetExportSchema = z
  .object({
    id: z.string(),
    datasetId: z.string(),
    version: z.number().int().positive(),
    format: DatasetExportFormatSchema,
    status: z.literal("ready"),
    generatedAt: z.string().datetime(),
    itemCount: z.number().int().positive(),
  })
  .strict();
export const DatasetExportListResponseSchema = z
  .object({ exports: z.array(DatasetExportSchema) })
  .strict();
export const DatasetExportResponseSchema = z.object({ export: DatasetExportSchema }).strict();
/** Why an approved item cannot be exported (US-084); see `checkDatasetForExport`. */
export const DatasetItemCauseCodeSchema = z.enum([
  "reviewedLabelRequired",
  "formulaLabel",
  "reviewedAnnotationsRequired",
  "invalidAnnotations",
]);
/** The most invalid items a dataset validation lists; `invalidItemCount` counts them all. */
export const DATASET_VALIDATION_ITEMS_MAX = 100;
export const DatasetValidationItemSchema = z
  .object({
    itemId: z.string(),
    evidenceId: z.string(),
    imageUrl: z.string().url(),
    imageWidth: z.number().int().positive(),
    imageHeight: z.number().int().positive(),
    cause: z.object({ code: DatasetItemCauseCodeSchema, message: z.string() }).strict(),
  })
  .strict();
export const DatasetValidationResponseSchema = z
  .object({
    ready: z
      .boolean()
      .describe("true si el dataset tiene evidencias aprobadas y todas pueden exportarse."),
    approvedCount: z.number().int().nonnegative(),
    problem: z
      .object({ code: z.literal("noApprovedItems"), message: z.string() })
      .strict()
      .nullable()
      .describe("Causa que impide exportar el dataset completo; null si no hay ninguna."),
    invalidItemCount: z.number().int().nonnegative(),
    invalidItems: z
      .array(DatasetValidationItemSchema)
      .max(DATASET_VALIDATION_ITEMS_MAX)
      .describe(
        `Los primeros ${DATASET_VALIDATION_ITEMS_MAX} ítems aprobados que requieren revisión, en el orden del dataset, con la causa de cada uno.`,
      ),
  })
  .strict();
export const DatasetAnnotationsRequestSchema = z
  .object({ annotations: DatasetAnnotationsSchema })
  .strict();
export const DatasetAnnotationsResponseSchema = z
  .object({ reviewedAnnotations: DatasetAnnotationsSchema })
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
export type DatasetFilterOptions = z.infer<typeof DatasetFilterOptionsSchema>;
export type DatasetItemsQuery = z.infer<typeof DatasetItemsQuerySchema>;
export type DatasetItemFilters = Omit<DatasetItemsQuery, "offset">;
export type DatasetAvailableEvidenceResponse = z.infer<
  typeof DatasetAvailableEvidenceResponseSchema
>;
export type DatasetAddEvidenceRequest = z.infer<typeof DatasetAddEvidenceRequestSchema>;
export type DatasetAddEvidenceResponse = z.infer<typeof DatasetAddEvidenceResponseSchema>;
export type DatasetReviewRequest = z.infer<typeof DatasetReviewRequestSchema>;
export type DatasetReviewResponse = z.infer<typeof DatasetReviewResponseSchema>;
export type DatasetLabelRequest = z.infer<typeof DatasetLabelRequestSchema>;
export type DatasetLabelResponse = z.infer<typeof DatasetLabelResponseSchema>;
export type DatasetExport = z.infer<typeof DatasetExportSchema>;
export type DatasetExportListResponse = z.infer<typeof DatasetExportListResponseSchema>;
export type DatasetExportResponse = z.infer<typeof DatasetExportResponseSchema>;
export type DatasetValidationItem = z.infer<typeof DatasetValidationItemSchema>;
export type DatasetValidationResponse = z.infer<typeof DatasetValidationResponseSchema>;
export type DatasetBox = z.infer<typeof DatasetBoxSchema>;
export type DatasetAnnotation = z.infer<typeof DatasetAnnotationSchema>;
export type DatasetAnnotationsRequest = z.infer<typeof DatasetAnnotationsRequestSchema>;
export type DatasetAnnotationsResponse = z.infer<typeof DatasetAnnotationsResponseSchema>;

/**
 * Parses the body of a reviewed detection (US-082), naming its most relevant
 * error so the server and the dashboard report the same message.
 */
export function parseDatasetAnnotationsRequest(
  body: unknown,
):
  | { success: true; data: DatasetAnnotationsRequest }
  | { success: false; error: { code: DatasetAnnotationsErrorCode; message: string } } {
  const parsed = DatasetAnnotationsRequestSchema.safeParse(body);
  if (parsed.success) return parsed;
  const messages = new Set(parsed.error.issues.map((issue) => issue.message));
  const code =
    (Object.keys(DATASET_ANNOTATIONS_ERRORS) as DatasetAnnotationsErrorCode[]).find((candidate) =>
      messages.has(DATASET_ANNOTATIONS_ERRORS[candidate]),
    ) ?? "invalidAnnotations";
  return { success: false, error: { code, message: DATASET_ANNOTATIONS_ERRORS[code] } };
}

/**
 * Parses the query of a dataset detail page (US-083). A bad offset alone keeps
 * its own error; any unknown or invalid filter returns the one filter error,
 * so the server and the dashboard report the same message.
 */
export function parseDatasetItemsQuery(query: Record<string, string>):
  | { success: true; data: DatasetItemsQuery }
  | {
      success: false;
      error: { code: "invalidDatasetPage" | "invalidDatasetFilter"; message: string };
    } {
  const parsed = DatasetItemsQuerySchema.safeParse(query);
  if (parsed.success) return parsed;
  return parsed.error.issues.every((issue) => issue.path[0] === "offset")
    ? {
        success: false,
        error: { code: "invalidDatasetPage", message: DATASET_PAGE_ERROR_MESSAGE },
      }
    : {
        success: false,
        error: { code: "invalidDatasetFilter", message: DATASET_FILTER_ERROR_MESSAGE },
      };
}

/**
 * Why a dataset or one of its approved items cannot be exported (US-084).
 * `noApprovedItems` is about the whole dataset; the others name one item.
 */
export const DATASET_EXPORT_CHECK_CAUSES = {
  noApprovedItems: "El dataset no tiene evidencias aprobadas para exportar.",
  reviewedLabelRequired: "La evidencia aprobada no tiene etiqueta revisada.",
  formulaLabel: "La etiqueta revisada puede interpretarse como fórmula.",
  reviewedAnnotationsRequired: "La evidencia aprobada no tiene anotaciones revisadas.",
  invalidAnnotations: DATASET_ANNOTATIONS_ERRORS.invalidAnnotations,
} as const;
export type DatasetItemCauseCode = z.infer<typeof DatasetItemCauseCodeSchema>;
export type DatasetItemCause = { code: DatasetItemCauseCode; message: string };
export type DatasetExportProblem = {
  code: "noApprovedItems";
  message: (typeof DATASET_EXPORT_CHECK_CAUSES)["noApprovedItems"];
};

/** A label a spreadsheet would run as a formula once written to a CSV cell. */
const FORMULA_LABEL = /^\s*[=+@-]/u;

/** The fields of a dataset item that decide whether it can be exported. */
export type DatasetExportCandidate = {
  reviewStatus: z.infer<typeof DatasetReviewStatusSchema>;
  reviewedLabel: string | null;
  reviewedAnnotations: unknown;
};

function itemCause(taskType: DatasetTaskType, item: DatasetExportCandidate) {
  if (taskType === "classification") {
    if (!item.reviewedLabel?.trim()) return cause("reviewedLabelRequired");
    if (FORMULA_LABEL.test(item.reviewedLabel)) return cause("formulaLabel");
    return null;
  }
  if (item.reviewedAnnotations === null) return cause("reviewedAnnotationsRequired");
  // The same rules as saving them (US-082); the message names the broken rule.
  const parsed = parseDatasetAnnotationsRequest({ annotations: item.reviewedAnnotations });
  return parsed.success
    ? null
    : { code: "invalidAnnotations" as const, message: parsed.error.message };
}

function cause(code: Exclude<DatasetItemCauseCode, "invalidAnnotations">): DatasetItemCause {
  return { code, message: DATASET_EXPORT_CHECK_CAUSES[code] };
}

/**
 * Checks a dataset's items against what an export needs (US-084), reading only
 * the approved ones and only their reviewed ground truth, never the
 * prediction: a classification needs a nonblank `reviewedLabel` that is not a
 * formula, and a detection needs `reviewedAnnotations` whose every box is
 * valid (`[]`, an image without objects, is valid). Validation and every export
 * use it, so they cannot disagree. It reads its input and changes nothing.
 */
export function checkDatasetForExport<Item extends DatasetExportCandidate>(
  taskType: DatasetTaskType,
  items: readonly Item[],
): {
  approvedItems: Item[];
  problem: DatasetExportProblem | null;
  invalidItems: { item: Item; cause: DatasetItemCause }[];
} {
  const approvedItems = items.filter(({ reviewStatus }) => reviewStatus === "approved");
  const invalidItems = approvedItems.flatMap((item) => {
    const found = itemCause(taskType, item);
    return found ? [{ item, cause: found }] : [];
  });
  return {
    approvedItems,
    problem:
      approvedItems.length === 0
        ? { code: "noApprovedItems", message: DATASET_EXPORT_CHECK_CAUSES.noApprovedItems }
        : null,
    invalidItems,
  };
}

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
    description:
      "Cualquier miembro del workspace puede consultar un dataset de la aplicación. Los filtros se combinan entre sí, se aplican solo a las evidencias de este dataset y antes de paginar, así que nextItemOffset cuenta evidencias filtradas.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
      }),
      query: DatasetItemsQuerySchema,
    },
    responses: {
      "200": {
        description: "Detalle del dataset y sus evidencias.",
        content: { "application/json": { schema: DatasetDetailResponseSchema } },
      },
      "401": errorResponse("La sesión no está autenticada."),
      "400": errorResponse(
        `El desplazamiento de página no es válido (invalidDatasetPage), o un parámetro es desconocido o un filtro es inválido: «${DATASET_FILTER_ERROR_MESSAGE}» (invalidDatasetFilter), sin devolver evidencias.`,
      ),
      "404": errorResponse("No encontramos este dataset."),
      "500": errorResponse("No pudimos cargar el dataset."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/applications/{applicationId}/datasets/{datasetId}/validation",
    tags: ["Datasets"],
    operationId: "validar-dataset-exportacion",
    summary: "Validar un dataset para exportación",
    description:
      "Cualquier miembro del workspace puede validar un dataset, también en una aplicación archivada. Revisa solo las evidencias aprobadas con las mismas reglas que la exportación: en clasificación, una etiqueta revisada que no esté vacía ni pueda interpretarse como fórmula; en detección, anotaciones revisadas con cajas válidas (una lista vacía es válida). Solo lee: no modifica el dataset ni sus evidencias.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
      }),
    },
    responses: {
      "200": {
        description:
          "Resultado de la validación: ready es true si el dataset puede exportarse; si no, problem o invalidItems indican la causa.",
        content: { "application/json": { schema: DatasetValidationResponseSchema } },
      },
      "401": errorResponse("La sesión no está autenticada."),
      "404": errorResponse("No encontramos este dataset."),
      "500": errorResponse("No pudimos validar el dataset."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/applications/{applicationId}/datasets/{datasetId}/exports",
    tags: ["Datasets"],
    operationId: "listar-exportaciones-dataset",
    summary: "Listar exportaciones de un dataset",
    description: "Cualquier miembro del workspace puede consultar las exportaciones del dataset.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
      }),
    },
    responses: {
      "200": {
        description: "Exportaciones generadas para el dataset.",
        content: { "application/json": { schema: DatasetExportListResponseSchema } },
      },
      "401": errorResponse("La sesión no está autenticada."),
      "404": errorResponse("No encontramos este dataset."),
      "500": errorResponse("No pudimos cargar las exportaciones del dataset."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/applications/{applicationId}/datasets/{datasetId}/exports",
    tags: ["Datasets"],
    operationId: "exportar-dataset-clasificacion",
    summary: "Exportar un dataset de clasificación",
    description:
      "Solo administradores y propietarios de una aplicación activa pueden crear una exportación inmutable con las evidencias aprobadas y sus etiquetas revisadas.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
      }),
    },
    responses: {
      "201": {
        description: "Exportación de clasificación generada.",
        content: { "application/json": { schema: DatasetExportResponseSchema } },
      },
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para exportar este dataset."),
      "404": errorResponse("No encontramos este dataset."),
      "409": errorResponse(
        "El dataset no se puede exportar: la aplicación está archivada, faltan evidencias aprobadas o etiquetas revisadas, el tipo de tarea no es clasificación o una etiqueta puede interpretarse como fórmula.",
      ),
      "413": errorResponse(
        "El tamaño total de las imágenes supera el límite de exportación de 128 MiB.",
      ),
      "500": errorResponse("No pudimos generar la exportación del dataset."),
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
      query: DatasetPageQuerySchema,
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
    method: "delete",
    path: "/applications/{applicationId}/datasets/{datasetId}/evidence/{itemId}",
    tags: ["Datasets"],
    operationId: "retirar-evidencia-dataset",
    summary: "Retirar evidencia de un dataset",
    description:
      "Retira el ítem del dataset para excluirlo de futuras exportaciones; la evidencia original se conserva.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
        itemId: z.string().openapi({ example: "item-123" }),
      }),
    },
    responses: {
      "204": { description: "Evidencia retirada del dataset." },
      "401": errorResponse("La sesión no está autenticada."),
      "403": errorResponse("No tienes permiso para retirar evidencia."),
      "404": errorResponse("No encontramos este ítem del dataset."),
      "409": errorResponse("No puedes modificar datasets de una aplicación archivada."),
      "500": errorResponse("No pudimos retirar la evidencia del dataset."),
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/applications/{applicationId}/datasets/{datasetId}/evidence/{itemId}/review",
    tags: ["Datasets"],
    operationId: "revisar-evidencia-dataset",
    summary: "Aprobar o rechazar evidencia de un dataset",
    description:
      "Cualquier miembro del workspace puede revisar evidencia. Una evidencia nueva permanece pendiente y la revisión conserva quién y cuándo la realizó.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
        itemId: z.string().openapi({ example: "item-123" }),
      }),
      body: {
        required: true,
        content: { "application/json": { schema: DatasetReviewRequestSchema } },
      },
    },
    responses: {
      "200": {
        description: "Estado de revisión guardado.",
        content: { "application/json": { schema: DatasetReviewResponseSchema } },
      },
      "400": errorResponse("La decisión de revisión no es válida."),
      "401": errorResponse("La sesión no está autenticada."),
      "404": errorResponse("No encontramos esta evidencia del dataset."),
      "500": errorResponse("No pudimos revisar la evidencia del dataset."),
    },
  });

  registry.registerPath({
    method: "put",
    path: "/applications/{applicationId}/datasets/{datasetId}/evidence/{itemId}/label",
    tags: ["Datasets"],
    operationId: "corregir-etiqueta-clasificacion-dataset",
    summary: "Corregir la etiqueta de clasificación de una evidencia",
    description:
      "Cualquier miembro del workspace puede guardar la etiqueta revisada de una evidencia de clasificación. La predicción original no cambia.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
        itemId: z.string().openapi({ example: "item-123" }),
      }),
      body: {
        required: true,
        content: { "application/json": { schema: DatasetLabelRequestSchema } },
      },
    },
    responses: {
      "200": {
        description: "Etiqueta revisada guardada.",
        content: { "application/json": { schema: DatasetLabelResponseSchema } },
      },
      "400": errorResponse(
        "Ingresa una etiqueta para una evidencia aprobada (etiqueta vacía) o la etiqueta revisada no es válida (más de 160 caracteres).",
      ),
      "401": errorResponse("La sesión no está autenticada."),
      "404": errorResponse("No encontramos esta evidencia del dataset."),
      "409": errorResponse("Esta evidencia no es de clasificación."),
      "500": errorResponse("No pudimos guardar la etiqueta revisada."),
    },
  });

  registry.registerPath({
    method: "put",
    path: "/applications/{applicationId}/datasets/{datasetId}/evidence/{itemId}/annotations",
    tags: ["Datasets"],
    operationId: "corregir-anotaciones-deteccion-dataset",
    summary: "Corregir las anotaciones de detección de una evidencia",
    description:
      "Cualquier miembro del workspace puede reemplazar las cajas revisadas de una evidencia de detección. Cada caja lleva una etiqueta y sus bordes relativos al ancho y alto de la imagen (0 a 1). Una lista vacía indica que la imagen no muestra objetos. La predicción original no cambia.",
    security: [{ [userSession.name]: [] }],
    request: {
      params: z.object({
        applicationId: z.string().openapi({ example: "app-123" }),
        datasetId: z.string().openapi({ example: "dataset-123" }),
        itemId: z.string().openapi({ example: "item-123" }),
      }),
      body: {
        required: true,
        content: { "application/json": { schema: DatasetAnnotationsRequestSchema } },
      },
    },
    responses: {
      "200": {
        description: "Anotaciones revisadas guardadas.",
        content: { "application/json": { schema: DatasetAnnotationsResponseSchema } },
      },
      "400": errorResponse(
        `La caja debe permanecer dentro de la imagen (boxOutOfBounds), la caja debe tener ancho y alto (emptyBox), falta una etiqueta (labelRequired) o las anotaciones no son válidas (invalidAnnotations: etiqueta de más de ${DATASET_LABEL_MAX_LENGTH} caracteres o más de ${DATASET_ANNOTATIONS_MAX} cajas).`,
      ),
      "401": errorResponse("La sesión no está autenticada."),
      "404": errorResponse("No encontramos esta evidencia del dataset."),
      "409": errorResponse("Esta evidencia no es de detección."),
      "500": errorResponse("No pudimos guardar las anotaciones revisadas."),
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
