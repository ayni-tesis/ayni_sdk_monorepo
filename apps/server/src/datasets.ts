import {
  DatasetAddEvidenceRequestSchema,
  type DatasetAvailableEvidenceResponse,
  DatasetCreateRequestSchema,
  type DatasetDetailResponse,
  type DatasetExportListResponse,
  type DatasetItemFilters,
  DatasetLabelRequestSchema,
  type DatasetListResponse,
  DatasetPageQuerySchema,
  DatasetReviewRequestSchema,
  DatasetTaskTypeSchema,
  type DatasetValidationResponse,
  parseDatasetAnnotationsRequest,
  parseDatasetItemsQuery,
} from "@ayni/api/datasets";
import { Hono } from "hono";
import { getApplicationForMember } from "./applications";
import type { CreateDatasetExportInput, CreateDatasetExportResult } from "./dataset-export-store";
import type {
  AddDatasetEvidenceInput,
  AddDatasetEvidenceResult,
  CreateDatasetInput,
  DatasetStoreResult,
  RemoveDatasetEvidenceInput,
  RemoveDatasetEvidenceResult,
  ReviewDatasetEvidenceInput,
  ReviewDatasetEvidenceResult,
  SaveDatasetItemAnnotationsInput,
  SaveDatasetItemAnnotationsResult,
  SaveDatasetItemLabelInput,
  SaveDatasetItemLabelResult,
} from "./dataset-store";

const NAME_REQUIRED_MESSAGE = "Ingresa un nombre para el dataset.";
const TASK_TYPE_REQUIRED_MESSAGE = "Selecciona el tipo de tarea.";
const APPLICATION_NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";
const APPLICATION_ARCHIVED_MESSAGE = "No puedes modificar datasets de una aplicación archivada.";
const LABEL_REQUIRED_MESSAGE = "Ingresa una etiqueta para una evidencia aprobada.";
const DATASET_ITEM_NOT_FOUND_MESSAGE = "No encontramos esta evidencia del dataset.";

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: Parameters<typeof getApplicationForMember>[0];
  datasets: {
    addEvidence: (input: AddDatasetEvidenceInput) => Promise<AddDatasetEvidenceResult>;
    createExport?: (input: CreateDatasetExportInput) => Promise<CreateDatasetExportResult>;
    create: (input: CreateDatasetInput) => Promise<DatasetStoreResult>;
    get: (
      applicationId: string,
      datasetId: string,
      offset: number,
      filters: DatasetItemFilters,
    ) => Promise<DatasetDetailResponse | null>;
    list: (applicationId: string) => Promise<DatasetListResponse>;
    listExports?: (
      applicationId: string,
      datasetId: string,
    ) => Promise<DatasetExportListResponse | null>;
    listAvailableEvidence: (
      applicationId: string,
      datasetId: string,
      offset: number,
    ) => Promise<DatasetAvailableEvidenceResponse | null>;
    removeEvidence: (input: RemoveDatasetEvidenceInput) => Promise<RemoveDatasetEvidenceResult>;
    reviewEvidence: (input: ReviewDatasetEvidenceInput) => Promise<ReviewDatasetEvidenceResult>;
    saveLabel: (input: SaveDatasetItemLabelInput) => Promise<SaveDatasetItemLabelResult>;
    saveAnnotations: (
      input: SaveDatasetItemAnnotationsInput,
    ) => Promise<SaveDatasetItemAnnotationsResult>;
    validate: (
      applicationId: string,
      datasetId: string,
    ) => Promise<DatasetValidationResponse | null>;
  };
};

export function createDatasetsApp({ getSession, applications, datasets }: Dependencies) {
  const app = new Hono();

  // Validation only reads, so any member can run it, as reviewing is open to every member (US-084).
  app.get("/applications/:applicationId/datasets/:datasetId/validation", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos este dataset." }, 404);

    try {
      const validation = await datasets.validate(application.id, c.req.param("datasetId"));
      if (!validation) return c.json({ message: "No encontramos este dataset." }, 404);
      return c.json(validation);
    } catch {
      return c.json(
        { message: "No pudimos validar el dataset.", code: "datasetValidationFailed" },
        500,
      );
    }
  });

  app.get("/applications/:applicationId/datasets/:datasetId/exports", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos este dataset." }, 404);

    try {
      if (!datasets.listExports) {
        return c.json(
          {
            message: "No pudimos cargar las exportaciones del dataset.",
            code: "datasetExportListFailed",
          },
          500,
        );
      }
      const response = await datasets.listExports(application.id, c.req.param("datasetId"));
      if (!response) return c.json({ message: "No encontramos este dataset." }, 404);
      return c.json(response);
    } catch {
      return c.json(
        {
          message: "No pudimos cargar las exportaciones del dataset.",
          code: "datasetExportListFailed",
        },
        500,
      );
    }
  });

  app.post("/applications/:applicationId/datasets/:datasetId/exports", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos este dataset." }, 404);
    if (application.role !== "admin" && application.role !== "owner") {
      return c.json(
        { message: "No tienes permiso para exportar este dataset.", code: "forbidden" },
        403,
      );
    }
    if (application.status !== "active") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }
    if (!datasets.createExport) {
      return c.json(
        { message: "No pudimos generar la exportación del dataset.", code: "datasetExportFailed" },
        500,
      );
    }

    const result = await datasets.createExport({
      applicationId: application.id,
      datasetId: c.req.param("datasetId"),
      userId: session.user.id,
    });
    if (result.ok) return c.json({ export: result.value }, 201);
    if (result.reason === "forbidden") {
      return c.json(
        { message: "No tienes permiso para exportar este dataset.", code: "forbidden" },
        403,
      );
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }
    if (result.reason === "notFound") {
      return c.json({ message: "No encontramos este dataset.", code: "notFound" }, 404);
    }
    if (result.reason === "notClassification") {
      return c.json(
        {
          message: "Solo se pueden exportar datasets de clasificación.",
          code: "datasetNotClassification",
        },
        409,
      );
    }
    if (result.reason === "noApprovedItems") {
      return c.json(
        {
          message: "El dataset no tiene evidencias aprobadas para exportar.",
          code: "datasetExportNoApprovedItems",
        },
        409,
      );
    }
    if (result.reason === "missingLabel") {
      return c.json(
        {
          message:
            "Todas las evidencias aprobadas deben tener una etiqueta revisada para exportar.",
          code: "datasetExportLabelRequired",
        },
        409,
      );
    }
    if (result.reason === "unsafeLabel") {
      return c.json(
        {
          message:
            "Una etiqueta revisada puede interpretarse como fórmula. Corrígela antes de exportar.",
          code: "datasetExportFormulaLabel",
        },
        409,
      );
    }
    if (result.reason === "tooLarge") {
      return c.json(
        {
          message: "El tamaño total de las imágenes supera el límite de exportación de 128 MiB.",
          code: "datasetExportTooLarge",
        },
        413,
      );
    }
    return c.json(
      { message: "No pudimos generar la exportación del dataset.", code: "datasetExportFailed" },
      500,
    );
  });

  app.get("/applications/:applicationId/datasets/:datasetId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos este dataset." }, 404);
    const query = parseDatasetItemsQuery(c.req.query());
    if (!query.success) return c.json(query.error, 400);

    try {
      const { offset, ...filters } = query.data;
      const response = await datasets.get(
        application.id,
        c.req.param("datasetId"),
        offset,
        filters,
      );
      if (!response) return c.json({ message: "No encontramos este dataset." }, 404);
      return c.json(response);
    } catch {
      return c.json({ message: "No pudimos cargar el dataset.", code: "datasetLoadFailed" }, 500);
    }
  });

  app.get("/applications/:applicationId/datasets/:datasetId/available-evidence", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos este dataset." }, 404);
    if (application.role !== "admin" && application.role !== "owner") {
      return c.json(
        { message: "No tienes permiso para agregar evidencia.", code: "forbidden" },
        403,
      );
    }
    if (application.status !== "active") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }
    const query = DatasetPageQuerySchema.safeParse({ offset: c.req.query("offset") });
    if (!query.success) {
      return c.json(
        { message: "El desplazamiento de página no es válido.", code: "invalidEvidencePage" },
        400,
      );
    }

    try {
      const available = await datasets.listAvailableEvidence(
        application.id,
        c.req.param("datasetId"),
        query.data.offset,
      );
      if (!available) return c.json({ message: "No encontramos este dataset." }, 404);
      return c.json(available);
    } catch {
      return c.json(
        { message: "No pudimos cargar las evidencias.", code: "datasetEvidenceLoadFailed" },
        500,
      );
    }
  });

  app.post("/applications/:applicationId/datasets/:datasetId/evidence", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos este dataset." }, 404);
    if (application.role !== "admin" && application.role !== "owner") {
      return c.json(
        { message: "No tienes permiso para agregar evidencia.", code: "forbidden" },
        403,
      );
    }
    if (application.status !== "active") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    const body: unknown = await c.req.json().catch(() => null);
    const parsed = DatasetAddEvidenceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { message: "Selecciona evidencia para agregar al dataset.", code: "invalidEvidence" },
        400,
      );
    }

    const result = await datasets.addEvidence({
      applicationId: application.id,
      datasetId: c.req.param("datasetId"),
      evidenceIds: parsed.data.evidenceIds,
      userId: session.user.id,
    });
    if (result.ok) return c.json({ items: result.value }, 201);
    if (result.reason === "forbidden") {
      return c.json(
        { message: "No tienes permiso para agregar evidencia.", code: "forbidden" },
        403,
      );
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }
    if (result.reason === "notFound") {
      return c.json({ message: "No encontramos este dataset o evidencia.", code: "notFound" }, 404);
    }
    if (result.reason === "incompatible") {
      return c.json(
        {
          message: "Esta evidencia no coincide con el tipo de tarea del dataset.",
          code: "datasetEvidenceIncompatible",
        },
        409,
      );
    }
    if (result.reason === "alreadyAdded") {
      return c.json(
        { message: "Esta evidencia ya está agregada al dataset.", code: "datasetEvidenceExists" },
        409,
      );
    }
    return c.json(
      { message: "No pudimos agregar la evidencia al dataset.", code: "datasetEvidenceSaveFailed" },
      500,
    );
  });

  app.delete("/applications/:applicationId/datasets/:datasetId/evidence/:itemId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos este ítem del dataset." }, 404);
    if (application.role !== "admin" && application.role !== "owner") {
      return c.json(
        { message: "No tienes permiso para retirar evidencia.", code: "forbidden" },
        403,
      );
    }
    if (application.status !== "active") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    const result = await datasets.removeEvidence({
      applicationId: application.id,
      datasetId: c.req.param("datasetId"),
      itemId: c.req.param("itemId"),
      userId: session.user.id,
    });
    if (result.ok) return c.body(null, 204);
    if (result.reason === "forbidden") {
      return c.json(
        { message: "No tienes permiso para retirar evidencia.", code: "forbidden" },
        403,
      );
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }
    if (result.reason === "notFound") {
      return c.json({ message: "No encontramos este ítem del dataset.", code: "notFound" }, 404);
    }
    return c.json(
      {
        message: "No pudimos retirar la evidencia del dataset.",
        code: "datasetEvidenceRemoveFailed",
      },
      500,
    );
  });

  app.patch(
    "/applications/:applicationId/datasets/:datasetId/evidence/:itemId/review",
    async (c) => {
      const session = await getSession(c.req.raw.headers);
      if (!session) return c.json({ message: "Authentication required" }, 401);

      const application = await getApplicationForMember(
        applications,
        c.req.param("applicationId"),
        session.user.id,
      );
      if (!application) {
        return c.json({ message: DATASET_ITEM_NOT_FOUND_MESSAGE }, 404);
      }

      const body: unknown = await c.req.json().catch(() => null);
      const parsed = DatasetReviewRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { message: "La decisión de revisión no es válida.", code: "invalidReview" },
          400,
        );
      }

      const result = await datasets.reviewEvidence({
        applicationId: application.id,
        datasetId: c.req.param("datasetId"),
        itemId: c.req.param("itemId"),
        userId: session.user.id,
        ...parsed.data,
      });
      if (result.ok) return c.json(result.value);
      if (result.reason === "notFound") {
        return c.json({ message: DATASET_ITEM_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
      }
      return c.json(
        {
          message: "No pudimos revisar la evidencia del dataset.",
          code: "datasetEvidenceReviewFailed",
        },
        500,
      );
    },
  );

  app.put("/applications/:applicationId/datasets/:datasetId/evidence/:itemId/label", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: DATASET_ITEM_NOT_FOUND_MESSAGE }, 404);

    const body: unknown = await c.req.json().catch(() => null);
    const parsed = DatasetLabelRequestSchema.safeParse(body);
    if (!parsed.success) {
      const label =
        typeof body === "object" && body !== null && "label" in body ? body.label : undefined;
      return typeof label !== "string" || !label.trim()
        ? c.json({ message: LABEL_REQUIRED_MESSAGE, code: "labelRequired" }, 400)
        : c.json({ message: "La etiqueta revisada no es válida.", code: "invalidLabel" }, 400);
    }

    const result = await datasets.saveLabel({
      applicationId: application.id,
      datasetId: c.req.param("datasetId"),
      itemId: c.req.param("itemId"),
      userId: session.user.id,
      ...parsed.data,
    });
    if (result.ok) return c.json(result.value);
    if (result.reason === "notFound") {
      return c.json({ message: DATASET_ITEM_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
    }
    if (result.reason === "notClassification") {
      return c.json(
        {
          message: "Esta evidencia no es de clasificación.",
          code: "datasetEvidenceNotClassification",
        },
        409,
      );
    }
    return c.json(
      { message: "No pudimos guardar la etiqueta revisada.", code: "datasetLabelSaveFailed" },
      500,
    );
  });

  app.put(
    "/applications/:applicationId/datasets/:datasetId/evidence/:itemId/annotations",
    async (c) => {
      const session = await getSession(c.req.raw.headers);
      if (!session) return c.json({ message: "Authentication required" }, 401);

      const application = await getApplicationForMember(
        applications,
        c.req.param("applicationId"),
        session.user.id,
      );
      if (!application) return c.json({ message: DATASET_ITEM_NOT_FOUND_MESSAGE }, 404);

      const body: unknown = await c.req.json().catch(() => null);
      const parsed = parseDatasetAnnotationsRequest(body);
      if (!parsed.success) return c.json(parsed.error, 400);

      const result = await datasets.saveAnnotations({
        applicationId: application.id,
        datasetId: c.req.param("datasetId"),
        itemId: c.req.param("itemId"),
        userId: session.user.id,
        ...parsed.data,
      });
      if (result.ok) return c.json(result.value);
      if (result.reason === "notFound") {
        return c.json({ message: DATASET_ITEM_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
      }
      if (result.reason === "notDetection") {
        return c.json(
          { message: "Esta evidencia no es de detección.", code: "datasetEvidenceNotDetection" },
          409,
        );
      }
      return c.json(
        {
          message: "No pudimos guardar las anotaciones revisadas.",
          code: "datasetAnnotationsSaveFailed",
        },
        500,
      );
    },
  );

  app.get("/applications/:applicationId/datasets", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

    try {
      return c.json(await datasets.list(application.id));
    } catch {
      return c.json({ message: "No pudimos cargar los datasets.", code: "datasetListFailed" }, 500);
    }
  });

  app.post("/applications/:applicationId/datasets", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    if (application.role !== "admin" && application.role !== "owner") {
      return c.json({ message: "No tienes permiso para crear datasets.", code: "forbidden" }, 403);
    }
    if (application.status !== "active") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    const body: unknown = await c.req.json().catch(() => null);
    const parsed = DatasetCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      const name =
        typeof body === "object" && body !== null && "name" in body ? body.name : undefined;
      const taskType =
        typeof body === "object" && body !== null && "taskType" in body ? body.taskType : undefined;
      const message =
        typeof name !== "string" || !name.trim()
          ? NAME_REQUIRED_MESSAGE
          : !DatasetTaskTypeSchema.safeParse(taskType).success
            ? TASK_TYPE_REQUIRED_MESSAGE
            : "Los datos del dataset no son válidos.";
      return c.json({ message, code: "invalidDataset" }, 400);
    }

    const result = await datasets.create({
      applicationId: application.id,
      userId: session.user.id,
      ...parsed.data,
    });
    if (result.ok) return c.json({ dataset: result.value }, 201);
    if (result.reason === "forbidden") {
      return c.json({ message: "No tienes permiso para crear datasets.", code: "forbidden" }, 403);
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }
    if (result.reason === "notFound")
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    return c.json({ message: "No se pudo crear el dataset.", code: "datasetSaveFailed" }, 500);
  });

  return app;
}
