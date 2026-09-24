import { type ModelVersionContract, model, modelVersion, workflow } from "@ayni/db/schema/index";
import { and, asc, eq, not, sql } from "drizzle-orm";
import {
  type ApplicationDatabase,
  executeApplicationAction,
  type TransactionExecutor,
} from "./application-actions";
import { toIsoString } from "./model-store";

export type { TransactionExecutor };
export type WorkflowDatabase = ApplicationDatabase;

export type Workflow = {
  id: string;
  applicationId: string;
  name: string;
  status: "draft";
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRow = {
  id: string;
  applicationId: string;
  name: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  draft?: WorkflowDraft;
};

export type WorkflowNode =
  | { id: string; type: "input.image"; outputs: { imagen: "image" } }
  | {
      id: string;
      type: "model.tflite";
      modelVersionId: string;
      modelName: string;
      version: string;
      inputs: { image: ModelVersionContract["input"] };
      outputs: { result: ModelVersionContract["output"] };
    }
  | {
      id: string;
      type: "condition";
      sourceNodeId: string;
      label: string;
      operator: "gte" | "gt" | "lte" | "lt";
      threshold: number;
      branches: { true: "Verdadero"; false: "Falso" };
    };
export type WorkflowDraft = { nodes: WorkflowNode[] };

export function toWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    applicationId: row.applicationId,
    name: row.name,
    status: "draft",
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

export type CreateWorkflowResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export type CreateWorkflowInput = {
  applicationId: string;
  userId: string;
  name: string;
};

/**
 * Creates an empty draft workflow owned by exactly one active application.
 * Only workspace administrators and owners may create it; the workflow starts
 * with no nodes and no published version.
 */
export async function createWorkflow(
  database: WorkflowDatabase,
  { applicationId, userId, name }: CreateWorkflowInput,
): Promise<CreateWorkflowResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const workflowRows = (await tx
        .insert(workflow)
        .values({
          id: crypto.randomUUID(),
          applicationId: application.id,
          name,
          status: "draft",
        })
        .returning()) as WorkflowRow[];
      const created = workflowRows[0];

      if (!created) throw new Error("Workflow creation returned no record");

      return toWorkflow(created);
    },
  );

  if (result.ok === false) return result;
  return { ok: true, workflow: result.value };
}

type WorkflowUpdateExecutor = TransactionExecutor & {
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => { returning: () => Promise<Record<string, unknown>[]> };
    };
  };
};

export type AddImageInputResult =
  | { ok: true; draft: WorkflowDraft }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" | "workflowNotFound" | "duplicate" };

export type AddImageInputInput = { applicationId: string; workflowId: string; userId: string };

export async function addImageInputNode(
  database: WorkflowDatabase,
  { applicationId, workflowId, userId }: AddImageInputInput,
): Promise<AddImageInputResult> {
  const node: WorkflowNode = {
    id: crypto.randomUUID(),
    type: "input.image",
    outputs: { imagen: "image" },
  };
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const updater = tx as WorkflowUpdateExecutor;
      const rows = (await updater
        .update(workflow)
        .set({
          draft: sql`jsonb_set(${workflow.draft}, '{nodes}', ${workflow.draft}->'nodes' || ${JSON.stringify(node)}::jsonb)`,
        })
        .where(
          and(
            eq(workflow.id, workflowId),
            eq(workflow.applicationId, application.id),
            not(
              sql`jsonb_path_exists(${workflow.draft}, '$.nodes[*] ? (@.type == "input.image")')`,
            ),
          ),
        )
        .returning()) as WorkflowRow[];
      return rows[0];
    },
  );
  if (!result.ok) return result;
  if (result.value) return { ok: true, draft: result.value.draft ?? { nodes: [node] } };

  const existing = await getWorkflow(database, applicationId, workflowId);
  return existing ? { ok: false, reason: "duplicate" } : { ok: false, reason: "workflowNotFound" };
}

export type AddModelNodeInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
  modelVersionId: string;
};

export type AddModelNodeResult =
  | { ok: true; draft: WorkflowDraft }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "notFound"
        | "archived"
        | "workflowNotFound"
        | "modelVersionNotFound"
        | "contractRequired";
    };

type ModelVersionLookupExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      innerJoin: (
        table: unknown,
        condition: unknown,
      ) => {
        where: (condition: unknown) => {
          limit: (count: number) => Promise<Record<string, unknown>[]>;
        };
      };
    };
  };
};

export async function addModelNode(
  database: WorkflowDatabase,
  { applicationId, workflowId, userId, modelVersionId }: AddModelNodeInput,
): Promise<AddModelNodeResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const lookup = tx as unknown as ModelVersionLookupExecutor;
      const versions = (await lookup
        .select({
          id: modelVersion.id,
          version: modelVersion.version,
          contract: modelVersion.contract,
          modelName: model.name,
        })
        .from(modelVersion)
        .innerJoin(model, eq(model.id, modelVersion.modelId))
        .where(and(eq(modelVersion.id, modelVersionId), eq(model.applicationId, application.id)))
        .limit(1)) as {
        id: string;
        version: string;
        contract: ModelVersionContract | null;
        modelName: string;
      }[];
      const selected = versions[0];
      if (!selected) return { kind: "modelVersionNotFound" as const };
      if (!selected.contract) return { kind: "contractRequired" as const };

      const node: WorkflowNode = {
        id: crypto.randomUUID(),
        type: "model.tflite",
        modelVersionId: selected.id,
        modelName: selected.modelName,
        version: selected.version,
        inputs: { image: selected.contract.input },
        outputs: { result: selected.contract.output },
      };
      const updater = tx as WorkflowUpdateExecutor;
      const rows = (await updater
        .update(workflow)
        .set({
          draft: sql`jsonb_set(${workflow.draft}, '{nodes}', ${workflow.draft}->'nodes' || ${JSON.stringify(node)}::jsonb)`,
        })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return rows[0]
        ? { kind: "added" as const, draft: rows[0].draft ?? { nodes: [node] } }
        : { kind: "workflowNotFound" as const };
    },
  );
  if (!result.ok) return result;
  if (result.value.kind === "added") return { ok: true, draft: result.value.draft };
  return { ok: false, reason: result.value.kind };
}

export type AddConditionNodeInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
  sourceNodeId: string;
  label: string;
  operator: "gte" | "gt" | "lte" | "lt";
  threshold: number;
};
export type AddConditionNodeResult =
  | { ok: true; draft: WorkflowDraft }
  | {
      ok: false;
      reason: "forbidden" | "notFound" | "archived" | "workflowNotFound" | "incompatibleSource";
    };

export async function addConditionNode(
  database: WorkflowDatabase,
  {
    applicationId,
    workflowId,
    userId,
    sourceNodeId,
    label,
    operator,
    threshold,
  }: AddConditionNodeInput,
): Promise<AddConditionNodeResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const reader = tx as unknown as {
        select: (fields: Record<string, unknown>) => {
          from: (table: unknown) => {
            where: (condition: unknown) => {
              limit: (count: number) => Promise<{ draft: WorkflowDraft }[]>;
            };
          };
        };
      };
      const rows = await reader
        .select({ draft: workflow.draft })
        .from(workflow)
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .limit(1);
      const draft = rows[0]?.draft;
      if (!rows[0]) return { kind: "workflowNotFound" as const };
      const source = draft?.nodes.find((node) => node.id === sourceNodeId);
      if (
        !draft ||
        !source ||
        source.type !== "model.tflite" ||
        source.outputs.result.type !== "classification" ||
        !source.outputs.result.labels.includes(label)
      )
        return { kind: "incompatibleSource" as const };
      const node: WorkflowNode = {
        id: crypto.randomUUID(),
        type: "condition",
        sourceNodeId,
        label,
        operator,
        threshold,
        branches: { true: "Verdadero", false: "Falso" },
      };
      const updater = tx as WorkflowUpdateExecutor;
      const updated = (await updater
        .update(workflow)
        .set({
          draft: sql`jsonb_set(${workflow.draft}, '{nodes}', ${workflow.draft}->'nodes' || ${JSON.stringify(node)}::jsonb)`,
        })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return updated[0]
        ? { kind: "added" as const, draft: updated[0].draft ?? { nodes: [...draft.nodes, node] } }
        : { kind: "workflowNotFound" as const };
    },
  );
  if (!result.ok) return result;
  return result.value.kind === "added"
    ? { ok: true, draft: result.value.draft }
    : { ok: false, reason: result.value.kind };
}

export type RenameWorkflowInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
  name: string;
};

export type RenameWorkflowResult =
  | { ok: true; workflow: Workflow }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" | "workflowNotFound" };

/**
 * Renames a workflow without touching its id, its application, or any of its
 * draft or published versions. Only workspace administrators and owners of
 * an active application may rename it.
 */
export async function renameWorkflow(
  database: WorkflowDatabase,
  { applicationId, workflowId, userId, name }: RenameWorkflowInput,
): Promise<RenameWorkflowResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const updater = tx as WorkflowUpdateExecutor;

      const workflowRows = (await updater
        .update(workflow)
        .set({ name })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];

      return workflowRows[0];
    },
  );

  if (result.ok === false) {
    if (result.reason === "forbidden") return { ok: false, reason: "forbidden" };
    if (result.reason === "archived") return { ok: false, reason: "archived" };
    return { ok: false, reason: "notFound" };
  }
  if (!result.value) return { ok: false, reason: "workflowNotFound" };
  return { ok: true, workflow: toWorkflow(result.value) };
}

/**
 * Workflow detail: the workflow, its persisted draft nodes, and published
 * versions. Published versions remain empty until US-036 adds version storage.
 */
export type WorkflowDetail = {
  workflow: Workflow;
  draft: WorkflowDraft;
  versions: never[];
};

type GetWorkflowExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/**
 * Reads one workflow with its draft and published versions. The query is
 * filtered by application id as well, so a workflow of another application is
 * indistinguishable from a missing one; callers must have already established
 * that the requester belongs to the application's workspace.
 */
export async function getWorkflow(
  database: WorkflowDatabase,
  applicationId: string,
  workflowId: string,
): Promise<WorkflowDetail | undefined> {
  return database.transaction(async (transaction) => {
    const tx = transaction as GetWorkflowExecutor;

    const rows = (await tx
      .select({
        id: workflow.id,
        applicationId: workflow.applicationId,
        name: workflow.name,
        status: workflow.status,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
        draft: workflow.draft,
      })
      .from(workflow)
      .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, applicationId)))
      .limit(1)) as WorkflowRow[];

    const row = rows[0];
    if (!row) return undefined;

    const emptyVersions: never[] = [];
    return {
      workflow: toWorkflow(row),
      draft: row.draft ?? { nodes: [] },
      versions: emptyVersions,
    };
  });
}

type ListWorkflowsExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        orderBy: (column: unknown) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/**
 * Lists the workflows owned by one application, oldest first. The query is
 * filtered by application id only; callers must have already established that
 * the requester belongs to the application's workspace.
 */
export async function listWorkflows(
  database: WorkflowDatabase,
  applicationId: string,
): Promise<Workflow[]> {
  return database.transaction(async (transaction) => {
    const tx = transaction as ListWorkflowsExecutor;

    const rows = (await tx
      .select({
        id: workflow.id,
        applicationId: workflow.applicationId,
        name: workflow.name,
        status: workflow.status,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      })
      .from(workflow)
      .where(eq(workflow.applicationId, applicationId))
      .orderBy(asc(workflow.createdAt))) as WorkflowRow[];

    return rows.map(toWorkflow);
  });
}
