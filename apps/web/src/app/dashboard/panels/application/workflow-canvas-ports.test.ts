import { workflowPortCompatibility } from "@ayni/api/workflow-graph";
import { describe, expect, it } from "vitest";
import type { WorkflowCanvasDraft, WorkflowCanvasNode } from "./workflow-canvas";
import { workflowNodePorts } from "./workflow-canvas-ports";

const image = (id: string): WorkflowCanvasNode => ({
  id,
  type: "input.image",
  outputs: { imagen: "image" },
});
const model = (id: string, type: "classification" | "detection" = "classification") =>
  ({
    id,
    type: "model.tflite",
    modelVersionId: `${id}-version`,
    modelName: "Clasificador",
    version: "1.0.0",
    inputs: {
      image: { type: "image", width: 224, height: 224, channels: 3, normalization: "none" },
    },
    outputs: {
      result:
        type === "classification"
          ? { type, labels: ["perro"] }
          : { type, labels: ["perro"], scoreThreshold: 0.5 },
    },
  }) satisfies WorkflowCanvasNode;
const condition: WorkflowCanvasNode = {
  id: "condition",
  type: "condition",
  sourceNodeId: "model",
  label: "perro",
  operator: "gte",
  threshold: 0.5,
  branches: { true: "Verdadero", false: "Falso" },
};
const output: WorkflowCanvasNode = {
  id: "output",
  type: "output",
  name: "Aprobado",
  sourceNodeId: "condition",
  sourcePort: "true",
  resultType: "boolean",
};
const connect = (
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort: string,
) => ({
  sourceNodeId,
  sourcePort,
  targetNodeId,
  targetPort,
});

describe("workflow node ports", () => {
  it("lists every node's inputs and outputs with their labels", () => {
    expect(workflowNodePorts(image("image"))).toEqual({
      inputs: [],
      outputs: [{ id: "imagen", label: "imagen" }],
    });
    expect(workflowNodePorts(model("model"))).toEqual({
      inputs: [{ id: "image", label: "Entrada de imagen" }],
      outputs: [{ id: "result", label: "Resultado" }],
    });
    expect(workflowNodePorts(condition)).toEqual({
      inputs: [{ id: "source", label: "Origen" }],
      outputs: [
        { id: "true", label: "Verdadero" },
        { id: "false", label: "Falso" },
      ],
    });
    expect(workflowNodePorts(output)).toEqual({
      inputs: [{ id: "source", label: "Origen" }],
      outputs: [],
    });
  });
});

// The dashboard's drafts are checked with the shared rules (US-131); their own
// cases live in packages/api/src/workflow-graph.test.ts.
describe("workflow port compatibility of dashboard drafts", () => {
  it("lets an Origen input take another compatible source and nothing else", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [image("image"), model("model"), model("other"), condition, output],
      connections: [connect("image", "imagen", "model", "image")],
    };

    expect(
      workflowPortCompatibility(draft, connect("other", "result", "condition", "source")),
    ).toBe("compatible");
    expect(
      workflowPortCompatibility(draft, connect("condition", "false", "output", "source")),
    ).toBe("compatible");
    expect(
      workflowPortCompatibility(draft, connect("image", "imagen", "condition", "source")),
    ).toBe("incompatible");
  });
});
