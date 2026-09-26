import { describe, expect, it } from "vitest";

import {
  findWorkflowCycle,
  type WorkflowGraphDraft,
  type WorkflowPortDraft,
  type WorkflowPortNode,
  workflowEdges,
  workflowPortCompatibility,
  workflowSourceTarget,
} from "./workflow-graph";

const edge = (sourceNodeId: string, targetNodeId: string) => ({
  sourceNodeId,
  sourcePort: "result",
  targetNodeId,
  targetPort: "image",
});

describe("workflowEdges", () => {
  it("lists the connections between ports and the sources of conditions and outputs", () => {
    const draft: WorkflowGraphDraft = {
      nodes: [
        { id: "image", type: "input.image" },
        { id: "model", type: "model.tflite" },
        { id: "condition", type: "condition", sourceNodeId: "model" },
        { id: "output", type: "output", sourceNodeId: "condition", sourcePort: "true" },
      ],
      connections: [
        { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
      ],
    };

    expect(workflowEdges(draft)).toEqual([
      { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
      {
        sourceNodeId: "model",
        sourcePort: "result",
        targetNodeId: "condition",
        targetPort: "source",
      },
      {
        sourceNodeId: "condition",
        sourcePort: "true",
        targetNodeId: "output",
        targetPort: "source",
      },
    ]);
  });

  it("gives a draft without connections only its source edges", () => {
    expect(workflowEdges({ nodes: [{ id: "image", type: "input.image" }] })).toEqual([]);
  });
});

describe("findWorkflowCycle", () => {
  const candidate = edge("b", "a");

  it("detects direct and indirect cycles and leaves acyclic additions alone", () => {
    expect(findWorkflowCycle({ nodes: [], connections: [edge("a", "b")] }, candidate)).toEqual([
      "b",
      "a",
    ]);
    expect(
      findWorkflowCycle({ nodes: [], connections: [edge("a", "c"), edge("c", "b")] }, candidate),
    ).toEqual(["b", "a", "c"]);
    expect(findWorkflowCycle({ nodes: [], connections: [edge("a", "c")] }, candidate)).toBe(
      undefined,
    );
  });

  it("follows the sources of conditions and outputs like any other edge", () => {
    // a → condition (its source) → b: connecting b back to a closes the loop.
    const draft: WorkflowGraphDraft = {
      nodes: [
        { id: "a", type: "model.tflite" },
        { id: "condition", type: "condition", sourceNodeId: "a" },
        { id: "b", type: "model.tflite" },
      ],
      connections: [
        { sourceNodeId: "condition", sourcePort: "true", targetNodeId: "b", targetPort: "image" },
      ],
    };

    expect(findWorkflowCycle(draft, candidate)).toEqual(["b", "a", "condition"]);
  });
});

const image = (id: string): WorkflowPortNode => ({ id, type: "input.image" });
const model = (
  id: string,
  type: "classification" | "detection" = "classification",
  labels = ["perro"],
): WorkflowPortNode => ({ id, type: "model.tflite", outputs: { result: { type, labels } } });
const connect = (
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort: string,
) => ({ sourceNodeId, sourcePort, targetNodeId, targetPort });

describe("workflowPortCompatibility", () => {
  const draft: WorkflowPortDraft = {
    nodes: [
      image("image"),
      model("model"),
      model("detector", "detection"),
      { id: "condition", type: "condition", sourceNodeId: "model", label: "perro" },
      {
        id: "output",
        type: "output",
        sourceNodeId: "condition",
        sourcePort: "true",
        resultType: "boolean",
      },
    ],
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
    const twoInputs: WorkflowPortDraft = { ...draft, nodes: [...draft.nodes, image("image-2")] };
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

// US-131: an Origen input always has one source; a compatible drop replaces it.
describe("reassigning the Origen of a condition or an output", () => {
  const draft: WorkflowPortDraft = {
    nodes: [
      image("image"),
      model("model-a"),
      model("model-b", "classification", ["gato", "perro"]),
      model("model-c", "classification", ["gato"]),
      model("detector", "detection", ["perro"]),
      { id: "condition", type: "condition", sourceNodeId: "model-a", label: "perro" },
      { id: "other-condition", type: "condition", sourceNodeId: "model-b", label: "gato" },
      {
        id: "classification-output",
        type: "output",
        sourceNodeId: "model-a",
        sourcePort: "result",
        resultType: "classification",
      },
      {
        id: "boolean-output",
        type: "output",
        sourceNodeId: "condition",
        sourcePort: "true",
        resultType: "boolean",
      },
    ],
    connections: [connect("image", "imagen", "model-a", "image")],
  };

  it("accepts another classification model that produces the condition's label", () => {
    expect(
      workflowPortCompatibility(draft, connect("model-b", "result", "condition", "source")),
    ).toBe("compatible");
  });

  it("rejects a model without the condition's label, a detection model, and a branch", () => {
    for (const [nodeId, port] of [
      ["model-c", "result"],
      ["detector", "result"],
      ["other-condition", "true"],
      ["image", "imagen"],
      ["missing", "result"],
    ] as const)
      expect(workflowPortCompatibility(draft, connect(nodeId, port, "condition", "source"))).toBe(
        "incompatible",
      );
  });

  it("accepts for an output only a result of its Tipo de resultado", () => {
    expect(
      workflowPortCompatibility(
        draft,
        connect("model-c", "result", "classification-output", "source"),
      ),
    ).toBe("compatible");
    expect(
      workflowPortCompatibility(
        draft,
        connect("detector", "result", "classification-output", "source"),
      ),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(
        draft,
        connect("condition", "true", "classification-output", "source"),
      ),
    ).toBe("incompatible");
  });

  it("accepts either branch of a condition for a boolean output, and no model result", () => {
    expect(
      workflowPortCompatibility(draft, connect("condition", "false", "boolean-output", "source")),
    ).toBe("compatible");
    expect(
      workflowPortCompatibility(
        draft,
        connect("other-condition", "true", "boolean-output", "source"),
      ),
    ).toBe("compatible");
    expect(
      workflowPortCompatibility(draft, connect("model-a", "result", "boolean-output", "source")),
    ).toBe("incompatible");
  });

  it("reports the current source as already connected", () => {
    expect(
      workflowPortCompatibility(draft, connect("model-a", "result", "condition", "source")),
    ).toBe("connected");
    expect(
      workflowPortCompatibility(draft, connect("condition", "true", "boolean-output", "source")),
    ).toBe("connected");
  });

  it("rejects a condition as its own source", () => {
    expect(
      workflowPortCompatibility(draft, connect("condition", "true", "condition", "source")),
    ).toBe("incompatible");
  });

  it("names the condition or output whose Origen a connection reaches", () => {
    expect(
      workflowSourceTarget(draft, connect("model-b", "result", "condition", "source")),
    ).toMatchObject({ id: "condition", type: "condition" });
    expect(
      workflowSourceTarget(draft, connect("condition", "false", "boolean-output", "source")),
    ).toMatchObject({ id: "boolean-output", type: "output" });
    expect(workflowSourceTarget(draft, connect("image", "imagen", "model-b", "image"))).toBe(
      undefined,
    );
    expect(workflowSourceTarget(draft, connect("model-b", "result", "missing", "source"))).toBe(
      undefined,
    );
  });
});
