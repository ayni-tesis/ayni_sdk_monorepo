import {
  areWorkflowPortsCompatible,
  isConditionSourceCompatible,
  isOutputSourceCompatible,
  type WorkflowConnection,
  type WorkflowDraft,
  type WorkflowNode,
} from "./workflow-store";

export type WorkflowValidationError = {
  code:
    | "missingInput"
    | "missingOutput"
    | "requiredInput"
    | "missingSource"
    | "missingTarget"
    | "incompatibleType"
    | "cycle"
    | "unreachableOutput";
  nodeId: string | null;
  nodeName: string | null;
  port: string | null;
  message: string;
};

export type WorkflowValidationResult = {
  publishable: boolean;
  errors: WorkflowValidationError[];
};

function workflowNodeName(node: WorkflowNode) {
  if (node.type === "input.image") return "Imagen de entrada";
  if (node.type === "model.tflite") return node.modelName;
  if (node.type === "condition") return `Condición: ${node.label}`;
  return node.name;
}

/**
 * Every edge of the draft: explicit port connections plus the source
 * references that condition and output nodes store on themselves.
 */
function workflowEdges(draft: WorkflowDraft): WorkflowConnection[] {
  return [
    ...(draft.connections ?? []),
    ...draft.nodes.flatMap((node) =>
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

function reachableFrom(startIds: string[], edges: WorkflowConnection[]) {
  const reached = new Set<string>();
  const pending = [...startIds];
  while (pending.length) {
    const nodeId = pending.pop();
    if (nodeId === undefined) continue;
    for (const edge of edges) {
      if (edge.sourceNodeId === nodeId && !reached.has(edge.targetNodeId)) {
        reached.add(edge.targetNodeId);
        pending.push(edge.targetNodeId);
      }
    }
  }
  return reached;
}

/**
 * Checks whether a workflow draft can be published: it needs an image input
 * and an output, every model image input connected, compatible types on every
 * edge, no cycles, and every output reachable from the image input. Each error
 * names the node and port that cause it. The draft is never modified.
 */
export function validateWorkflowDraft(draft: WorkflowDraft): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];
  const nodesById = new Map(draft.nodes.map((node) => [node.id, node]));
  const connections = draft.connections ?? [];
  const addNodeError = (
    code: WorkflowValidationError["code"],
    node: WorkflowNode,
    port: string | null,
    message: string,
  ) => {
    // Two broken connections into one port would repeat the same error; list it once.
    const duplicate = errors.some(
      (error) =>
        error.code === code &&
        error.nodeId === node.id &&
        error.port === port &&
        error.message === message,
    );
    if (!duplicate)
      errors.push({ code, nodeId: node.id, nodeName: workflowNodeName(node), port, message });
  };

  const inputNodes = draft.nodes.filter((node) => node.type === "input.image");
  if (inputNodes.length === 0)
    errors.push({
      code: "missingInput",
      nodeId: null,
      nodeName: null,
      port: null,
      message: "El workflow necesita un nodo de entrada de imagen.",
    });
  if (!draft.nodes.some((node) => node.type === "output"))
    errors.push({
      code: "missingOutput",
      nodeId: null,
      nodeName: null,
      port: null,
      message: "El workflow necesita al menos un nodo de salida.",
    });

  for (const connection of connections) {
    const target = nodesById.get(connection.targetNodeId);
    if (!target) {
      const source = nodesById.get(connection.sourceNodeId);
      if (source)
        addNodeError(
          "missingTarget",
          source,
          connection.sourcePort,
          `El nodo "${workflowNodeName(source)}" tiene una conexión hacia un nodo que ya no existe.`,
        );
      else
        errors.push({
          code: "missingTarget",
          nodeId: null,
          nodeName: null,
          port: null,
          message: "El workflow tiene una conexión entre nodos que ya no existen.",
        });
      continue;
    }
    const name = workflowNodeName(target);
    if (!nodesById.has(connection.sourceNodeId))
      addNodeError(
        "missingSource",
        target,
        connection.targetPort,
        `El nodo "${name}" recibe una conexión desde un nodo que ya no existe.`,
      );
    else if (!areWorkflowPortsCompatible(draft, connection))
      addNodeError(
        "incompatibleType",
        target,
        connection.targetPort,
        `El nodo "${name}" recibe un tipo incompatible en este puerto.`,
      );
  }

  for (const node of draft.nodes) {
    const name = workflowNodeName(node);
    if (node.type === "model.tflite") {
      const connected = connections.some(
        (connection) => connection.targetNodeId === node.id && connection.targetPort === "image",
      );
      if (!connected)
        addNodeError(
          "requiredInput",
          node,
          "image",
          `El nodo "${name}" necesita una imagen de entrada.`,
        );
      continue;
    }
    if (node.type !== "condition" && node.type !== "output") continue;
    const source = nodesById.get(node.sourceNodeId);
    if (!source) {
      addNodeError(
        "missingSource",
        node,
        "source",
        `El nodo "${name}" necesita un resultado de origen.`,
      );
      continue;
    }
    const compatible =
      node.type === "condition"
        ? isConditionSourceCompatible(source, node.label)
        : isOutputSourceCompatible(source, node.sourcePort, node.resultType);
    if (!compatible)
      addNodeError(
        "incompatibleType",
        node,
        "source",
        `El nodo "${name}" recibe un tipo incompatible en este puerto.`,
      );
  }

  const edges = workflowEdges(draft).filter(
    (edge) => nodesById.has(edge.sourceNodeId) && nodesById.has(edge.targetNodeId),
  );
  // ponytail: one traversal per node; switch to Tarjan's SCC if drafts grow materially.
  for (const node of draft.nodes) {
    if (reachableFrom([node.id], edges).has(node.id))
      addNodeError(
        "cycle",
        node,
        null,
        `El nodo "${workflowNodeName(node)}" forma parte de un ciclo.`,
      );
  }

  if (inputNodes.length > 0) {
    const reached = reachableFrom(
      inputNodes.map((node) => node.id),
      edges,
    );
    for (const node of draft.nodes) {
      if (
        node.type === "output" &&
        !reached.has(node.id) &&
        !errors.some((error) => error.nodeId === node.id)
      )
        addNodeError(
          "unreachableOutput",
          node,
          "source",
          `La salida "${node.name}" no es alcanzable desde la entrada de imagen.`,
        );
    }
  }

  return { publishable: errors.length === 0, errors };
}
