import { describe, expect, it } from "vitest";

import { findWorkflowCycle, type WorkflowGraphDraft, workflowEdges } from "./workflow-graph";

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
