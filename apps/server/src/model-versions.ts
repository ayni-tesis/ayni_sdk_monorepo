import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import type { Application } from "./applications";
import type { CreateModelVersionResult, ListModelVersionsResult } from "./model-version-store";

export const MAX_MODEL_VERSION_BYTES = 128 * 1024 * 1024;

const INVALID_MODEL_FILE_MESSAGE = "El archivo no es un modelo TensorFlow Lite válido.";
const INVALID_VERSION_MESSAGE = "Ingresa una versión con formato SemVer, por ejemplo 1.0.0.";

const versionFieldSchema = z
  .string({ error: INVALID_VERSION_MESSAGE })
  .trim()
  .regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/, {
    message: INVALID_VERSION_MESSAGE,
  });

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  modelVersions: {
    create: (input: {
      applicationId: string;
      modelId: string;
      userId: string;
      version: string;
      bytes: Uint8Array;
      maxBytes: number;
    }) => Promise<CreateModelVersionResult>;
    list: (applicationId: string, modelId: string) => Promise<ListModelVersionsResult>;
  };
};

export function createModelVersionsApp({ getSession, applications, modelVersions }: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/models/:modelId/versions", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: "No encontramos esta aplicación." }, 404);
    }

    const result = await modelVersions.list(application.id, c.req.param("modelId"));
    if (!result.ok) {
      return c.json({ message: "No encontramos este modelo.", code: "notFound" }, 404);
    }

    return c.json({ versions: result.versions });
  });

  app.post(
    "/applications/:applicationId/models/:modelId/versions",
    bodyLimit({
      maxSize: MAX_MODEL_VERSION_BYTES,
      onError: (c) =>
        c.json(
          { message: "El archivo supera el tamaño máximo permitido.", code: "fileTooLarge" },
          413,
        ),
    }),
    async (c) => {
      const session = await getSession(c.req.raw.headers);
      if (!session) return c.json({ message: "Authentication required" }, 401);

      const application = await applications.get(c.req.param("applicationId"));
      if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);

      let body: Record<string, string | { arrayBuffer(): Promise<ArrayBuffer> }>;
      try {
        body = await c.req.parseBody();
      } catch {
        return c.json({ message: INVALID_MODEL_FILE_MESSAGE, code: "invalidModelFile" }, 400);
      }

      const parsedVersion = versionFieldSchema.safeParse(body.version);
      if (!parsedVersion.success) {
        return c.json(
          {
            message: parsedVersion.error.issues[0]?.message ?? INVALID_VERSION_MESSAGE,
            code: "invalidVersion",
          },
          400,
        );
      }

      const file = body.file;
      if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
        return c.json({ message: INVALID_MODEL_FILE_MESSAGE, code: "invalidModelFile" }, 400);
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await modelVersions.create({
        applicationId: application.id,
        modelId: c.req.param("modelId"),
        userId: session.user.id,
        version: parsedVersion.data,
        bytes,
        maxBytes: MAX_MODEL_VERSION_BYTES,
      });

      if (result.ok) return c.json({ modelVersion: result.modelVersion }, 201);

      switch (result.reason) {
        case "forbidden":
          return c.json(
            { message: "No tienes permiso para subir versiones de modelo.", code: "forbidden" },
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
        case "versionExists":
          return c.json(
            {
              message: "Esa versión ya existe para este modelo.",
              code: "modelVersionExists",
            },
            409,
          );
        case "modelNotFound":
          return c.json({ message: "No encontramos este modelo.", code: "notFound" }, 404);
        case "notFound":
          return c.json({ message: "No encontramos esta aplicación.", code: "notFound" }, 404);
        case "invalidVersion":
          return c.json({ message: INVALID_VERSION_MESSAGE, code: "invalidVersion" }, 400);
        case "compressed":
          return c.json(
            {
              message: "El archivo está comprimido. Sube el modelo .tflite sin comprimir.",
              code: "compressedModelFile",
            },
            400,
          );
        case "size":
          if (bytes.length > MAX_MODEL_VERSION_BYTES) {
            return c.json(
              { message: "El archivo supera el tamaño máximo permitido.", code: "fileTooLarge" },
              413,
            );
          }
          return c.json({ message: INVALID_MODEL_FILE_MESSAGE, code: "invalidModelFile" }, 400);
        case "identifier":
        case "root-offset":
        case "vtable":
          return c.json({ message: INVALID_MODEL_FILE_MESSAGE, code: "invalidModelFile" }, 400);
        case "storageFailed":
        case "storageConflict":
        case "databaseFailed":
          return c.json(
            {
              message: "No se pudo guardar la versión del modelo. Inténtalo de nuevo.",
              code: "modelVersionSaveFailed",
            },
            500,
          );
        default:
          return c.json(
            {
              message: "No se pudo guardar la versión del modelo. Inténtalo de nuevo.",
              code: "modelVersionSaveFailed",
            },
            500,
          );
      }
    },
  );

  return app;
}
