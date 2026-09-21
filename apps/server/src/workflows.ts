import { Hono } from "hono";
import { z } from "zod";

import type { Application } from "./applications";
import type { CreateWorkflowInput, CreateWorkflowResult } from "./workflow-store";

const NAME_REQUIRED_MESSAGE = "Ingresa un nombre para el workflow.";
const FORBIDDEN_MESSAGE = "No tienes permiso para crear workflows.";
const APPLICATION_ARCHIVED_MESSAGE = "No puedes crear workflows en una aplicación archivada.";
const APPLICATION_NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";

const createWorkflowSchema = z.object({
  name: z.string().trim().min(1),
});

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  workflows: {
    create: (input: CreateWorkflowInput) => Promise<CreateWorkflowResult>;
  };
};

export function createWorkflowsApp({ getSession, applications, workflows }: Dependencies) {
  const app = new Hono();

  app.post("/applications/:applicationId/workflows", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ message: NAME_REQUIRED_MESSAGE }, 400);
    }

    const parsed = createWorkflowSchema.safeParse(rawBody);
    if (!parsed.success) return c.json({ message: NAME_REQUIRED_MESSAGE }, 400);

    const result = await workflows.create({
      applicationId: application.id,
      userId: session.user.id,
      name: parsed.data.name,
    });

    if (result.ok) return c.json({ workflow: result.workflow }, 201);
    if (result.reason === "forbidden") {
      return c.json({ message: FORBIDDEN_MESSAGE }, 403);
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  return app;
}
