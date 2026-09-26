import type { WorkflowCanvasNode } from "./workflow-canvas";

// Which ports connect is decided by the rules the server applies too, in
// `@ayni/api/workflow-graph`; this module only says how ports look.
export type WorkflowCanvasPort = { id: string; label: string };

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

// The Origen of a condition or an output that does not accept a source keeps
// the message used when the node is added (US-131).
export const WORKFLOW_SOURCE_INCOMPATIBLE_MESSAGES = {
  condition: "Esta condición no es compatible con la salida seleccionada.",
  output: "El resultado seleccionado no es compatible con la salida.",
} as const;
