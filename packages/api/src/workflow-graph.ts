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
