import { describe, expect, it } from "vitest";

import {
  findWorkflowCycle,
  isCaptureConditionCompatible,
  isConditionSourceCompatible,
  isOutputSourceCompatible,
  type WorkflowGraphDraft,
  type WorkflowPortDraft,
  type WorkflowPortNode,
  workflowEdges,
  workflowInputPortTypes,
  workflowNodesToDelete,
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

  it("includes every source of a combined output", () => {
    expect(
      workflowEdges({
        nodes: [
          {
            id: "output",
            type: "output",
            sourceNodeId: "classifier",
            sourcePort: "result",
            sources: [{ sourceNodeId: "detector", sourcePort: "result" }],
          },
        ],
      }),
    ).toEqual([
      {
        sourceNodeId: "classifier",
        sourcePort: "result",
        targetNodeId: "output",
        targetPort: "source",
      },
      {
        sourceNodeId: "detector",
        sourcePort: "result",
        targetNodeId: "output",
        targetPort: "source",
      },
    ]);
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
  type: "classification" | "detection" | "segmentation" = "classification",
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

// US-064: a capture takes an image on `imagen` and an inference result on `resultado`.
describe("the inputs of a dataset capture", () => {
  const draft: WorkflowPortDraft = {
    nodes: [
      image("image"),
      model("classifier"),
      model("detector", "detection"),
      { id: "condition", type: "condition", sourceNodeId: "classifier", label: "perro" },
      { id: "capture", type: "dataset.capture" },
    ],
  };

  it("accepts the image on imagen and a classification or detection result on resultado", () => {
    expect(workflowPortCompatibility(draft, connect("image", "imagen", "capture", "imagen"))).toBe(
      "compatible",
    );
    expect(
      workflowPortCompatibility(draft, connect("detector", "result", "capture", "resultado")),
    ).toBe("compatible");
    expect(
      workflowPortCompatibility(draft, connect("classifier", "result", "capture", "resultado")),
    ).toBe("compatible");
  });

  it("rejects a result on imagen, the image or a branch on resultado, and unknown inputs", () => {
    expect(
      workflowPortCompatibility(draft, connect("detector", "result", "capture", "imagen")),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(draft, connect("image", "imagen", "capture", "resultado")),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(draft, connect("condition", "true", "capture", "resultado")),
    ).toBe("incompatible");
    expect(workflowPortCompatibility(draft, connect("image", "imagen", "capture", "image"))).toBe(
      "incompatible",
    );
  });

  it("takes one connection per input and has no outputs", () => {
    const connected: WorkflowPortDraft = {
      ...draft,
      connections: [connect("detector", "result", "capture", "resultado")],
    };
    expect(
      workflowPortCompatibility(connected, connect("classifier", "result", "capture", "resultado")),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(connected, connect("capture", "resultado", "detector", "image")),
    ).toBe("incompatible");
  });
});

describe("a segmentation model (US-159)", () => {
  const draft: WorkflowPortDraft = {
    nodes: [
      image("image"),
      model("segmenter", "segmentation", ["fondo", "roya"]),
      model("classifier", "classification", ["roya"]),
      { id: "capture", type: "dataset.capture" },
      { id: "condition", type: "condition", sourceNodeId: "classifier", label: "roya" },
      {
        id: "mask",
        type: "output",
        sourceNodeId: "segmenter",
        sourcePort: "result",
        resultType: "segmentation",
      },
      {
        id: "diagnosis",
        type: "output",
        sourceNodeId: "classifier",
        sourcePort: "result",
        resultType: "classification",
      },
    ],
  };

  it("takes the image and feeds an output of type segmentation", () => {
    expect(workflowPortCompatibility(draft, connect("image", "imagen", "segmenter", "image"))).toBe(
      "compatible",
    );
    expect(workflowPortCompatibility(draft, connect("segmenter", "result", "mask", "source"))).toBe(
      "connected",
    );
  });

  it("rejects an output of another result type and a capture", () => {
    expect(
      workflowPortCompatibility(draft, connect("segmenter", "result", "diagnosis", "source")),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(draft, connect("segmenter", "result", "capture", "resultado")),
    ).toBe("incompatible");
  });

  // US-161: a condition compares the area fraction of one of the model's labels.
  it("feeds a condition on one of its labels", () => {
    const segmenter = draft.nodes.find((node) => node.id === "segmenter");
    expect(isConditionSourceCompatible(segmenter, "roya")).toBe(true);
    expect(isConditionSourceCompatible(segmenter, "fondo")).toBe(true);
    expect(isConditionSourceCompatible(segmenter, "mildiu")).toBe(false);
    // The condition hangs from the classifier; connecting the segmenter to its
    // source input reassigns it (US-131).
    const reassigned: WorkflowPortDraft = {
      nodes: [
        ...draft.nodes.filter((node) => node.id !== "condition"),
        { id: "condition", type: "condition", sourceNodeId: "classifier", label: "roya" },
      ],
    };
    expect(
      workflowPortCompatibility(reassigned, connect("segmenter", "result", "condition", "source")),
    ).toBe("compatible");
  });

  it("does not feed a condition on a label it lacks", () => {
    const missingLabel: WorkflowPortDraft = {
      nodes: [
        ...draft.nodes.filter((node) => node.id !== "condition"),
        { id: "condition", type: "condition", sourceNodeId: "classifier", label: "mildiu" },
      ],
    };
    expect(
      workflowPortCompatibility(
        missingLabel,
        connect("segmenter", "result", "condition", "source"),
      ),
    ).toBe("incompatible");
  });

  it("accepts a segmentation source inside a combined output", () => {
    const segmenter = draft.nodes.find((node) => node.id === "segmenter");
    const classifier = draft.nodes.find((node) => node.id === "classifier");
    // A combined output checks its own source and each entry of `sources`.
    const sources = [
      { node: classifier, sourcePort: "result", resultType: "classification" },
      { node: segmenter, sourcePort: "result", resultType: "segmentation" },
    ] as const;
    for (const source of sources)
      expect(isOutputSourceCompatible(source.node, source.sourcePort, source.resultType)).toBe(
        true,
      );
    expect(isOutputSourceCompatible(segmenter, "result", "classification")).toBe(false);
  });
});

// US-074: a capture may hang from a branch of a condition on the result it captures.
describe("a dataset capture behind a condition", () => {
  const draft: WorkflowPortDraft = {
    nodes: [
      image("image"),
      model("classifier"),
      model("other"),
      { id: "condition", type: "condition", sourceNodeId: "classifier", label: "perro" },
      { id: "other-condition", type: "condition", sourceNodeId: "other", label: "perro" },
      { id: "capture", type: "dataset.capture" },
    ],
    connections: [
      connect("image", "imagen", "capture", "imagen"),
      connect("classifier", "result", "capture", "resultado"),
    ],
  };

  it("takes either branch of a condition on condicion", () => {
    expect(workflowInputPortTypes(draft.nodes.at(-1), "condicion")).toEqual(["boolean"]);
    for (const branch of ["true", "false"])
      expect(
        workflowPortCompatibility(draft, connect("condition", branch, "capture", "condicion")),
      ).toBe("compatible");
  });

  it("rejects a result or the image on condicion", () => {
    expect(
      workflowPortCompatibility(draft, connect("classifier", "result", "capture", "condicion")),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(draft, connect("image", "imagen", "capture", "condicion")),
    ).toBe("incompatible");
  });

  it("takes one condition, on the model whose result it captures", () => {
    expect(
      workflowPortCompatibility(draft, connect("other-condition", "true", "capture", "condicion")),
    ).toBe("incompatible");
    const gated: WorkflowPortDraft = {
      ...draft,
      connections: [
        connect("image", "imagen", "capture", "imagen"),
        connect("condition", "true", "capture", "condicion"),
      ],
    };
    expect(
      workflowPortCompatibility(gated, connect("condition", "false", "capture", "condicion")),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(gated, connect("other", "result", "capture", "resultado")),
    ).toBe("incompatible");
    expect(
      workflowPortCompatibility(gated, connect("classifier", "result", "capture", "resultado")),
    ).toBe("compatible");
  });

  it("keeps a condition a capture hangs from on the model the capture takes", () => {
    const gated: WorkflowPortDraft = {
      ...draft,
      connections: [
        ...(draft.connections ?? []),
        connect("condition", "true", "capture", "condicion"),
      ],
    };
    expect(
      workflowPortCompatibility(gated, connect("other", "result", "condition", "source")),
    ).toBe("incompatible");
    // A condition no capture hangs from may still take another source.
    expect(
      workflowPortCompatibility(draft, connect("other", "result", "condition", "source")),
    ).toBe("compatible");
  });

  it("tells whether the condition of a capture evaluates the result it captures", () => {
    expect(isCaptureConditionCompatible(draft, "capture")).toBe(true);
    expect(
      isCaptureConditionCompatible(
        {
          ...draft,
          connections: [
            ...(draft.connections ?? []),
            connect("condition", "false", "capture", "condicion"),
          ],
        },
        "capture",
      ),
    ).toBe(true);
    expect(
      isCaptureConditionCompatible(
        {
          ...draft,
          connections: [
            ...(draft.connections ?? []),
            connect("other-condition", "true", "capture", "condicion"),
          ],
        },
        "capture",
      ),
    ).toBe(false);
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

describe("workflowNodesToDelete", () => {
  const draft: WorkflowGraphDraft = {
    nodes: [
      { id: "image", type: "input.image" },
      { id: "model-a", type: "model.tflite" },
      { id: "model-b", type: "model.tflite" },
      { id: "model-c", type: "model.tflite" },
      { id: "condition", type: "condition", sourceNodeId: "model-a" },
      { id: "branch-output", type: "output", sourceNodeId: "condition", sourcePort: "true" },
      { id: "c-output", type: "output", sourceNodeId: "model-c", sourcePort: "result" },
    ],
    connections: [
      { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model-a", targetPort: "image" },
      { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model-b", targetPort: "image" },
    ],
  };

  it("adds the conditions and outputs that depend on the selected nodes, in draft order", () => {
    expect(workflowNodesToDelete(draft, ["model-b", "model-a"])).toEqual([
      "model-a",
      "model-b",
      "condition",
      "branch-output",
    ]);
  });

  it("keeps the nodes a connection reaches, since only their connection goes", () => {
    expect(workflowNodesToDelete(draft, ["image"])).toEqual(["image"]);
  });

  it("counts a selected dependent once and ignores ids missing from the draft", () => {
    expect(workflowNodesToDelete(draft, ["condition", "model-a", "missing"])).toEqual([
      "model-a",
      "condition",
      "branch-output",
    ]);
  });

  it("deletes a combined output when any declared source is deleted", () => {
    const combined = {
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === "c-output" && node.type === "output"
          ? {
              ...node,
              sources: [{ sourceNodeId: "model-b", sourcePort: "result" }],
            }
          : node,
      ),
    } satisfies WorkflowGraphDraft;

    expect(workflowNodesToDelete(combined, ["model-b"])).toContain("c-output");
  });
});
