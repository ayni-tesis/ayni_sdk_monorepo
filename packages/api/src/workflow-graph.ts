/**
 * The edges of a workflow draft, shared by the server and the dashboard so that
 * compatibility, cycle, and validation rules all look at the same graph.
 */

/** An edge from one node's output port to another node's input port. */
export type WorkflowEdge = {
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};

type WorkflowGraphNode =
  | { id: string; type: "input.image" | "model.tflite" }
  | { id: string; type: "condition"; sourceNodeId: string }
  | { id: string; type: "output"; sourceNodeId: string; sourcePort: string };

/** The parts of a draft its edges come from; server and dashboard drafts both fit it. */
export type WorkflowGraphDraft = {
  nodes: readonly WorkflowGraphNode[];
  connections?: readonly WorkflowEdge[];
};

/**
 * Every edge of the draft: the connections between ports plus the source that
 * each condition (its `result` port) and each output stores on itself, both
 * arriving at the node's `source` input.
 */
export function workflowEdges(draft: WorkflowGraphDraft): WorkflowEdge[] {
  return [
    ...(draft.connections ?? []),
    ...draft.nodes.flatMap((node): WorkflowEdge[] =>
      node.type === "condition"
        ? [
            {
              sourceNodeId: node.sourceNodeId,
              sourcePort: "result",
              targetNodeId: node.id,
              targetPort: "source",
            },
          ]
        : node.type === "output"
          ? [
              {
                sourceNodeId: node.sourceNodeId,
                sourcePort: node.sourcePort,
                targetNodeId: node.id,
                targetPort: "source",
              },
            ]
          : [],
    ),
  ];
}

/** What the port rules read from a node; server and dashboard nodes both fit it. */
export type WorkflowPortNode =
  | { id: string; type: "input.image" }
  | {
      id: string;
      type: "model.tflite";
      outputs: {
        result: { type: "classification" | "detection"; labels: readonly string[] };
      };
    }
  | { id: string; type: "condition"; sourceNodeId: string; label: string }
  | {
      id: string;
      type: "output";
      sourceNodeId: string;
      sourcePort: string;
      resultType: "classification" | "detection" | "boolean";
    };

/** The parts of a draft the port rules read; server and dashboard drafts both fit it. */
export type WorkflowPortDraft = {
  nodes: readonly WorkflowPortNode[];
  connections?: readonly WorkflowEdge[];
};

/** A condition or an output: the nodes whose `source` input holds their source. */
export type WorkflowSourcedNode = Extract<WorkflowPortNode, { type: "condition" | "output" }>;

/** `connected` means that exact edge already exists. */
export type WorkflowPortCompatibility = "compatible" | "incompatible" | "connected";

/** The type of what an output port produces, or `undefined` if the node has no such output. */
export function workflowOutputPortType(node: WorkflowPortNode | undefined, sourcePort: string) {
  if (node?.type === "input.image" && sourcePort === "imagen") return "image";
  if (node?.type === "model.tflite" && sourcePort === "result") return node.outputs.result.type;
  if (node?.type === "condition" && (sourcePort === "true" || sourcePort === "false"))
    return "boolean";
  return undefined;
}

/** Whether `connection` joins ports of the same type; only a model's image input takes one. */
export function areWorkflowPortsCompatible(draft: WorkflowPortDraft, connection: WorkflowEdge) {
  const source = draft.nodes.find((node) => node.id === connection.sourceNodeId);
  const target = draft.nodes.find((node) => node.id === connection.targetNodeId);
  const outputType = workflowOutputPortType(source, connection.sourcePort);
  const inputType =
    target?.type === "model.tflite" && connection.targetPort === "image" ? "image" : undefined;
  return Boolean(outputType && outputType === inputType);
}

/** A condition needs the result of a classification model that produces its label. */
export function isConditionSourceCompatible(source: WorkflowPortNode | undefined, label: string) {
  return (
    source?.type === "model.tflite" &&
    source.outputs.result.type === "classification" &&
    source.outputs.result.labels.includes(label)
  );
}

/** An output needs a model result of its result type, or a condition branch if it is boolean. */
export function isOutputSourceCompatible(
  source: WorkflowPortNode | undefined,
  sourcePort: string,
  resultType: "classification" | "detection" | "boolean",
) {
  return resultType === "boolean"
    ? source?.type === "condition" && (sourcePort === "true" || sourcePort === "false")
    : source?.type === "model.tflite" &&
        sourcePort === "result" &&
        source.outputs.result.type === resultType;
}

/**
 * The condition or output whose `source` input `connection` reaches. That input
 * always holds one source, so a connection to it replaces the source (US-131).
 */
export function workflowSourceTarget(
  draft: WorkflowPortDraft,
  connection: WorkflowEdge,
): WorkflowSourcedNode | undefined {
  if (connection.targetPort !== "source") return undefined;
  const target = draft.nodes.find((node) => node.id === connection.targetNodeId);
  return target?.type === "condition" || target?.type === "output" ? target : undefined;
}

/**
 * `node` with the source given by `edge`, keeping its id and settings: a
 * condition stores only the node (its source is always a `result`), an output
 * also the port.
 */
export function withWorkflowSource<Node extends WorkflowSourcedNode>(
  node: Node,
  edge: Pick<WorkflowEdge, "sourceNodeId" | "sourcePort">,
): Node {
  return node.type === "condition"
    ? { ...node, sourceNodeId: edge.sourceNodeId }
    : { ...node, sourceNodeId: edge.sourceNodeId, sourcePort: edge.sourcePort };
}

/**
 * Whether `connection` may be added to the draft: matching types and one
 * connection per model image input, or, on the `source` input of a condition or
 * an output, a source that node accepts, which replaces its current one. Cycles
 * are checked separately with `findWorkflowCycle`.
 */
export function workflowPortCompatibility(
  draft: WorkflowPortDraft,
  connection: WorkflowEdge,
): WorkflowPortCompatibility {
  if (
    workflowEdges(draft).some(
      (edge) =>
        edge.sourceNodeId === connection.sourceNodeId &&
        edge.sourcePort === connection.sourcePort &&
        edge.targetNodeId === connection.targetNodeId &&
        edge.targetPort === connection.targetPort,
    )
  )
    return "connected";
  if (connection.sourceNodeId === connection.targetNodeId) return "incompatible";
  const sourceTarget = workflowSourceTarget(draft, connection);
  if (sourceTarget) {
    const source = draft.nodes.find((node) => node.id === connection.sourceNodeId);
    const accepted =
      sourceTarget.type === "condition"
        ? connection.sourcePort === "result" &&
          isConditionSourceCompatible(source, sourceTarget.label)
        : isOutputSourceCompatible(source, connection.sourcePort, sourceTarget.resultType);
    return accepted ? "compatible" : "incompatible";
  }
  if (!areWorkflowPortsCompatible(draft, connection)) return "incompatible";
  const inputTaken = (draft.connections ?? []).some(
    (edge) =>
      edge.targetNodeId === connection.targetNodeId && edge.targetPort === connection.targetPort,
  );
  return inputTaken ? "incompatible" : "compatible";
}

/**
 * The nodes of the cycle that adding `edge` would close, starting with its
 * source, or `undefined` when the draft stays acyclic.
 */
export function findWorkflowCycle(
  draft: WorkflowGraphDraft,
  edge: WorkflowEdge,
): string[] | undefined {
  const pending = [edge.targetNodeId];
  const previous = new Map<string, string>();
  const visited = new Set(pending);
  const edges = workflowEdges(draft);
  // ponytail: scan all edges per visited node; build adjacency lists if workflows grow materially.
  while (pending.length) {
    const nodeId = pending.pop();
    if (nodeId === undefined) continue;
    if (nodeId === edge.sourceNodeId) {
      const path = [nodeId];
      let currentNodeId = nodeId;
      while (currentNodeId !== edge.targetNodeId) {
        const parentNodeId = previous.get(currentNodeId);
        if (!parentNodeId) return undefined;
        path.unshift(parentNodeId);
        currentNodeId = parentNodeId;
      }
      return [...new Set([edge.sourceNodeId, ...path])];
    }
    for (const item of edges) {
      if (item.sourceNodeId === nodeId && !visited.has(item.targetNodeId)) {
        visited.add(item.targetNodeId);
        previous.set(item.targetNodeId, nodeId);
        pending.push(item.targetNodeId);
      }
    }
  }
}
