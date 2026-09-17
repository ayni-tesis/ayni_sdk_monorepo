import { Hono } from "hono";
import { z } from "zod";

export type Application = {
  id: string;
  organizationId: string;
  name: string;
  status: "active" | "archived";
};

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
    create: (application: Pick<Application, "organizationId" | "name">) => Promise<Application>;
    list: (organizationId: string) => Promise<Application[]>;
    get: (id: string) => Promise<Application | undefined>;
    rename: (id: string, name: string) => Promise<Application | undefined>;
    archive: (id: string) => Promise<Application | undefined>;
  };
};

const nameSchema = z.object({ name: z.string().trim().min(1) });

export function createApp({ getSession, applications }: Dependencies) {
  const app = new Hono();

  app.post("/organizations/:organizationId/applications", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const organizationId = c.req.param("organizationId");
    const role = await applications.getMembership(session.user.id, organizationId);
    if (role !== "admin" && role !== "owner") {
      return c.json(
        { message: "No tienes permiso para crear aplicaciones en este workspace." },
        403,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: "Ingresa un nombre para la aplicación." }, 400);
    }

    const body = nameSchema.safeParse(rawBody);
    if (!body.success) return c.json({ message: "Ingresa un nombre para la aplicación." }, 400);

    return c.json(await applications.create({ organizationId, name: body.data.name }), 201);
  });

  app.get("/organizations/:organizationId/applications", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const organizationId = c.req.param("organizationId");
    if (!(await applications.getMembership(session.user.id, organizationId))) {
      return c.json({ message: "No tienes acceso a este workspace." }, 403);
    }

    return c.json(
      (await applications.list(organizationId)).filter(
        (application) => application.status === "active",
      ),
    );
  });

  app.get("/applications/:applicationId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: "No encontramos esta aplicación." }, 404);
    }

    return c.json(application);
  });

  app.patch("/applications/:applicationId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);

    const role = await applications.getMembership(session.user.id, application.organizationId);
    if (role !== "admin" && role !== "owner") {
      return c.json({ message: "No tienes permiso para editar esta aplicación." }, 403);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: "Ingresa un nombre para la aplicación." }, 400);
    }

    const body = nameSchema.safeParse(rawBody);
    if (!body.success) return c.json({ message: "Ingresa un nombre para la aplicación." }, 400);

    return c.json(await applications.rename(application.id, body.data.name));
  });

  app.post("/applications/:applicationId/archive", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (!application) return c.json({ message: "No encontramos esta aplicación." }, 404);

    const role = await applications.getMembership(session.user.id, application.organizationId);
    if (role !== "admin" && role !== "owner") {
      return c.json({ message: "No tienes permiso para archivar esta aplicación." }, 403);
    }

    return c.json(await applications.archive(application.id));
  });

  return app;
}
