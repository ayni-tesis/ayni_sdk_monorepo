import { application, workflow, workflowVersion } from "@ayni/db/schema/index";
import { and, eq, ne } from "drizzle-orm";
import { executeApplicationAction } from "./application-actions";
import {
  toWorkflowVersion,
  type WorkflowDatabase,
  type WorkflowDraft,
  type WorkflowVersion,
  type WorkflowVersionRow,
} from "./workflow-store";
import { validateWorkflowDraft, type WorkflowValidationError } from "./workflow-validation";

export type PublishWorkflowVersionInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
  version: string;
};

export type PublishWorkflowVersionResult =
  | { ok: true; version: WorkflowVersion }
  | { ok: false; reason: "invalidDraft"; errors: WorkflowValidationError[] }
  | {
      ok: false;
      reason: "forbidden" | "notFound" | "archived" | "workflowNotFound" | "versionExists";
    };

/**
 * Publishes the current draft as an immutable workflow version. The draft is
 * read and validated while its workflow row is locked, so the stored DAG is
 * exactly the validated one, and concurrent publishes of the same workflow
 * serialize on that lock before the version identifier is checked for reuse.
 * Only administrators and owners of an active application may publish.
 */
export async function publishWorkflowVersion(
  database: WorkflowDatabase,
  { applicationId, workflowId, userId, version }: PublishWorkflowVersionInput,
): Promise<PublishWorkflowVersionResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const workflowRows = (await tx
        .select({ draft: workflow.draft })
        .from(workflow)
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .limit(1)
        .for("update")) as { draft: WorkflowDraft }[];
      const draft = workflowRows[0]?.draft;
      if (!draft) return { kind: "workflowNotFound" as const };

      const validation = validateWorkflowDraft(draft);
      if (!validation.publishable)
        return { kind: "invalidDraft" as const, errors: validation.errors };

      // The workflow row lock above is what serializes concurrent publishes; this
      // `for` only satisfies TransactionExecutor, and the unique index backs it up.
      const existing = await tx
        .select({ id: workflowVersion.id })
        .from(workflowVersion)
        .where(
          and(eq(workflowVersion.workflowId, workflowId), eq(workflowVersion.version, version)),
        )
        .limit(1)
        .for("update");
      if (existing.length > 0) return { kind: "versionExists" as const };

      const insertedRows = (await tx
        .insert(workflowVersion)
        .values({
          id: crypto.randomUUID(),
          workflowId,
          version,
          // The layout only positions nodes on the dashboard canvas; the SDK gets the DAG.
          definition: { nodes: draft.nodes, connections: draft.connections ?? [] },
          publishedById: userId,
        })
        .returning()) as WorkflowVersionRow[];
      const created = insertedRows[0];
      if (!created) throw new Error("Workflow version creation returned no record");

      return { kind: "published" as const, version: toWorkflowVersion(created) };
    },
  );
  if (!result.ok) return result;
  if (result.value.kind === "published") return { ok: true, version: result.value.version };
  if (result.value.kind === "invalidDraft")
    return { ok: false, reason: "invalidDraft", errors: result.value.errors };
  return { ok: false, reason: result.value.kind };
}

export type SdkWorkflowVersionDefinition = {
  nodes: unknown[];
  connections: unknown[];
};

export type GetSdkWorkflowVersionDefinitionResult =
  | { ok: true; definition: SdkWorkflowVersionDefinition }
  | { ok: false; reason: "notFound" };

type SdkWorkflowVersionQueryDatabase = {
  select(fields: Record<string, unknown>): {
    from(table: unknown): {
      where(condition: unknown): {
        limit(count: number): Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/**
 * Gets the immutable definition of a published workflow version only when the
 * version belongs to the credential application and its workflow is available.
 * Foreign, missing, archived-workflow, and archived-application resources are
 * deliberately indistinguishable.
 */
export async function getSdkWorkflowVersionDefinition(
  database: SdkWorkflowVersionQueryDatabase,
  applicationId: string,
  workflowVersionId: string,
): Promise<GetSdkWorkflowVersionDefinitionResult> {
  const versionRows = (await database
    .select({ workflowId: workflowVersion.workflowId, definition: workflowVersion.definition })
    .from(workflowVersion)
    .where(eq(workflowVersion.id, workflowVersionId))
    .limit(1)) as { workflowId: string; definition: SdkWorkflowVersionDefinition }[];
  const found = versionRows[0];
  if (!found) return { ok: false, reason: "notFound" };

  const workflowRows = await database
    .select({ id: workflow.id })
    .from(workflow)
    .where(
      and(
        eq(workflow.id, found.workflowId),
        eq(workflow.applicationId, applicationId),
        ne(workflow.status, "archived"),
      ),
    )
    .limit(1);
  if (!workflowRows[0]) return { ok: false, reason: "notFound" };

  const applicationRows = (await database
    .select({ id: application.id })
    .from(application)
    .where(and(eq(application.id, applicationId), eq(application.status, "active")))
    .limit(1)) as { id: string }[];
  if (!applicationRows[0]) return { ok: false, reason: "notFound" };

  return { ok: true, definition: found.definition };
}
