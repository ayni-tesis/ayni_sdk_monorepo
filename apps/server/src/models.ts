import { Hono } from "hono";
import { z } from "zod";

import type { Application } from "./applications";
import type { CreateModelResult, Model } from "./model-store";

const APPLICATION_ARCHIVED_MESSAGE = "No puedes registrar modelos en una aplicación archivada.";

const registerModelSchema = z.object({
  name: z
    .string({ error: "Ingresa un nombre para el modelo." })
    .trim()
    .min(1, { message: "Ingresa un nombre para el modelo." }),
  runtime: z
    .enum(["tensorflow_lite", "TensorFlow Lite"], {
      error: "El primer runtime admitido es TensorFlow Lite.",
    })
    .transform(() => "tensorflow_lite" as const),
});

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  models: {
    create: (input: {
      applicationId: string;
      userId: string;
      name: string;
      runtime: "tensorflow_lite";
    }) => Promise<CreateModelResult>;
    list: (applicationId: string) => Promise<Model[]>;
  };
};

export function createModelsApp({ getSession, applications, models }: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/models", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: "No encontramos esta aplicación." }, 404);
    }

    return c.json({ models: await models.list(application.id) });
  });

  app.post("/applications/:applicationId/models", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: "Ingresa un nombre para el modelo." }, 400);
    }

    const parsed = registerModelSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message = issue?.message ?? "Ingresa un nombre para el modelo.";
      return c.json({ message }, 400);
    }

    const result = await models.create({
      applicationId: application.id,
      userId: session.user.id,
      name: parsed.data.name,
      runtime: parsed.data.runtime,
    });

    if (result.ok === true) return c.json({ model: result.model }, 201);
    if (result.reason === "forbidden") {
      return c.json({ message: "No tienes permiso para registrar modelos." }, 403);
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    return c.json({ message: "No encontramos esta aplicación." }, 404);
  });

  return app;
}
