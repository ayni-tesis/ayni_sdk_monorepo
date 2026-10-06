import {
  DatasetCreateRequestSchema,
  type DatasetDetailResponse,
  type DatasetListItem,
  type DatasetListResponse,
  DatasetTaskTypeSchema,
} from "@ayni/api/datasets";
import { Hono } from "hono";
import { getApplicationForMember } from "./applications";
import type { CreateDatasetInput, DatasetStoreResult } from "./dataset-store";

const NAME_REQUIRED_MESSAGE = "Ingresa un nombre para el dataset.";
const TASK_TYPE_REQUIRED_MESSAGE = "Selecciona el tipo de tarea.";
const APPLICATION_NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";
const APPLICATION_ARCHIVED_MESSAGE = "No puedes modificar datasets de una aplicación archivada.";

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: Parameters<typeof getApplicationForMember>[0];
  datasets: {
    create: (input: CreateDatasetInput) => Promise<DatasetStoreResult>;
    get: (applicationId: string, datasetId: string) => Promise<DatasetListItem | null>;
    list: (applicationId: string) => Promise<DatasetListResponse>;
  };
};

export function createDatasetsApp({ getSession, applications, datasets }: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/datasets/:datasetId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos este dataset." }, 404);

    try {
      const dataset = await datasets.get(application.id, c.req.param("datasetId"));
      if (!dataset) return c.json({ message: "No encontramos este dataset." }, 404);
      const response: DatasetDetailResponse = { dataset };
      return c.json(response);
    } catch {
      return c.json({ message: "No pudimos cargar el dataset.", code: "datasetLoadFailed" }, 500);
    }
  });

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
