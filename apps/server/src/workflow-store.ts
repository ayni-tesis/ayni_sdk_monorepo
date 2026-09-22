import { workflow } from "@ayni/db/schema/index";
import { asc, eq } from "drizzle-orm";
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
};

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
