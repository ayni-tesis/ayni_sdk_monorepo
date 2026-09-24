import {
  type ModelVersionContract,
  model,
  modelVersion,
  workflow,
  workflowVersion,
} from "@ayni/db/schema/index";
import { and, asc, desc, eq, not, sql } from "drizzle-orm";
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

/** A published, immutable workflow version (metadata only, never its DAG). */
export type WorkflowVersion = {
  id: string;
  workflowId: string;
  version: string;
  createdAt: string;
};

export type WorkflowVersionRow = {
  id: string;
  workflowId: string;
  version: string;
  createdAt: Date | string;
};

export function toWorkflowVersion(row: WorkflowVersionRow): WorkflowVersion {
  return {
    id: row.id,
    workflowId: row.workflowId,
    version: row.version,
    createdAt: toIsoString(row.createdAt),
  };
}

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
    }
  | {
      id: string;
      type: "output";
      name: string;
      sourceNodeId: string;
      sourcePort: string;
      resultType: "classification" | "detection" | "boolean";
    };
export type WorkflowConnection = {
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};
export type WorkflowNodePosition = { x: number; y: number };
export type WorkflowDraft = {
  nodes: WorkflowNode[];
  connections?: WorkflowConnection[];
  layout?: Record<string, WorkflowNodePosition>;
};

function appendWorkflowNode(
  draft: WorkflowDraft,
  node: WorkflowNode,
  position?: WorkflowNodePosition,
): WorkflowDraft {
  return {
    ...draft,
    nodes: [...draft.nodes, node],
    ...(position ? { layout: { ...draft.layout, [node.id]: position } } : {}),
  };
}

function appendWorkflowNodeSql(node: WorkflowNode, position?: WorkflowNodePosition) {
  const withNode = sql`jsonb_set(coalesce(${workflow.draft}, '{"nodes":[]}'::jsonb), '{nodes}', coalesce(${workflow.draft}->'nodes', '[]'::jsonb) || ${JSON.stringify(node)}::jsonb)`;
  return position
    ? sql`jsonb_set(${withNode}, '{layout}', coalesce(${workflow.draft}->'layout', '{}'::jsonb) || ${JSON.stringify({ [node.id]: position })}::jsonb)`
    : withNode;
}

export function areWorkflowPortsCompatible(draft: WorkflowDraft, connection: WorkflowConnection) {
  const source = draft.nodes.find((node) => node.id === connection.sourceNodeId);
  const target = draft.nodes.find((node) => node.id === connection.targetNodeId);
  const outputType =
    source?.type === "input.image" && connection.sourcePort === "imagen"
      ? "image"
      : source?.type === "model.tflite" && connection.sourcePort === "result"
        ? source.outputs.result.type
        : source?.type === "condition" &&
            (connection.sourcePort === "true" || connection.sourcePort === "false")
          ? "boolean"
          : undefined;
  const inputType =
    target?.type === "model.tflite" && connection.targetPort === "image" ? "image" : undefined;
  return Boolean(outputType && inputType && outputType === inputType);
}

export function isConditionSourceCompatible(source: WorkflowNode | undefined, label: string) {
  return (
    source?.type === "model.tflite" &&
    source.outputs.result.type === "classification" &&
    source.outputs.result.labels.includes(label)
  );
}

export function isOutputSourceCompatible(
  source: WorkflowNode | undefined,
  sourcePort: string,
  resultType: "classification" | "detection" | "boolean",
) {
  return resultType === "boolean"
    ? source?.type === "condition" && (sourcePort === "true" || sourcePort === "false")
    : source?.type === "model.tflite" &&
        sourcePort === "result" &&
        source.outputs.result.type === resultType;
}

export function findWorkflowCycle(
  draft: WorkflowDraft,
  connection: WorkflowConnection,
): string[] | undefined {
  const pending = [connection.targetNodeId];
  const previous = new Map<string, string>();
  const visited = new Set(pending);
  const edges = draft.connections ?? [];
  // ponytail: scan all edges per visited node; build adjacency lists if workflows grow materially.
  while (pending.length) {
    const nodeId = pending.pop();
    if (nodeId === undefined) continue;
    if (nodeId === connection.sourceNodeId) {
      const path = [nodeId];
      let currentNodeId = nodeId;
      while (currentNodeId !== connection.targetNodeId) {
        const parentNodeId = previous.get(currentNodeId);
        if (!parentNodeId) return undefined;
        path.unshift(parentNodeId);
        currentNodeId = parentNodeId;
      }
      return [...new Set([connection.sourceNodeId, ...path])];
    }
    for (const edge of edges) {
      if (edge.sourceNodeId === nodeId && !visited.has(edge.targetNodeId)) {
        visited.add(edge.targetNodeId);
        previous.set(edge.targetNodeId, nodeId);
        pending.push(edge.targetNodeId);
      }
    }
  }
}

export type ChangeWorkflowConnectionInput = WorkflowConnection & {
  applicationId: string;
  workflowId: string;
  userId: string;
};
export type ChangeWorkflowConnectionResult =
  | { ok: true; draft: WorkflowDraft }
  | { ok: false; reason: "cycle"; nodeIds: string[] }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "notFound"
        | "archived"
        | "workflowNotFound"
        | "incompatible"
        | "duplicate"
        | "connectionNotFound";
    };

export async function addWorkflowConnection(
  database: WorkflowDatabase,
  input: ChangeWorkflowConnectionInput,
): Promise<ChangeWorkflowConnectionResult> {
  return changeWorkflowConnection(database, input, true);
}

export async function removeWorkflowConnection(
  database: WorkflowDatabase,
  input: ChangeWorkflowConnectionInput,
): Promise<ChangeWorkflowConnectionResult> {
  return changeWorkflowConnection(database, input, false);
}

export type UpdateWorkflowNodePositionInput = WorkflowNodePosition & {
  applicationId: string;
  workflowId: string;
  nodeId: string;
  userId: string;
};
export type UpdateWorkflowNodePositionResult =
  | { ok: true; position: WorkflowNodePosition }
  | {
      ok: false;
      reason: "forbidden" | "notFound" | "archived" | "workflowNotFound" | "nodeNotFound";
    };

export type DeleteWorkflowNodeInput = {
  applicationId: string;
  workflowId: string;
  nodeId: string;
  userId: string;
};
export type DeleteWorkflowNodeResult =
  | { ok: true; draft: WorkflowDraft }
  | {
      ok: false;
      reason: "forbidden" | "notFound" | "archived" | "workflowNotFound" | "nodeNotFound";
    };

export async function deleteWorkflowNode(
  database: WorkflowDatabase,
  { applicationId, workflowId, nodeId, userId }: DeleteWorkflowNodeInput,
): Promise<DeleteWorkflowNodeResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const reader = tx as unknown as {
        select: (fields: Record<string, unknown>) => {
          from: (table: unknown) => {
            where: (condition: unknown) => {
              limit: (count: number) => {
                for: (lock: "update") => Promise<{ draft: WorkflowDraft }[]>;
              };
            };
          };
        };
      };
      const rows = await reader
        .select({ draft: workflow.draft })
        .from(workflow)
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .limit(1)
        .for("update");
      const current = rows[0]?.draft;
      if (!rows[0]) return { kind: "workflowNotFound" as const };
      const draft = current ?? { nodes: [] };
      if (!draft.nodes.some((node) => node.id === nodeId)) return { kind: "nodeNotFound" as const };
      const removedNodeIds = new Set([nodeId]);
      let addedDependency = true;
      while (addedDependency) {
        addedDependency = false;
        for (const node of draft.nodes) {
          if (
            (node.type === "condition" || node.type === "output") &&
            removedNodeIds.has(node.sourceNodeId) &&
            !removedNodeIds.has(node.id)
          ) {
            removedNodeIds.add(node.id);
            addedDependency = true;
          }
        }
      }
      const updatedDraft: WorkflowDraft = {
        ...draft,
        nodes: draft.nodes.filter((node) => !removedNodeIds.has(node.id)),
        ...(draft.connections
          ? {
              connections: draft.connections.filter(
                (edge) =>
                  !removedNodeIds.has(edge.sourceNodeId) && !removedNodeIds.has(edge.targetNodeId),
              ),
            }
          : {}),
        ...(draft.layout
          ? {
              layout: Object.fromEntries(
                Object.entries(draft.layout).filter(([id]) => !removedNodeIds.has(id)),
              ),
            }
          : {}),
      };
      const updater = tx as WorkflowUpdateExecutor;
      const updated = (await updater
        .update(workflow)
        .set({ draft: sql`${JSON.stringify(updatedDraft)}::jsonb` })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return updated[0]
        ? { kind: "deleted" as const, draft: updated[0].draft ?? updatedDraft }
        : { kind: "workflowNotFound" as const };
    },
  );
  if (!result.ok) return result;
  return result.value.kind === "deleted"
    ? { ok: true, draft: result.value.draft }
    : { ok: false, reason: result.value.kind };
}

export async function updateWorkflowNodePosition(
  database: WorkflowDatabase,
  { applicationId, workflowId, nodeId, userId, x, y }: UpdateWorkflowNodePositionInput,
): Promise<UpdateWorkflowNodePositionResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const reader = tx as unknown as {
        select: (fields: Record<string, unknown>) => {
          from: (table: unknown) => {
            where: (condition: unknown) => {
              limit: (count: number) => {
                for: (lock: "update") => Promise<{ draft: WorkflowDraft }[]>;
              };
            };
          };
        };
      };
      const rows = await reader
        .select({ draft: workflow.draft })
        .from(workflow)
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .limit(1)
        .for("update");
      const draft = rows[0]?.draft;
      if (!draft) return { kind: "workflowNotFound" as const };
      if (!draft.nodes.some((node) => node.id === nodeId)) return { kind: "nodeNotFound" as const };

      const position = { x, y };
      const updatedDraft = { ...draft, layout: { ...draft.layout, [nodeId]: position } };
      const updater = tx as WorkflowUpdateExecutor;
      const updated = (await updater
        .update(workflow)
        .set({ draft: sql`${JSON.stringify(updatedDraft)}::jsonb` })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return updated[0]
        ? { kind: "updated" as const, position }
        : { kind: "workflowNotFound" as const };
    },
  );
  if (!result.ok) return result;
  return result.value.kind === "updated"
    ? { ok: true, position: result.value.position }
    : { ok: false, reason: result.value.kind };
}

async function changeWorkflowConnection(
  database: WorkflowDatabase,
  input: ChangeWorkflowConnectionInput,
  add: boolean,
): Promise<ChangeWorkflowConnectionResult> {
  const { applicationId, workflowId, userId, ...connection } = input;
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const reader = tx as unknown as {
        select: (fields: Record<string, unknown>) => {
          from: (table: unknown) => {
            where: (condition: unknown) => {
              limit: (n: number) => {
                for: (lock: "update") => Promise<{ draft: WorkflowDraft }[]>;
              };
            };
          };
        };
      };
      const rows = await reader
        .select({ draft: workflow.draft })
        .from(workflow)
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .limit(1)
        .for("update");
      const draft = rows[0]?.draft ?? { nodes: [] };
      if (!rows[0]) return { kind: "workflowNotFound" as const };
      const connections = draft.connections ?? [];
      const exists = connections.some(
        (item) =>
          item.sourceNodeId === connection.sourceNodeId &&
          item.sourcePort === connection.sourcePort &&
          item.targetNodeId === connection.targetNodeId &&
          item.targetPort === connection.targetPort,
      );
      if (add && exists) return { kind: "duplicate" as const };
      if (!add && !exists) return { kind: "connectionNotFound" as const };
      if (add && !areWorkflowPortsCompatible(draft, connection))
        return { kind: "incompatible" as const };
      const cycle = add ? findWorkflowCycle(draft, connection) : undefined;
      if (cycle) return { kind: "cycle" as const, nodeIds: cycle };
      const updatedDraft = {
        ...draft,
        connections: add
          ? [...connections, connection]
          : connections.filter(
              (item) =>
                !(
                  item.sourceNodeId === connection.sourceNodeId &&
                  item.sourcePort === connection.sourcePort &&
                  item.targetNodeId === connection.targetNodeId &&
                  item.targetPort === connection.targetPort
                ),
            ),
      };
      const updater = tx as WorkflowUpdateExecutor;
      const updated = (await updater
        .update(workflow)
        .set({ draft: sql`${JSON.stringify(updatedDraft)}::jsonb` })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return updated[0]
        ? { kind: "changed" as const, draft: updated[0].draft ?? updatedDraft }
        : { kind: "workflowNotFound" as const };
    },
  );
  if (!result.ok) return result;
  if (result.value.kind === "cycle")
    return { ok: false, reason: "cycle", nodeIds: result.value.nodeIds };
  return result.value.kind === "changed"
    ? { ok: true, draft: result.value.draft }
    : { ok: false, reason: result.value.kind };
}

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

export type AddImageInputInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
  position?: WorkflowNodePosition;
};

export async function addImageInputNode(
  database: WorkflowDatabase,
  { applicationId, workflowId, userId, position }: AddImageInputInput,
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
          draft: appendWorkflowNodeSql(node, position),
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
  if (result.value)
    return {
      ok: true,
      draft: result.value.draft ?? appendWorkflowNode({ nodes: [] }, node, position),
    };

  const existing = await getWorkflow(database, applicationId, workflowId);
  return existing ? { ok: false, reason: "duplicate" } : { ok: false, reason: "workflowNotFound" };
}

export type AddModelNodeInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
  modelVersionId: string;
  position?: WorkflowNodePosition;
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
  { applicationId, workflowId, userId, modelVersionId, position }: AddModelNodeInput,
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
          draft: appendWorkflowNodeSql(node, position),
        })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return rows[0]
        ? {
            kind: "added" as const,
            draft: rows[0].draft ?? appendWorkflowNode({ nodes: [] }, node, position),
          }
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
  position?: WorkflowNodePosition;
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
    position,
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
      if (!draft || !isConditionSourceCompatible(source, label))
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
          draft: appendWorkflowNodeSql(node, position),
        })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return updated[0]
        ? {
            kind: "added" as const,
            draft: updated[0].draft ?? appendWorkflowNode(draft, node, position),
          }
        : { kind: "workflowNotFound" as const };
    },
  );
  if (!result.ok) return result;
  return result.value.kind === "added"
    ? { ok: true, draft: result.value.draft }
    : { ok: false, reason: result.value.kind };
}

export type AddOutputNodeInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
  name: string;
  sourceNodeId: string;
  sourcePort: string;
  resultType: "classification" | "detection" | "boolean";
  position?: WorkflowNodePosition;
};
export type AddOutputNodeResult =
  | { ok: true; draft: WorkflowDraft }
  | {
      ok: false;
      reason: "forbidden" | "notFound" | "archived" | "workflowNotFound" | "incompatibleSource";
    };

export async function addOutputNode(
  database: WorkflowDatabase,
  {
    applicationId,
    workflowId,
    userId,
    name,
    sourceNodeId,
    sourcePort,
    resultType,
    position,
  }: AddOutputNodeInput,
): Promise<AddOutputNodeResult> {
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
      if (!draft || !isOutputSourceCompatible(source, sourcePort, resultType))
        return { kind: "incompatibleSource" as const };
      const node: WorkflowNode = {
        id: crypto.randomUUID(),
        type: "output",
        name,
        sourceNodeId,
        sourcePort,
        resultType,
      };
      const updater = tx as WorkflowUpdateExecutor;
      const updated = (await updater
        .update(workflow)
        .set({
          draft: appendWorkflowNodeSql(node, position),
        })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return updated[0]
        ? {
            kind: "added" as const,
            draft: updated[0].draft ?? appendWorkflowNode(draft, node, position),
          }
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
 * Workflow detail: the workflow, its persisted draft nodes, and its published
 * versions, most recent first.
 */
export type WorkflowDetail = {
  workflow: Workflow;
  draft: WorkflowDraft;
  versions: WorkflowVersion[];
};

type GetWorkflowExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Record<string, unknown>[]>;
        orderBy: (column: unknown) => Promise<Record<string, unknown>[]>;
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

    const versionRows = (await tx
      .select({
        id: workflowVersion.id,
        workflowId: workflowVersion.workflowId,
        version: workflowVersion.version,
        createdAt: workflowVersion.createdAt,
      })
      .from(workflowVersion)
      .where(eq(workflowVersion.workflowId, row.id))
      .orderBy(desc(workflowVersion.createdAt))) as WorkflowVersionRow[];

    return {
      workflow: toWorkflow(row),
      draft: row.draft ?? { nodes: [] },
      versions: versionRows.map(toWorkflowVersion),
    };
  });
}

/** A listed workflow with the identifier of its most recently published version. */
export type WorkflowListItem = Workflow & { latestVersion: string | null };

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
): Promise<WorkflowListItem[]> {
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
        latestVersion: sql<
          string | null
        >`(select ${workflowVersion.version} from ${workflowVersion} where ${workflowVersion.workflowId} = ${workflow.id} order by ${workflowVersion.createdAt} desc limit 1)`,
      })
      .from(workflow)
      .where(eq(workflow.applicationId, applicationId))
      .orderBy(asc(workflow.createdAt))) as (WorkflowRow & { latestVersion?: string | null })[];

    return rows.map((row) => ({ ...toWorkflow(row), latestVersion: row.latestVersion ?? null }));
  });
}
