import type {
  WorkflowCanvasConnection,
  WorkflowCanvasDraft,
  WorkflowCanvasNode,
} from "./workflow-canvas";

export type WorkflowCanvasPort = { id: string; label: string };
/** `connected` means that exact connection already exists. */
export type WorkflowPortCompatibility = "compatible" | "incompatible" | "connected";

export const WORKFLOW_PORT_LABELS: Record<string, string> = {
  image: "Entrada de imagen",
  imagen: "imagen",
  result: "Resultado",
  source: "Origen",
  true: "Verdadero",
  false: "Falso",
};
export const WORKFLOW_PORTS_INCOMPATIBLE_MESSAGE = "Estos puertos no son compatibles.";
export const WORKFLOW_PORTS_CONNECTED_MESSAGE = "Estos puertos ya están conectados.";

const port = (id: string): WorkflowCanvasPort => ({ id, label: WORKFLOW_PORT_LABELS[id] });

/** The inputs (left) and outputs (right) a node shows on the canvas. */
export function workflowNodePorts(node: WorkflowCanvasNode): {
  inputs: WorkflowCanvasPort[];
  outputs: WorkflowCanvasPort[];
} {
  switch (node.type) {
    case "input.image":
      return { inputs: [], outputs: [port("imagen")] };
    case "model.tflite":
      return { inputs: [port("image")], outputs: [port("result")] };
    case "condition":
      return { inputs: [port("source")], outputs: [port("true"), port("false")] };
    case "output":
      return { inputs: [port("source")], outputs: [] };
  }
}

function outputType(node: WorkflowCanvasNode | undefined, sourcePort: string) {
  if (node?.type === "input.image" && sourcePort === "imagen") return "image";
  if (node?.type === "model.tflite" && sourcePort === "result") return node.outputs.result.type;
  if (node?.type === "condition" && (sourcePort === "true" || sourcePort === "false"))
    return "boolean";
  return undefined;
}

// Only a model's image input takes explicit connections; the Origen input of a
// condition or an output is reassigned by US-131.
function inputType(node: WorkflowCanvasNode | undefined, targetPort: string) {
  return node?.type === "model.tflite" && targetPort === "image" ? "image" : undefined;
}

/**
 * Whether `connection` may be added to the draft, with the rules the server
 * applies: matching types, one connection per model image input, and no
 * repeated connection. Cycles are checked separately.
 */
export function workflowPortCompatibility(
  draft: WorkflowCanvasDraft,
  connection: WorkflowCanvasConnection,
): WorkflowPortCompatibility {
  const connections = draft.connections ?? [];
  if (
    connections.some(
      (edge) =>
        edge.sourceNodeId === connection.sourceNodeId &&
        edge.sourcePort === connection.sourcePort &&
        edge.targetNodeId === connection.targetNodeId &&
        edge.targetPort === connection.targetPort,
    )
  )
    return "connected";
  if (connection.sourceNodeId === connection.targetNodeId) return "incompatible";
  const source = draft.nodes.find((node) => node.id === connection.sourceNodeId);
  const target = draft.nodes.find((node) => node.id === connection.targetNodeId);
  const type = outputType(source, connection.sourcePort);
  if (!type || type !== inputType(target, connection.targetPort)) return "incompatible";
  const inputTaken = connections.some(
    (edge) =>
      edge.targetNodeId === connection.targetNodeId && edge.targetPort === connection.targetPort,
  );
  return inputTaken ? "incompatible" : "compatible";
}
