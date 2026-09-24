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
  ChangeWorkflowConnectionInput,
  ChangeWorkflowConnectionResult,
  CreateWorkflowInput,
  CreateWorkflowResult,
  RenameWorkflowInput,
  RenameWorkflowResult,
  UpdateWorkflowNodePositionInput,
  UpdateWorkflowNodePositionResult,
  Workflow,
  WorkflowDetail,
  WorkflowNodePosition,
} from "./workflow-store";
import { validateWorkflowDraft } from "./workflow-validation";
import type {
  PublishWorkflowVersionInput,
  PublishWorkflowVersionResult,
} from "./workflow-version-store";

const NAME_REQUIRED_MESSAGE = "Ingresa un nombre para el workflow.";
const WORKFLOW_NOT_FOUND_MESSAGE = "No encontramos este workflow.";
const FORBIDDEN_MESSAGE = "No tienes permiso para crear workflows.";
const FORBIDDEN_RENAME_MESSAGE = "No tienes permiso para editar este workflow.";
const FORBIDDEN_VALIDATE_MESSAGE = "No tienes permiso para validar este workflow.";
const FORBIDDEN_PUBLISH_MESSAGE = "No tienes permiso para publicar este workflow.";
const INVALID_VERSION_MESSAGE = "Ingresa una versión con formato SemVer, por ejemplo 1.0.0.";
const INVALID_DRAFT_MESSAGE = "Corrige los errores de validación antes de publicar.";
const PUBLISH_ARCHIVED_MESSAGE = "No puedes publicar versiones en una aplicación archivada.";
const APPLICATION_ARCHIVED_MESSAGE = "No puedes crear workflows en una aplicación archivada.";
const WORKFLOW_RENAME_ARCHIVED_MESSAGE = "No puedes editar workflows en una aplicación archivada.";
const DUPLICATE_IMAGE_INPUT_MESSAGE = "Este workflow ya tiene una entrada de imagen.";
const APPLICATION_NOT_FOUND_MESSAGE = "No encontramos esta aplicación.";
const WORKFLOW_POSITION_INVALID_MESSAGE = "No se pudo guardar la posición del nodo.";

const workflowNameSchema = z.object({
  name: z.string().trim().min(1),
});
const workflowPositionSchema = z.object({
  x: z.number().finite().min(0).max(100_000),
  y: z.number().finite().min(0).max(100_000),
});
const conditionNodeSchema = z.object({
  type: z.literal("condition"),
  sourceNodeId: z.string().min(1),
  label: z.string().trim().min(1),
  operator: z.enum(["gte", "gt", "lte", "lt"]),
  threshold: z.number().finite().min(0).max(1),
  position: workflowPositionSchema.optional(),
});
const outputNodeSchema = z.object({
  type: z.literal("output"),
  name: z.string().trim().min(1),
  sourceNodeId: z.string().min(1),
  sourcePort: z.enum(["result", "true", "false"]),
  resultType: z.enum(["classification", "detection", "boolean"]),
  position: workflowPositionSchema.optional(),
});
const workflowVersionSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/),
});
const connectionSchema = z.object({
  sourceNodeId: z.string().min(1),
  sourcePort: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetPort: z.string().min(1),
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
    addConnection: (
      input: ChangeWorkflowConnectionInput,
    ) => Promise<ChangeWorkflowConnectionResult>;
    removeConnection: (
      input: ChangeWorkflowConnectionInput,
    ) => Promise<ChangeWorkflowConnectionResult>;
    updateNodePosition: (
      input: UpdateWorkflowNodePositionInput,
    ) => Promise<UpdateWorkflowNodePositionResult>;
    publishVersion: (input: PublishWorkflowVersionInput) => Promise<PublishWorkflowVersionResult>;
  };
};

export function createWorkflowsApp({ getSession, applications, workflows }: Dependencies) {
  const app = new Hono();
  const getMemberApplication = async (applicationId: string, userId: string) => {
    const application = await applications.get(applicationId);
    const role =
      application && (await applications.getMembership(userId, application.organizationId));
    if (!application || !role) return undefined;
    return { ...application, role };
  };

  app.get("/applications/:applicationId/workflows", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

    return c.json({ workflows: await workflows.list(application.id) });
  });

  app.get("/applications/:applicationId/workflows/:workflowId", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

    const detail = await workflows.get(application.id, c.req.param("workflowId"));
    if (!detail) return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);

    return c.json(detail);
  });

  app.get("/applications/:applicationId/workflows/:workflowId/validation", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    if (application.role !== "admin" && application.role !== "owner")
      return c.json({ message: FORBIDDEN_VALIDATE_MESSAGE }, 403);

    const detail = await workflows.get(application.id, c.req.param("workflowId"));
    if (!detail) return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);

    return c.json(validateWorkflowDraft(detail.draft));
  });

  app.post("/applications/:applicationId/workflows/:workflowId/versions", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    const parsed = workflowVersionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ message: INVALID_VERSION_MESSAGE }, 400);
    const result = await workflows.publishVersion({
      applicationId: application.id,
      workflowId: c.req.param("workflowId"),
      userId: session.user.id,
      version: parsed.data.version,
    });
    if (result.ok) return c.json({ version: result.version }, 201);
    if (result.reason === "forbidden") return c.json({ message: FORBIDDEN_PUBLISH_MESSAGE }, 403);
    if (result.reason === "archived")
      return c.json({ message: PUBLISH_ARCHIVED_MESSAGE, code: "applicationArchived" }, 409);
    if (result.reason === "invalidDraft")
      return c.json(
        { message: INVALID_DRAFT_MESSAGE, code: "workflowInvalid", errors: result.errors },
        409,
      );
    if (result.reason === "versionExists")
      return c.json(
        {
          message: `Este workflow ya tiene una versión ${parsed.data.version}.`,
          code: "versionExists",
        },
        409,
      );
    if (result.reason === "workflowNotFound")
      return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  app.post("/applications/:applicationId/workflows", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);

    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

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

    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);

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
    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
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
    let position: WorkflowNodePosition | undefined;
    if ((body as { position?: unknown }).position !== undefined) {
      const parsedPosition = workflowPositionSchema.safeParse(
        (body as { position?: unknown }).position,
      );
      if (!parsedPosition.success)
        return c.json({ message: WORKFLOW_POSITION_INVALID_MESSAGE }, 400);
      position = parsedPosition.data;
    }
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
      const result = await workflows.addOutputNode({ ...workflowInput, ...output, position });
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
      const result = await workflows.addConditionNode({ ...workflowInput, ...condition, position });
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
            position,
          })
        : await workflows.addImageInput({ ...workflowInput, position });
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

  app.post("/applications/:applicationId/workflows/:workflowId/connections", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    const parsed = connectionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ message: "Selecciona puertos válidos." }, 400);
    const result = await workflows.addConnection({
      ...parsed.data,
      applicationId: application.id,
      workflowId: c.req.param("workflowId"),
      userId: session.user.id,
    });
    if (result.ok) return c.json({ draft: result.draft });
    if (result.reason === "forbidden") return c.json({ message: FORBIDDEN_RENAME_MESSAGE }, 403);
    if (result.reason === "archived")
      return c.json(
        { message: WORKFLOW_RENAME_ARCHIVED_MESSAGE, code: "applicationArchived" },
        409,
      );
    if (result.reason === "incompatible" || result.reason === "duplicate")
      return c.json(
        {
          message:
            result.reason === "duplicate"
              ? "Estos puertos ya están conectados."
              : "Estos puertos no son compatibles.",
        },
        409,
      );
    if (result.reason === "cycle")
      return c.json(
        {
          message: "Esta conexión crearía un ciclo. Los workflows deben ser acíclicos.",
          code: "workflowCycle",
          nodeIds: result.nodeIds,
        },
        409,
      );
    if (result.reason === "workflowNotFound")
      return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  app.patch(
    "/applications/:applicationId/workflows/:workflowId/nodes/:nodeId/position",
    async (c) => {
      const session = await getSession(c.req.raw.headers);
      if (!session) return c.json({ message: "Authentication required" }, 401);
      const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
      if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
      const parsed = workflowPositionSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ message: WORKFLOW_POSITION_INVALID_MESSAGE }, 400);
      const result = await workflows.updateNodePosition({
        ...parsed.data,
        applicationId: application.id,
        workflowId: c.req.param("workflowId"),
        nodeId: c.req.param("nodeId"),
        userId: session.user.id,
      });
      if (result.ok) return c.json({ position: result.position });
      if (result.reason === "forbidden") return c.json({ message: FORBIDDEN_RENAME_MESSAGE }, 403);
      if (result.reason === "archived")
        return c.json(
          { message: WORKFLOW_RENAME_ARCHIVED_MESSAGE, code: "applicationArchived" },
          409,
        );
      if (result.reason === "workflowNotFound" || result.reason === "nodeNotFound")
        return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
      return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    },
  );

  app.delete("/applications/:applicationId/workflows/:workflowId/connections", async (c) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ message: "Authentication required" }, 401);
    const application = await getMemberApplication(c.req.param("applicationId"), session.user.id);
    if (!application) return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
    const parsed = connectionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ message: "Selecciona una conexión válida." }, 400);
    const result = await workflows.removeConnection({
      ...parsed.data,
      applicationId: application.id,
      workflowId: c.req.param("workflowId"),
      userId: session.user.id,
    });
    if (result.ok) return c.json({ draft: result.draft });
    if (result.reason === "forbidden") return c.json({ message: FORBIDDEN_RENAME_MESSAGE }, 403);
    if (result.reason === "archived")
      return c.json(
        { message: WORKFLOW_RENAME_ARCHIVED_MESSAGE, code: "applicationArchived" },
        409,
      );
    if (result.reason === "workflowNotFound")
      return c.json({ message: WORKFLOW_NOT_FOUND_MESSAGE, code: "notFound" }, 404);
    if (result.reason === "connectionNotFound")
      return c.json({ message: "No encontramos esta conexión." }, 404);
    return c.json({ message: APPLICATION_NOT_FOUND_MESSAGE }, 404);
  });

  return app;
}
