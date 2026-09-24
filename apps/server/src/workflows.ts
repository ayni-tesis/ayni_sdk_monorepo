import { Hono } from "hono";
import { z } from "zod";

import type { Application } from "./applications";
import type {
  AddConditionNodeInput,
  AddConditionNodeResult,
  AddImageInputInput,
  AddImageInputResult,
  AddModelNodeInput,
  AddModelNodeResult,
  AddOutputNodeInput,
  AddOutputNodeResult,
  CreateWorkflowInput,
  CreateWorkflowResult,
  RenameWorkflowInput,
  RenameWorkflowResult,
  Workflow,
  WorkflowDetail,
} from "./workflow-store";

const NAME_REQUIRED_MESSAGE = "Ingresa un nombre para el workflow.";
const WORKFLOW_NOT_FOUND_MESSAGE = "No encontramos este workflow.";
const FORBIDDEN_MESSAGE = "No tienes permiso para crear workflows.";
const FORBIDDEN_RENAME_MESSAGE = "No tienes permiso para editar este workflow.";
const APPLICATION_ARCHIVED_MESSAGE = "No puedes crear workflows en una aplicación archivada.";
const WORKFLOW_RENAME_ARCHIVED_MESSAGE = "No puedes editar workflows en una aplicación archivada.";
const DUPLICATE_IMAGE_INPUT_MESSAGE = "Este workflow ya tiene una entrada de imagen.";
const APPLICATION_NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";

const workflowNameSchema = z.object({
  name: z.string().trim().min(1),
});
const conditionNodeSchema = z.object({
  type: z.literal("condition"),
  sourceNodeId: z.string().min(1),
  label: z.string().trim().min(1),
  operator: z.enum(["gte", "gt", "lte", "lt"]),
  threshold: z.number().finite().min(0).max(1),
});
const outputNodeSchema = z.object({
  type: z.literal("output"),
  name: z.string().trim().min(1),
  sourceNodeId: z.string().min(1),
  sourcePort: z.enum(["result", "true", "false"]),
  resultType: z.enum(["classification", "detection", "boolean"]),
});

type Dependencies = {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  applications: {
    get: (id: string) => Promise<Application | undefined>;
    getMembership: (userId: string, organizationId: string) => Promise<string | undefined>;
  };
  workflows: {
    create: (input: CreateWorkflowInput) => Promise<CreateWorkflowResult>;
    list: (applicationId: string) => Promise<Workflow[]>;
    get: (applicationId: string, workflowId: string) => Promise<WorkflowDetail | undefined>;
    rename: (input: RenameWorkflowInput) => Promise<RenameWorkflowResult>;
    addImageInput: (input: AddImageInputInput) => Promise<AddImageInputResult>;
    addModelNode: (input: AddModelNodeInput) => Promise<AddModelNodeResult>;
    addConditionNode: (input: AddConditionNodeInput) => Promise<AddConditionNodeResult>;
    addOutputNode: (input: AddOutputNodeInput) => Promise<AddOutputNodeResult>;
  };
};

export function createWorkflowsApp({ getSession, applications, workflows }: Dependencies) {
  const app = new Hono();

  app.get("/applications/:applicationId/workflows", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    }

    return c.json({ workflows: await workflows.list(application.id) });
  });

  app.get("/applications/:applicationId/workflows/:workflowId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    ) {
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    }

    const detail = await workflows.get(application.id, c.req.param("workflowId"));
    if (!detail) return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);

    return c.json(detail);
  });

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

    const parsed = workflowNameSchema.safeParse(rawBody);
    if (!parsed.success) return c.json({ message: NAME_REQUIRED_MESSAGE }, 400);

    const result = await workflows.create({
      applicationId: application.id,
      userId: session.user.id,
      name: parsed.data.name,
    });

    if (result.ok === true) return c.json({ workflow: result.workflow }, 201);
    if (result.reason === "forbidden") {
      return c.json({ message: FORBIDDEN_MESSAGE }, 403);
    }
    if (result.reason === "archived") {
      return c.json({ message: APPLICATION_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    }

    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  app.patch("/applications/:applicationId/workflows/:workflowId", async (c) => {
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

    const parsed = workflowNameSchema.safeParse(rawBody);
    if (!parsed.success) return c.json({ message: NAME_REQUIRED_MESSAGE }, 400);

    const result = await workflows.rename({
      applicationId: application.id,
      workflowId: c.req.param("workflowId"),
      userId: session.user.id,
      name: parsed.data.name,
    });

    if (result.ok === false) {
      if (result.reason === "forbidden") {
        return c.json({ message: FORBIDDEN_RENAME_MESSAGE }, 403);
      }
      if (result.reason === "archived") {
        return c.json(
          { message: WORKFLOW_RENAME_ARCHIVED_MESSAGE, code: "applicationArchived" },
          409,
        );
      }
      if (result.reason === "workflowNotFound") {
        return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
      }

      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    }

    return c.json({ workflow: result.workflow });
  });

  app.post("/applications/:applicationId/workflows/:workflowId/nodes", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await applications.get(c.req.param("applicationId"));
    if (
      !application ||
      !(await applications.getMembership(session.user.id, application.organizationId))
    )
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !["input.image", "model.tflite", "condition", "output"].includes(
        (body as { type?: string }).type ?? "",
      )
    ) {
      return c.json({ message: "Tipo de nodo no válido." }, 400);
    }
    const workflowInput = {
      applicationId: application.id,
      workflowId: c.req.param("workflowId"),
      userId: session.user.id,
    };
    const nodeType = (body as { type: string }).type;
    if (nodeType === "output") {
      const parsed = outputNodeSchema.safeParse(body);
      if (!parsed.success) {
        const paths = parsed.error.issues.map((issue) => issue.path[0]);
        const message = paths.includes("name")
          ? "Ingresa un nombre para la salida."
          : paths.some((path) => path === "resultType" || path === "sourcePort")
            ? "Selecciona un tipo de resultado para la salida."
            : "Selecciona un resultado compatible para la salida.";
        return c.json({ message }, 400);
      }
      const { type: _type, ...output } = parsed.data;
      const result = await workflows.addOutputNode({ ...workflowInput, ...output });
      if (result.ok) return c.json({ draft: result.draft });
      if (result.reason === "forbidden")
        return c.json({ message: "No tienes permiso para editar este workflow." }, 403);
      if (result.reason === "archived")
        return c.json(
          { message: WORKFLOW_RENAME_ARCHIVED_MESSAGE, code: "applicationArchived" },
          409,
        );
      if (result.reason === "incompatibleSource")
        return c.json(
          { message: "El resultado seleccionado no es compatible con la salida." },
          409,
        );
      if (result.reason === "workflowNotFound")
        return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    }
    if (nodeType === "condition") {
      const parsed = conditionNodeSchema.safeParse(body);
      if (!parsed.success) return c.json({ message: "Ingresa una condición válida." }, 400);
      const { type: _type, ...condition } = parsed.data;
      const result = await workflows.addConditionNode({ ...workflowInput, ...condition });
      if (result.ok) return c.json({ draft: result.draft });
      if (result.reason === "forbidden")
        return c.json({ message: "No tienes permiso para editar este workflow." }, 403);
      if (result.reason === "archived")
        return c.json(
          { message: WORKFLOW_RENAME_ARCHIVED_MESSAGE, code: "applicationArchived" },
          409,
        );
      if (result.reason === "incompatibleSource")
        return c.json(
          { message: "Esta condición no es compatible con la salida seleccionada." },
          409,
        );
      if (result.reason === "workflowNotFound")
        return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    }
    const result =
      nodeType === "model.tflite"
        ? await workflows.addModelNode({
            ...workflowInput,
            modelVersionId:
              typeof (body as { modelVersionId?: unknown }).modelVersionId === "string"
                ? (body as { modelVersionId: string }).modelVersionId
                : "",
          })
        : await workflows.addImageInput(workflowInput);
    if (result.ok) return c.json({ draft: result.draft });
    if (result.reason === "forbidden")
      return c.json({ message: "No tienes permiso para editar este workflow." }, 403);
    if (result.reason === "archived")
      return c.json(
        { message: WORKFLOW_RENAME_ARCHIVED_MESSAGE, code: "applicationArchived" },
        409,
      );
    if (result.reason === "duplicate")
      return c.json({ message: DUPLICATE_IMAGE_INPUT_MESSAGE }, 409);
    if (result.reason === "contractRequired")
      return c.json(
        { message: "Esta versión necesita un contrato antes de usarse en un workflow." },
        409,
      );
    if (result.reason === "modelVersionNotFound")
      return c.json(
        { message: "No encontramos esta versión de modelo.", code: "modelVersionNotFound" },
        404,
      );
    if (result.reason === "workflowNotFound")
      return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  return app;
}
