import { describe, expect, it } from "vitest";
import type { WorkflowCanvasDraft, WorkflowCanvasNode } from "./workflow-canvas";
import { workflowNodePorts, workflowPortCompatibility } from "./workflow-canvas-ports";

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

describe("workflow port compatibility", () => {
  const draft: WorkflowCanvasDraft = {
    nodes: [image("image"), model("model"), model("detector", "detection"), condition, output],
    connections: [connect("image", "imagen", "model", "image")],
  };

  it("accepts the image output on a free model image input", () => {
    expect(workflowPortCompatibility(draft, connect("image", "imagen", "detector", "image"))).toBe(
      "compatible",
    );
  });

  it("reports a connection that already exists", () => {
    expect(workflowPortCompatibility(draft, connect("image", "imagen", "model", "image"))).toBe(
      "connected",
    );
  });

  it("rejects a model image input that already has a connection", () => {
    const twoInputs: WorkflowCanvasDraft = { ...draft, nodes: [...draft.nodes, image("image-2")] };
    expect(
      workflowPortCompatibility(twoInputs, connect("image-2", "imagen", "model", "image")),
    ).toBe("incompatible");
  });

  it("rejects ports whose types do not match", () => {
    expect(workflowPortCompatibility(draft, connect("model", "result", "detector", "image"))).toBe(
      "incompatible",
    );
    expect(
      workflowPortCompatibility(draft, connect("condition", "true", "detector", "image")),
    ).toBe("incompatible");
  });

  // The Origen input is reassigned by US-131; until then nothing connects to it.
  it("does not connect to an Origen input yet", () => {
    expect(
      workflowPortCompatibility(draft, connect("model", "result", "condition", "source")),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(draft, connect("condition", "false", "output", "source")),
    ).toBe("incompatible");
  });

  it("rejects missing nodes, unknown ports, and a node connected to itself", () => {
    expect(
      workflowPortCompatibility(draft, connect("missing", "imagen", "detector", "image")),
    ).toBe("incompatible");
    expect(workflowPortCompatibility(draft, connect("image", "result", "detector", "image"))).toBe(
      "incompatible",
    );
    expect(
      workflowPortCompatibility(draft, connect("detector", "result", "detector", "image")),
    ).toBe("incompatible");
  });
});
