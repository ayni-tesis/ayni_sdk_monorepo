import {
  ValidationDatasetCancelRequestSchema,
  ValidationDatasetCreateRequestSchema,
  ValidationDatasetUploadRequestSchema,
  ValidationDatasetVersionUploadRequestSchema,
} from "@ayni/api";
import { Hono } from "hono";
import { z } from "zod";

import { type Application, getApplicationForMember } from "./applications";
import {
  type CompleteValidationDatasetUploadInput,
  type CreateValidationDatasetInput,
  MAX_VALIDATION_DATASET_BYTES,
  type ValidationDataset,
  type ValidationDatasetListItem,
  type ValidationDatasetStorage,
  type ValidationDatasetStoreResult,
  type ValidationDatasetVersion,
} from "./validation-dataset-store";

const INVALID_DATASET_MESSAGE = "Ingresa el nombre, la fuente y la licencia del dataset.";
const INVALID_VERSION_MESSAGE = "Ingresa una versión SemVer y una partición válidas.";
const INVALID_UPLOAD_MESSAGE = "La solicitud de carga no es válida.";
const UPLOAD_FAILED_MESSAGE = "No se pudo verificar o guardar el ZIP del dataset.";

const UploadIdSchema = z.object({ uploadId: z.string().uuid() });

type Store = {
  list(applicationId: string): Promise<{ datasets: ValidationDatasetListItem[] }>;
  createDataset(
    input: CreateValidationDatasetInput,
  ): Promise<ValidationDatasetStoreResult<ValidationDataset>>;
  completeUpload(
    input: CompleteValidationDatasetUploadInput,
  ): Promise<ValidationDatasetStoreResult<ValidationDatasetVersion>>;
};

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  validationDatasets: Store;
  storage: Pick<
    ValidationDatasetStorage,
    "createUploadUrl" | "getArtifact" | "getArtifactSize" | "removeArtifact"
  >;
};

function isApplicationAdministrator(role: string) {
  return role === "admin" || role === "owner";
}

function stagingKey(applicationId: string, uploadId: string) {
  return `staging/${applicationId}/validation-datasets/${uploadId}.zip`;
}

function cleanupStaging(storage: Dependencies["storage"], key: string) {
  return storage.removeArtifact(key).catch(() => {});
}

export function createValidationDatasetsApp({
  getSession,
  applications,
  validationDatasets,
  storage,
}: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/validation-datasets", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);

    try {
      return c.json(await validationDatasets.list(application.id));
    } catch {
      return c.json({ message: "No se pudieron listar los datasets de validación." }, 500);
    }
  });

  app.post("/applications/:applicationId/validation-datasets", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getApplicationForMember(
      applications,
      c.req.param("applicationId"),
      session.user.id,
    );
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);
    if (!isApplicationAdministrator(application.role)) {
      return c.json(
        { message: "No tienes permiso para registrar datasets.", code: "forbidden" },
        403,
      );
    }
    if (application.status !== "active") {
      return c.json(
        {
          message: "No puedes modificar datasets de una aplicación archivada.",
          code: "applicationArchived",
        },
        409,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      rawBody = null;
    }
    const parsed = ValidationDatasetCreateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ message: INVALID_DATASET_MESSAGE, code: "invalidDataset" }, 400);
    }

    const result = await validationDatasets.createDataset({
      applicationId: application.id,
      userId: session.user.id,
      ...parsed.data,
    });
    if (result.ok) return c.json({ dataset: result.value }, 201);

    switch (result.reason) {
      case "forbidden":
        return c.json(
          { message: "No tienes permiso para registrar datasets.", code: "forbidden" },
          403,
        );
      case "archived":
        return c.json(
          {
            message: "No puedes modificar datasets de una aplicación archivada.",
            code: "applicationArchived",
          },
          409,
        );
      case "datasetExists":
        return c.json(
          {
            message: "Ya existe un dataset con ese nombre en esta aplicación.",
            code: "datasetExists",
          },
          409,
        );
      case "notFound":
        return c.json({ message: "No encontramos esta aplicación.", code: "notFound" }, 404);
      default:
        return c.json(
          { message: "No se pudo registrar el dataset.", code: "datasetSaveFailed" },
          500,
        );
    }
  });

  app.post(
    "/applications/:applicationId/validation-datasets/:datasetId/versions/upload-url",
    async (c) => {
      const session = await getSession(c.req.raw.headers);
      if (!session) return c.json({ message: "Authentication required" }, 401);

      const application = await getApplicationForMember(
        applications,
        c.req.param("applicationId"),
        session.user.id,
      );
      if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);
      if (!isApplicationAdministrator(application.role)) {
        return c.json(
          { message: "No tienes permiso para subir datasets.", code: "forbidden" },
          403,
        );
      }
      if (application.status !== "active") {
        return c.json(
          {
            message: "No puedes subir versiones a una aplicación archivada.",
            code: "applicationArchived",
          },
          409,
        );
      }

      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        rawBody = null;
      }
      const parsed = ValidationDatasetVersionUploadRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return c.json({ message: INVALID_VERSION_MESSAGE, code: "invalidVersionOrPartition" }, 400);
      }

      let current: Awaited<ReturnType<Store["list"]>>;
      try {
        current = await validationDatasets.list(application.id);
      } catch {
        return c.json(
          { message: "No se pudo iniciar la carga del dataset.", code: "uploadFailed" },
          500,
        );
      }
      const dataset = current.datasets.find((item) => item.id === c.req.param("datasetId"));
      if (!dataset)
        return c.json({ message: "No encontramos este dataset.", code: "datasetNotFound" }, 404);
      if (
        dataset.versions.some(
          (version) =>
            version.version === parsed.data.version && version.partition === parsed.data.partition,
        )
      ) {
        return c.json(
          { message: "Esa versión y partición ya están publicadas.", code: "datasetVersionExists" },
          409,
        );
      }

      const uploadId = crypto.randomUUID();
      try {
        const url = await storage.createUploadUrl(stagingKey(application.id, uploadId), 900);
        return c.json({ uploadId, uploadUrl: url });
      } catch {
        return c.json(
          { message: "No se pudo iniciar la carga del dataset.", code: "uploadFailed" },
          500,
        );
      }
    },
  );

  app.post(
    "/applications/:applicationId/validation-datasets/:datasetId/versions/complete",
    async (c) => {
      const session = await getSession(c.req.raw.headers);
      if (!session) return c.json({ message: "Authentication required" }, 401);

      const application = await getApplicationForMember(
        applications,
        c.req.param("applicationId"),
        session.user.id,
      );
      if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);
      if (!isApplicationAdministrator(application.role)) {
        return c.json(
          { message: "No tienes permiso para subir datasets.", code: "forbidden" },
          403,
        );
      }

      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        rawBody = null;
      }
      const parsed = ValidationDatasetUploadRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        const upload = UploadIdSchema.safeParse(rawBody);
        if (upload.success) {
          await cleanupStaging(storage, stagingKey(application.id, upload.data.uploadId));
        }
        return c.json({ message: INVALID_UPLOAD_MESSAGE, code: "invalidUpload" }, 400);
      }

      const { uploadId, version, partition, sha256 } = parsed.data;
      const key = stagingKey(application.id, uploadId);
      try {
        if (application.status !== "active") {
          return c.json(
            {
              message: "No puedes subir versiones a una aplicación archivada.",
              code: "applicationArchived",
            },
            409,
          );
        }

        const size = await storage.getArtifactSize(key);
        if (size === null) {
          return c.json(
            { message: "El archivo ZIP no existe o está vacío.", code: "invalidDatasetArchive" },
            400,
          );
        }
        if (size > MAX_VALIDATION_DATASET_BYTES) {
          return c.json(
            {
              message: "El ZIP supera el tamaño máximo permitido de 128 MiB.",
              code: "datasetTooLarge",
            },
            413,
          );
        }

        const bytes = await storage.getArtifact(key);
        if (!bytes) {
          return c.json(
            { message: "El archivo ZIP ya no está disponible.", code: "invalidDatasetArchive" },
            400,
          );
        }
        if (bytes.byteLength === 0 || bytes.byteLength !== size) {
          return c.json(
            {
              message: "El archivo ZIP no coincide con su tamaño registrado.",
              code: "invalidDatasetArchive",
            },
            400,
          );
        }

        const result = await validationDatasets.completeUpload({
          applicationId: application.id,
          datasetId: c.req.param("datasetId"),
          userId: session.user.id,
          version,
          partition,
          expectedSha256: sha256,
          bytes,
        });
        if (result.ok) return c.json({ datasetVersion: result.value }, 201);

        switch (result.reason) {
          case "forbidden":
            return c.json(
              { message: "No tienes permiso para subir datasets.", code: "forbidden" },
              403,
            );
          case "archived":
            return c.json(
              {
                message: "No puedes subir versiones a una aplicación archivada.",
                code: "applicationArchived",
              },
              409,
            );
          case "notFound":
            return c.json(
              { message: "No encontramos este dataset.", code: "datasetNotFound" },
              404,
            );
          case "invalidVersion":
          case "invalidPartition":
            return c.json(
              { message: INVALID_VERSION_MESSAGE, code: "invalidVersionOrPartition" },
              400,
            );
          case "versionExists":
            return c.json(
              {
                message: "Esa versión y partición ya están publicadas.",
                code: "datasetVersionExists",
              },
              409,
            );
          case "size":
            return bytes.byteLength > MAX_VALIDATION_DATASET_BYTES
              ? c.json(
                  {
                    message: "El ZIP supera el tamaño máximo permitido de 128 MiB.",
                    code: "datasetTooLarge",
                  },
                  413,
                )
              : c.json(
                  { message: "El archivo ZIP no es válido.", code: "invalidDatasetArchive" },
                  400,
                );
          case "hash":
            return c.json(
              { message: "No se pudo verificar el hash del ZIP.", code: "datasetHashFailed" },
              500,
            );
          case "hashMismatch":
            return c.json(
              {
                message: "El SHA-256 del ZIP no coincide con el archivo seleccionado.",
                code: "datasetHashMismatch",
              },
              400,
            );
          case "storageFailed":
          case "databaseFailed":
            return c.json({ message: UPLOAD_FAILED_MESSAGE, code: "datasetSaveFailed" }, 500);
          case "datasetExists":
            return c.json(
              { message: "Ya existe un dataset con ese nombre.", code: "datasetExists" },
              409,
            );
        }
      } catch {
        return c.json({ message: UPLOAD_FAILED_MESSAGE, code: "datasetSaveFailed" }, 500);
      } finally {
        await cleanupStaging(storage, key);
      }
    },
  );

  app.post(
    "/applications/:applicationId/validation-datasets/:datasetId/versions/cancel",
    async (c) => {
      const session = await getSession(c.req.raw.headers);
      if (!session) return c.json({ message: "Authentication required" }, 401);

      const application = await getApplicationForMember(
        applications,
        c.req.param("applicationId"),
        session.user.id,
      );
      if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);
      if (!isApplicationAdministrator(application.role)) {
        return c.json(
          { message: "No tienes permiso para cancelar cargas de datasets.", code: "forbidden" },
          403,
        );
      }

      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        rawBody = null;
      }
      const parsed = ValidationDatasetCancelRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return c.json(
          { message: "La solicitud de cancelación no es válida.", code: "invalidUpload" },
          400,
        );
      }

      try {
        const current = await validationDatasets.list(application.id);
        const dataset = current.datasets.find((item) => item.id === c.req.param("datasetId"));
        if (!dataset) {
          return c.json({ message: "No encontramos este dataset.", code: "datasetNotFound" }, 404);
        }
      } catch {
        return c.json(
          { message: "No se pudo buscar el dataset para cancelar la carga.", code: "uploadFailed" },
          500,
        );
      }

      await cleanupStaging(storage, stagingKey(application.id, parsed.data.uploadId));
      return c.body(null, 204);
    },
  );

  return app;
}
