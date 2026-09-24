import { workflow } from "@ayni/db/schema/index";
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

export type WorkflowNode = { id: string; type: "input.image"; outputs: { imagen: "image" } };
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
