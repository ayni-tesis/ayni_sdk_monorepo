import { DEFAULT_COLLECTION_POLICY } from "@ayni/api/collection-policy";
import {
  areWorkflowPortsCompatible,
  findWorkflowCycle,
  isConditionSourceCompatible,
  isOutputSourceCompatible,
  withWorkflowSource,
  workflowNodesToDelete,
  workflowPortCompatibility,
  workflowSourceTarget,
} from "@ayni/api/workflow-graph";
import {
  applicationCollectionPolicy,
  type ModelVersionContract,
  model,
  modelVersion,
  workflow,
  workflowVersion,
} from "@ayni/db/schema/index";
import { and, asc, desc, eq, sql } from "drizzle-orm";
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
  status: "draft" | "archived";
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
  draftRevision?: number;
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

/** The nodes a published version holds, the ones the SDK runs. */
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
      sources?: {
        sourceNodeId: string;
        sourcePort: string;
        resultType: "classification" | "detection" | "boolean";
      }[];
    };
/**
 * A dataset capture (US-064): it takes the image on `imagen` and a model's
 * inference result on `resultado`, and holds nothing else, so never any code.
 * Only drafts hold it for now: no SDK runs it yet, so validation keeps a
 * draft with a capture from being published.
 */
export type DatasetCaptureNode = {
  id: string;
  type: "dataset.capture";
  inputs: { imagen: "image"; resultado: "inferenceResult" };
};
/** A node of a draft: those a version publishes, and those only a draft holds yet. */
export type WorkflowDraftNode = WorkflowNode | DatasetCaptureNode;
export type WorkflowConnection = {
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};
export type WorkflowNodePosition = { x: number; y: number };
export type WorkflowDraft = {
  nodes: WorkflowDraftNode[];
  connections?: WorkflowConnection[];
  layout?: Record<string, WorkflowNodePosition>;
};

function appendWorkflowNode(
  draft: WorkflowDraft,
  node: WorkflowDraftNode,
  position?: WorkflowNodePosition,
): WorkflowDraft {
  return {
    ...draft,
    nodes: [...draft.nodes, node],
    ...(position ? { layout: { ...draft.layout, [node.id]: position } } : {}),
  };
}

/** Who changes which draft, and the draft revision the editor based the change on (US-130). */
export type WorkflowDraftChangeInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
  draftRevision: number;
};

/** Why any draft change can be refused before the change itself is looked at. */
type WorkflowDraftChangeFailure =
  | "forbidden"
  | "notFound"
  | "archived"
  | "workflowNotFound"
  | "draftConflict";

type WorkflowDraftChangeResult<Refusal extends { reason: string }> =
  | { ok: true; draft: WorkflowDraft; draftRevision: number }
  | ({ ok: false } & Refusal)
  | { ok: false; reason: WorkflowDraftChangeFailure };

/**
 * Applies a change to the draft while its workflow row is locked. A change based
 * on a revision other than the current one is refused with `draftConflict`
 * before anything is checked or written; an accepted change saves the draft as
 * the next revision, which the editor bases its following change on.
 */
async function changeWorkflowDraft<Refusal extends { reason: string }>(
  database: WorkflowDatabase,
  { applicationId, workflowId, userId, draftRevision }: WorkflowDraftChangeInput,
  change: (
    draft: WorkflowDraft,
    tx: TransactionExecutor,
    applicationId: string,
  ) => Promise<{ draft: WorkflowDraft } | Refusal>,
): Promise<WorkflowDraftChangeResult<Refusal>> {
  type Outcome =
    | { changed: { draft: WorkflowDraft; draftRevision: number } }
    | { refused: Refusal | { reason: "workflowNotFound" | "draftConflict" } };
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application): Promise<Outcome> => {
      const where = and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id));
      const rows = (await tx
        .select({ draft: workflow.draft, draftRevision: workflow.draftRevision })
        .from(workflow)
        .where(where)
        .limit(1)
        .for("update")) as { draft: WorkflowDraft | null; draftRevision: number }[];
      const current = rows[0];
      if (!current) return { refused: { reason: "workflowNotFound" } };
      if (current.draftRevision !== draftRevision) return { refused: { reason: "draftConflict" } };
      const outcome = await change(current.draft ?? { nodes: [] }, tx, application.id);
      if (!("draft" in outcome)) return { refused: outcome };
      const nextRevision = current.draftRevision + 1;
      const updated = (await (tx as WorkflowUpdateExecutor)
        .update(workflow)
        .set({
          draft: sql`${JSON.stringify(outcome.draft)}::jsonb`,
          draftRevision: nextRevision,
        })
        .where(where)
        .returning()) as WorkflowRow[];
      const saved = updated[0];
      if (!saved) return { refused: { reason: "workflowNotFound" } };
      return {
        changed: {
          draft: saved.draft ?? outcome.draft,
          draftRevision: saved.draftRevision ?? nextRevision,
        },
      };
    },
  );
  if (!result.ok) return result;
  if ("refused" in result.value) return { ok: false, ...result.value.refused };
  return { ok: true, ...result.value.changed };
}

export type ChangeWorkflowConnectionInput = WorkflowConnection & WorkflowDraftChangeInput;
type ChangeWorkflowConnectionRefusal =
  | { reason: "cycle"; nodeIds: string[] }
  | { reason: "incompatible" | "duplicate" | "connectionNotFound" }
  /** The condition or output whose source was reassigned does not accept the new one (US-131). */
  | { reason: "incompatibleSource"; nodeType: "condition" | "output" };
export type ChangeWorkflowConnectionResult =
  WorkflowDraftChangeResult<ChangeWorkflowConnectionRefusal>;

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

export type WorkflowNodePositions = Record<string, WorkflowNodePosition>;
export type UpdateWorkflowNodePositionsInput = WorkflowDraftChangeInput & {
  positions: WorkflowNodePositions;
};
export type UpdateWorkflowNodePositionsResult =
  | { ok: true; positions: WorkflowNodePositions; draftRevision: number }
  | { ok: false; reason: WorkflowDraftChangeFailure | "nodeNotFound" };

export type DeleteWorkflowNodeInput = WorkflowDraftChangeInput & { nodeId: string };
type NodeNotFound = { reason: "nodeNotFound" };
export type DeleteWorkflowNodeResult = WorkflowDraftChangeResult<NodeNotFound>;

export async function deleteWorkflowNode(
  database: WorkflowDatabase,
  { nodeId, ...input }: DeleteWorkflowNodeInput,
): Promise<DeleteWorkflowNodeResult> {
  return deleteWorkflowNodes(database, { ...input, nodeIds: [nodeId] });
}

export type DeleteWorkflowNodesInput = WorkflowDraftChangeInput & { nodeIds: string[] };
export type DeleteWorkflowNodesResult = DeleteWorkflowNodeResult;

/**
 * Deletes the nodes, the conditions and outputs that depend on them, their
 * connections, and their positions in one write, or nothing if any node is
 * missing (US-132).
 */
export async function deleteWorkflowNodes(
  database: WorkflowDatabase,
  { nodeIds, ...input }: DeleteWorkflowNodesInput,
): Promise<DeleteWorkflowNodesResult> {
  return changeWorkflowDraft<NodeNotFound>(database, input, async (draft) => {
    const draftNodeIds = new Set(draft.nodes.map((node) => node.id));
    if (!nodeIds.every((nodeId) => draftNodeIds.has(nodeId)))
      return { reason: "nodeNotFound" as const };
    const removedNodeIds = new Set(workflowNodesToDelete(draft, nodeIds));
    return {
      draft: {
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
      },
    };
  });
}

/** The editable configuration of a condition or an output; their source is not part of it. */
export type WorkflowNodeChanges =
  | {
      type: "condition";
      label: string;
      operator: "gte" | "gt" | "lte" | "lt";
      threshold: number;
    }
  | { type: "output"; name: string };
export type UpdateWorkflowNodeInput = WorkflowDraftChangeInput & {
  nodeId: string;
  changes: WorkflowNodeChanges;
};
type UpdateWorkflowNodeRefusal = {
  reason: "nodeNotFound" | "notEditable" | "incompatibleSource";
};
export type UpdateWorkflowNodeResult = WorkflowDraftChangeResult<UpdateWorkflowNodeRefusal>;

/**
 * Changes a condition's or an output's configuration in the draft, keeping its
 * id, source, position, and connections. A condition is checked against its
 * source with the same rule as when it is added.
 */
export async function updateWorkflowNode(
  database: WorkflowDatabase,
  { nodeId, changes, ...input }: UpdateWorkflowNodeInput,
): Promise<UpdateWorkflowNodeResult> {
  return changeWorkflowDraft<UpdateWorkflowNodeRefusal>(database, input, async (draft) => {
    const node = draft.nodes.find((item) => item.id === nodeId);
    if (!node) return { reason: "nodeNotFound" as const };
    let updatedNode: WorkflowNode;
    if (node.type === "condition" && changes.type === "condition") {
      const source = draft.nodes.find((item) => item.id === node.sourceNodeId);
      if (!isConditionSourceCompatible(source, changes.label))
        return { reason: "incompatibleSource" as const };
      updatedNode = {
        ...node,
        label: changes.label,
        operator: changes.operator,
        threshold: changes.threshold,
      };
    } else if (node.type === "output" && changes.type === "output") {
      updatedNode = { ...node, name: changes.name };
    } else return { reason: "notEditable" as const };
    return {
      draft: {
        ...draft,
        nodes: draft.nodes.map((item) => (item.id === nodeId ? updatedNode : item)),
      },
    };
  });
}

/** Saves every moved node's position in one write, or none if any node is missing. */
export async function updateWorkflowNodePositions(
  database: WorkflowDatabase,
  { positions, ...input }: UpdateWorkflowNodePositionsInput,
): Promise<UpdateWorkflowNodePositionsResult> {
  const result = await changeWorkflowDraft<NodeNotFound>(database, input, async (draft) => {
    const nodeIds = new Set(draft.nodes.map((node) => node.id));
    if (!Object.keys(positions).every((nodeId) => nodeIds.has(nodeId)))
      return { reason: "nodeNotFound" as const };
    return { draft: { ...draft, layout: { ...draft.layout, ...positions } } };
  });
  return result.ok ? { ok: true, positions, draftRevision: result.draftRevision } : result;
}

async function changeWorkflowConnection(
  database: WorkflowDatabase,
  input: ChangeWorkflowConnectionInput,
  add: boolean,
): Promise<ChangeWorkflowConnectionResult> {
  const { sourceNodeId, sourcePort, targetNodeId, targetPort, ...target } = input;
  const connection = { sourceNodeId, sourcePort, targetNodeId, targetPort };
  return changeWorkflowDraft<ChangeWorkflowConnectionRefusal>(database, target, async (draft) => {
    const connections = draft.connections ?? [];
    const exists = connections.some(
      (item) =>
        item.sourceNodeId === connection.sourceNodeId &&
        item.sourcePort === connection.sourcePort &&
        item.targetNodeId === connection.targetNodeId &&
        item.targetPort === connection.targetPort,
    );
    if (!add && !exists) return { reason: "connectionNotFound" as const };
    // The Origen input of a condition or an output holds its source on the node
    // itself; a connection to it replaces that source (US-131).
    const sourceTarget = add ? workflowSourceTarget(draft, connection) : undefined;
    if (add) {
      // Also rejects a second connection to an input that admits one, which
      // validation does not look at, since it runs on the saved connections.
      const compatibility = workflowPortCompatibility(draft, connection);
      if (compatibility === "connected") return { reason: "duplicate" as const };
      if (compatibility === "incompatible")
        return sourceTarget
          ? { reason: "incompatibleSource" as const, nodeType: sourceTarget.type }
          : { reason: "incompatible" as const };
    }
    // The cycle check follows every edge, condition and output sources included.
    // Adding the new source while the old one is still there finds the same
    // cycles: no path from the node back to a source goes through its own input.
    const cycle = add ? findWorkflowCycle(draft, connection) : undefined;
    if (cycle) return { reason: "cycle" as const, nodeIds: cycle };
    if (sourceTarget)
      return {
        draft: {
          ...draft,
          nodes: draft.nodes.map((node) =>
            node.id === sourceTarget.id && (node.type === "condition" || node.type === "output")
              ? withWorkflowSource(node, connection)
              : node,
          ),
        },
      };
    return {
      draft: {
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
      },
    };
  });
}

export function toWorkflow(row: WorkflowRow): Workflow {
  if (row.status !== "draft" && row.status !== "archived") {
    throw new Error(`Unsupported workflow status: ${String(row.status)}`);
  }
  return {
    id: row.id,
    applicationId: row.applicationId,
    name: row.name,
    status: row.status,
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

type DuplicateImageInput = { reason: "duplicate" };
export type AddImageInputResult = WorkflowDraftChangeResult<DuplicateImageInput>;

export type AddImageInputInput = WorkflowDraftChangeInput & {
  position?: WorkflowNodePosition;
};

export async function addImageInputNode(
  database: WorkflowDatabase,
  { position, ...input }: AddImageInputInput,
): Promise<AddImageInputResult> {
  return changeWorkflowDraft<DuplicateImageInput>(database, input, async (draft) => {
    if (draft.nodes.some((node) => node.type === "input.image"))
      return { reason: "duplicate" as const };
    const node: WorkflowNode = {
      id: crypto.randomUUID(),
      type: "input.image",
      outputs: { imagen: "image" },
    };
    return { draft: appendWorkflowNode(draft, node, position) };
  });
}

export type AddModelNodeInput = WorkflowDraftChangeInput & {
  modelVersionId: string;
  position?: WorkflowNodePosition;
  /** The output the model is added after; its image input is connected to it in the same write. */
  source?: { nodeId: string; port: string };
};

type AddModelNodeRefusal = {
  reason: "modelVersionNotFound" | "contractRequired" | "incompatibleSource";
};
export type AddModelNodeResult = WorkflowDraftChangeResult<AddModelNodeRefusal>;

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
  { modelVersionId, position, source, ...input }: AddModelNodeInput,
): Promise<AddModelNodeResult> {
  return changeWorkflowDraft<AddModelNodeRefusal>(
    database,
    input,
    async (draft, tx, applicationId) => {
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
        .where(and(eq(modelVersion.id, modelVersionId), eq(model.applicationId, applicationId)))
        .limit(1)) as {
        id: string;
        version: string;
        contract: ModelVersionContract | null;
        modelName: string;
      }[];
      const selected = versions[0];
      if (!selected) return { reason: "modelVersionNotFound" as const };
      if (!selected.contract) return { reason: "contractRequired" as const };

      const node: WorkflowNode = {
        id: crypto.randomUUID(),
        type: "model.tflite",
        modelVersionId: selected.id,
        modelName: selected.modelName,
        version: selected.version,
        inputs: { image: selected.contract.input },
        outputs: { result: selected.contract.output },
      };
      if (!source) return { draft: appendWorkflowNode(draft, node, position) };
      // The node and the connection from its source are saved together or not at all.
      const connection: WorkflowConnection = {
        sourceNodeId: source.nodeId,
        sourcePort: source.port,
        targetNodeId: node.id,
        targetPort: "image",
      };
      const updatedDraft = appendWorkflowNode(
        { ...draft, connections: [...(draft.connections ?? []), connection] },
        node,
        position,
      );
      // The new model's image input is still free and has no outgoing edges,
      // so only the port types can make it incompatible, never a cycle.
      if (!areWorkflowPortsCompatible(updatedDraft, connection))
        return { reason: "incompatibleSource" as const };
      return { draft: updatedDraft };
    },
  );
}

export type AddDatasetCaptureNodeInput = WorkflowDraftChangeInput & {
  position?: WorkflowNodePosition;
  /** The output the capture is added after (US-128); it is connected in the same write. */
  source?: { nodeId: string; port: string };
};
type AddDatasetCaptureNodeRefusal = { reason: "collectionDisabled" | "incompatibleSource" };
export type AddDatasetCaptureNodeResult = WorkflowDraftChangeResult<AddDatasetCaptureNodeRefusal>;

type CollectionPolicyLookupExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => { for: (strength: "update") => Promise<{ enabled: boolean }[]> };
      };
    };
  };
};

/**
 * Adds a dataset capture, only if the application enabled evidence collection
 * (US-064). Added after a model's result, it takes that result and the image
 * the model reads, if the model has one.
 */
export async function addDatasetCaptureNode(
  database: WorkflowDatabase,
  { position, source, ...input }: AddDatasetCaptureNodeInput,
): Promise<AddDatasetCaptureNodeResult> {
  return changeWorkflowDraft<AddDatasetCaptureNodeRefusal>(
    database,
    input,
    async (draft, tx, applicationId) => {
      // Read in this transaction, not with getCollectionPolicy, which opens its
      // own: the application row locked here is also locked while its policy is
      // saved, so the policy read holds until the draft is saved.
      const policies = await (tx as unknown as CollectionPolicyLookupExecutor)
        .select({ enabled: applicationCollectionPolicy.enabled })
        .from(applicationCollectionPolicy)
        .where(eq(applicationCollectionPolicy.applicationId, applicationId))
        .limit(1)
        .for("update");
      if (!(policies[0]?.enabled ?? DEFAULT_COLLECTION_POLICY.enabled))
        return { reason: "collectionDisabled" as const };

      const node: DatasetCaptureNode = {
        id: crypto.randomUUID(),
        type: "dataset.capture",
        inputs: { imagen: "image", resultado: "inferenceResult" },
      };
      if (!source) return { draft: appendWorkflowNode(draft, node, position) };
      const result: WorkflowConnection = {
        sourceNodeId: source.nodeId,
        sourcePort: source.port,
        targetNodeId: node.id,
        targetPort: "resultado",
      };
      if (!areWorkflowPortsCompatible(appendWorkflowNode(draft, node), result))
        return { reason: "incompatibleSource" as const };
      const modelImage = draft.connections?.find(
        (edge) => edge.targetNodeId === source.nodeId && edge.targetPort === "image",
      );
      const added: WorkflowConnection[] = [
        result,
        ...(modelImage
          ? [
              {
                sourceNodeId: modelImage.sourceNodeId,
                sourcePort: modelImage.sourcePort,
                targetNodeId: node.id,
                targetPort: "imagen",
              },
            ]
          : []),
      ];
      // The capture is new and has no outputs, so its connections close no cycle.
      return {
        draft: appendWorkflowNode(
          { ...draft, connections: [...(draft.connections ?? []), ...added] },
          node,
          position,
        ),
      };
    },
  );
}

export type AddConditionNodeInput = WorkflowDraftChangeInput & {
  sourceNodeId: string;
  label: string;
  operator: "gte" | "gt" | "lte" | "lt";
  threshold: number;
  position?: WorkflowNodePosition;
};
type IncompatibleSource = { reason: "incompatibleSource" };
export type AddConditionNodeResult = WorkflowDraftChangeResult<IncompatibleSource>;

export async function addConditionNode(
  database: WorkflowDatabase,
  { sourceNodeId, label, operator, threshold, position, ...input }: AddConditionNodeInput,
): Promise<AddConditionNodeResult> {
  return changeWorkflowDraft<IncompatibleSource>(database, input, async (draft) => {
    const source = draft.nodes.find((node) => node.id === sourceNodeId);
    if (!isConditionSourceCompatible(source, label))
      return { reason: "incompatibleSource" as const };
    const node: WorkflowNode = {
      id: crypto.randomUUID(),
      type: "condition",
      sourceNodeId,
      label,
      operator,
      threshold,
      branches: { true: "Verdadero", false: "Falso" },
    };
    return { draft: appendWorkflowNode(draft, node, position) };
  });
}

export type AddOutputNodeInput = WorkflowDraftChangeInput & {
  name: string;
  sourceNodeId: string;
  sourcePort: string;
  resultType: "classification" | "detection" | "boolean";
  sources?: {
    sourceNodeId: string;
    sourcePort: string;
    resultType: "classification" | "detection" | "boolean";
  }[];
  position?: WorkflowNodePosition;
};
export type AddOutputNodeResult = WorkflowDraftChangeResult<IncompatibleSource>;

export async function addOutputNode(
  database: WorkflowDatabase,
  { name, sourceNodeId, sourcePort, resultType, sources, position, ...input }: AddOutputNodeInput,
): Promise<AddOutputNodeResult> {
  return changeWorkflowDraft<IncompatibleSource>(database, input, async (draft) => {
    const allSources = [{ sourceNodeId, sourcePort, resultType }, ...(sources ?? [])];
    if (
      !allSources.every((item) =>
        isOutputSourceCompatible(
          draft.nodes.find((node) => node.id === item.sourceNodeId),
          item.sourcePort,
          item.resultType,
        ),
      ) ||
      new Set(allSources.map((item) => `${item.sourceNodeId}:${item.sourcePort}`)).size !==
        allSources.length
    )
      return { reason: "incompatibleSource" as const };
    const node: WorkflowNode = {
      id: crypto.randomUUID(),
      type: "output",
      name,
      sourceNodeId,
      sourcePort,
      resultType,
      ...(sources?.length ? { sources } : {}),
    };
    return { draft: appendWorkflowNode(draft, node, position) };
  });
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

export type ArchiveWorkflowInput = {
  applicationId: string;
  workflowId: string;
  userId: string;
};

export type ArchiveWorkflowResult = RenameWorkflowResult;

/**
 * Archives a workflow so that future synchronizations stop delivering it. Only
 * the status changes: the draft and every published version are kept, and
 * versions already stored offline on devices are never withdrawn. Only
 * workspace administrators and owners of an active application may archive.
 */
export async function archiveWorkflow(
  database: WorkflowDatabase,
  { applicationId, workflowId, userId }: ArchiveWorkflowInput,
): Promise<ArchiveWorkflowResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const updater = tx as WorkflowUpdateExecutor;
      const workflowRows = (await updater
        .update(workflow)
        .set({ status: "archived" })
        .where(and(eq(workflow.id, workflowId), eq(workflow.applicationId, application.id)))
        .returning()) as WorkflowRow[];
      return workflowRows[0];
    },
  );

  if (!result.ok) return result;
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
  /** The revision every draft change must be based on (US-130). */
  draftRevision: number;
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
        draftRevision: workflow.draftRevision,
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
      draftRevision: row.draftRevision ?? 0,
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
