import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import type { Application } from "./applications";
import type {
  CreateModelVersionResult,
  DeleteModelVersionResult,
  ListModelVersionsResult,
  ModelVersionContract,
} from "./model-version-store";

export const MAX_MODEL_VERSION_BYTES = 128 * 1024 * 1024;

const INVALID_MODEL_FILE_MESSAGE = "El archivo no es un modelo TensorFlow Lite válido.";
const INVALID_VERSION_MESSAGE = "Ingresa una versión con formato SemVer, por ejemplo 1.0.0.";
const MAX_MODEL_CONTRACT_BYTES = 1024 * 1024;

const versionFieldSchema = z
  .string({ error: INVALID_VERSION_MESSAGE })
  .trim()
  .regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/, {
    message: INVALID_VERSION_MESSAGE,
  });

const contractSchema = z
  .object({
    input: z
      .object({
        type: z.literal("image"),
        width: z.number().int().positive().max(8192),
        height: z.number().int().positive().max(8192),
        channels: z.union([z.literal(1), z.literal(3), z.literal(4)]),
        normalization: z.enum(["none", "zero_to_one", "minus_one_to_one"]),
      })
      .strict(),
    output: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("classification"),
          labels: z.array(z.string().trim().min(1)).min(1).max(1001),
        })
        .strict(),
      z
        .object({
          type: z.literal("detection"),
          labels: z.array(z.string().trim().min(1)).min(1).max(1001),
          scoreThreshold: z.number().min(0).max(1),
        })
        .strict(),
    ]),
  })
  .strict();
const INCOMPATIBLE_CONTRACT_MESSAGE = "El contrato no es compatible con TensorFlow Lite.";

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
    createUploadUrl: (key: string, expiresIn: number) => Promise<string>;
    getArtifactSize: (key: string) => Promise<number | null>;
    getArtifact: (key: string) => Promise<Uint8Array>;
    removeArtifact: (key: string) => Promise<void>;
    list: (applicationId: string, modelId: string) => Promise<ListModelVersionsResult>;
    remove: (input: {
      applicationId: string;
      modelId: string;
      modelVersionId: string;
      userId: string;
    }) => Promise<DeleteModelVersionResult>;
    setContract: (input: {
      applicationId: string;
      modelId: string;
      modelVersionId: string;
      userId: string;
      contract: ModelVersionContract;
    }) => Promise<
      | { ok: true; contract: ModelVersionContract }
      | {
          ok: false;
          reason: "notFound" | "forbidden" | "archived" | "incompatibleContract" | "databaseFailed";
        }
    >;
  };
};

export function createModelVersionsApp({ getSession, applications, modelVersions }: Dependencies) {
  const app = new Hono();

  app.post("/applications/:applicationId/models/:modelId/versions/upload-url", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);
    const role = await applications.getMembership(session.user.id, application.organizationId);
    if (!role) return c.json({ message: "No encontramos esta aplicación." }, 404);
    if (role !== "admin" && role !== "owner") {
      return c.json(
        { message: "No tienes permiso para subir versiones de modelo.", code: "forbidden" },
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
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const parsed = z.object({ version: versionFieldSchema }).safeParse(body);
    if (!parsed.success)
      return c.json({ message: INVALID_VERSION_MESSAGE, code: "invalidVersion" }, 400);
    const model = await modelVersions.list(application.id, c.req.param("modelId"));
    if (!model.ok) return c.json({ message: "No encontramos este modelo.", code: "notFound" }, 404);
    const uploadId = crypto.randomUUID();
    const key = `staging/${application.id}/models/${c.req.param("modelId")}/${uploadId}.tflite`;
    try {
      const uploadUrl = await modelVersions.createUploadUrl(key, 900);
      return c.json({ uploadId, uploadUrl });
    } catch {
      return c.json(
        { message: "No se pudo iniciar la subida del modelo.", code: "uploadFailed" },
        500,
      );
    }
  });

  app.post("/applications/:applicationId/models/:modelId/versions/complete", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);
    const role = await applications.getMembership(session.user.id, application.organizationId);
    if (!role) return c.json({ message: "No encontramos esta aplicación." }, 404);
    if (role !== "admin" && role !== "owner") {
      return c.json(
        { message: "No tienes permiso para subir versiones de modelo.", code: "forbidden" },
        403,
      );
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const parsed = z
      .object({ version: versionFieldSchema, uploadId: z.string().uuid() })
      .safeParse(body);
    if (!parsed.success)
      return c.json({ message: "La subida no es válida.", code: "invalidUpload" }, 400);
    const model = await modelVersions.list(application.id, c.req.param("modelId"));
    if (!model.ok) return c.json({ message: "No encontramos este modelo.", code: "notFound" }, 404);
    const key = `staging/${application.id}/models/${c.req.param("modelId")}/${parsed.data.uploadId}.tflite`;
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
      const size = await modelVersions.getArtifactSize(key);
      if (size === null)
        return c.json({ message: INVALID_MODEL_FILE_MESSAGE, code: "invalidModelFile" }, 400);
      if (size > MAX_MODEL_VERSION_BYTES)
        return c.json(
          { message: "El archivo supera el tamaño máximo permitido.", code: "fileTooLarge" },
          413,
        );
      const bytes = await modelVersions.getArtifact(key);
      const result = await modelVersions.create({
        applicationId: application.id,
        modelId: c.req.param("modelId"),
        userId: session.user.id,
        version: parsed.data.version,
        bytes,
        maxBytes: MAX_MODEL_VERSION_BYTES,
      });
      if (result.ok) return c.json({ modelVersion: result.modelVersion }, 201);
      const status =
        result.reason === "forbidden"
          ? 403
          : result.reason === "archived" || result.reason === "versionExists"
            ? 409
            : result.reason === "modelNotFound" || result.reason === "notFound"
              ? 404
              : result.reason === "size"
                ? 413
                : ["compressed", "identifier", "root-offset", "vtable"].includes(result.reason)
                  ? 400
                  : 500;
      const code =
        result.reason === "versionExists"
          ? "modelVersionExists"
          : result.reason === "archived"
            ? "applicationArchived"
            : result.reason === "forbidden"
              ? "forbidden"
              : result.reason === "size"
                ? "fileTooLarge"
                : result.reason === "compressed"
                  ? "compressedModelFile"
                  : ["identifier", "root-offset", "vtable"].includes(result.reason)
                    ? "invalidModelFile"
                    : "modelVersionSaveFailed";
      return c.json(
        {
          message:
            code === "modelVersionSaveFailed"
              ? "No se pudo guardar la versión del modelo. Inténtalo de nuevo."
              : "No se pudo validar la versión del modelo.",
          code,
        },
        status as 400,
      );
    } catch {
      return c.json(
        {
          message: "No se pudo guardar la versión del modelo. Inténtalo de nuevo.",
          code: "modelVersionSaveFailed",
        },
        500,
      );
    } finally {
      await modelVersions.removeArtifact(key).catch(() => {});
    }
  });

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
    if (result.ok === false) {
      return c.json({ message: "No encontramos este modelo.", code: "notFound" }, 404);
    }

    return c.json({ versions: result.versions });
  });

  app.patch(
    "/applications/:applicationId/models/:modelId/versions/:modelVersionId/contract",
    bodyLimit({
      maxSize: MAX_MODEL_CONTRACT_BYTES,
      onError: (c) =>
        c.json(
          { message: "El contrato supera el tamaño máximo permitido.", code: "contractTooLarge" },
          413,
        ),
    }),
    async (c) => {
      const session = await getSession(c.req.raw.headers);
      if (!session) return c.json({ message: "Authentication required" }, 401);

      const application = await applications.get(c.req.param("applicationId"));
      if (!application)
        return c.json({ message: "No encontramos esta versión de modelo.", code: "notFound" }, 404);
      const role = await applications.getMembership(session.user.id, application.organizationId);
      if (role !== "admin" && role !== "owner") {
        return c.json(
          {
            message: "No tienes permiso para editar el contrato de esta versión.",
            code: "forbidden",
          },
          403,
        );
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(
          { message: INCOMPATIBLE_CONTRACT_MESSAGE, code: "incompatibleContract" },
          400,
        );
      }
      const parsed = contractSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { message: INCOMPATIBLE_CONTRACT_MESSAGE, code: "incompatibleContract" },
          400,
        );
      }

      const result = await modelVersions.setContract({
        applicationId: application.id,
        modelId: c.req.param("modelId"),
        modelVersionId: c.req.param("modelVersionId"),
        userId: session.user.id,
        contract: parsed.data,
      });
      if (result.ok) return c.json({ contract: result.contract });
      if (result.reason === "forbidden") {
        return c.json(
          {
            message: "No tienes permiso para editar el contrato de esta versión.",
            code: "forbidden",
          },
          403,
        );
      }
      if (result.reason === "archived") {
        return c.json(
          {
            message: "No puedes editar contratos de una aplicación archivada.",
            code: "applicationArchived",
          },
          409,
        );
      }
      if (result.reason === "incompatibleContract") {
        return c.json(
          { message: INCOMPATIBLE_CONTRACT_MESSAGE, code: "incompatibleContract" },
          400,
        );
      }
      if (result.reason === "databaseFailed") {
        return c.json(
          {
            message: "No se pudo guardar el contrato de esta versión.",
            code: "contractSaveFailed",
          },
          500,
        );
      }
      return c.json({ message: "No encontramos esta versión de modelo.", code: "notFound" }, 404);
    },
  );

  app.delete("/applications/:applicationId/models/:modelId/versions/:modelVersionId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) {
      return c.json({ message: "No encontramos esta aplicación.", code: "notFound" }, 404);
    }

    const role = await applications.getMembership(session.user.id, application.organizationId);
    if (role !== "admin" && role !== "owner") {
      return c.json(
        { message: "No tienes permiso para eliminar versiones de modelo.", code: "forbidden" },
        403,
      );
    }

    const result = await modelVersions.remove({
      applicationId: application.id,
      modelId: c.req.param("modelId"),
      modelVersionId: c.req.param("modelVersionId"),
      userId: session.user.id,
    });
    if (result.ok === true) return c.body(null, 204);

    switch (result.reason) {
      case "forbidden":
        return c.json(
          { message: "No tienes permiso para eliminar versiones de modelo.", code: "forbidden" },
          403,
        );
      case "inUse":
        return c.json(
          {
            message: "No puedes eliminar esta versión porque un workflow la usa.",
            code: "modelVersionInUse",
          },
          409,
        );
      case "notFound":
        return c.json({ message: "No encontramos esta versión de modelo.", code: "notFound" }, 404);
      case "archived":
        return c.json(
          {
            message: "No puedes eliminar versiones de una aplicación archivada.",
            code: "applicationArchived",
          },
          409,
        );
      case "storageFailed":
      case "databaseFailed":
        return c.json(
          {
            message: "No se pudo eliminar la versión del modelo.",
            code: "modelVersionDeleteFailed",
          },
          500,
        );
    }
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

      if (result.ok === true) return c.json({ modelVersion: result.modelVersion }, 201);

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
