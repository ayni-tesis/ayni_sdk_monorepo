import { describe, expect, it } from "vitest";
import {
  defaultWorkflowCanvasPosition,
  nextWorkflowCanvasPosition,
  type WorkflowCanvasDraft,
  workflowCanvasEdges,
  workflowNodePosition,
} from "./workflow-canvas";

describe("workflow canvas layout", () => {
  it("gives legacy nodes stable positions and preserves saved positions", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [
        { id: "image", type: "input.image", outputs: { imagen: "image" } },
        { id: "model", type: "input.image", outputs: { imagen: "image" } },
      ],
      layout: { image: { x: 480, y: 144 } },
    };

    expect(workflowNodePosition(draft, draft.nodes[0], 0)).toEqual({ x: 480, y: 144 });
    expect(workflowNodePosition(draft, draft.nodes[1], 1)).toEqual(
      defaultWorkflowCanvasPosition(1),
    );
  });

  it("chooses the first grid position that does not overlap a moved node", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [{ id: "moved", type: "input.image", outputs: { imagen: "image" } }],
      layout: { moved: defaultWorkflowCanvasPosition(0) },
    };

    expect(nextWorkflowCanvasPosition(draft)).toEqual(defaultWorkflowCanvasPosition(1));
  });

  it("draws explicit connections and source references from conditions and outputs", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [
        { id: "image", type: "input.image", outputs: { imagen: "image" } },
        {
          id: "condition",
          type: "condition",
          sourceNodeId: "model",
          label: "roya",
          operator: "gte",
          threshold: 0.5,
          branches: { true: "Verdadero", false: "Falso" },
        },
        {
          id: "output",
          type: "output",
          name: "Resultado",
          sourceNodeId: "condition",
          sourcePort: "true",
          resultType: "boolean",
        },
      ],
      connections: [
        { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
      ],
    };

    expect(workflowCanvasEdges(draft)).toEqual([
      ...(draft.connections ?? []),
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
});
