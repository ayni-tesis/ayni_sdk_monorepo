import { describe, expect, it } from "vitest";
import {
  defaultWorkflowCanvasPosition,
  nextWorkflowCanvasPosition,
  type WorkflowCanvasDraft,
  workflowCanvasEdges,
  workflowCanvasFitViewport,
  workflowConditionRule,
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

describe("workflow canvas fit to view", () => {
  const size = { width: 1000, height: 600 };
  const condition = (id: string) =>
    ({
      id,
      type: "condition",
      sourceNodeId: "model",
      label: "roya",
      operator: "gte",
      threshold: 0.5,
      branches: { true: "Verdadero", false: "Falso" },
    }) as const;

  it("shows every node when they fit at 25 % or more", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [condition("a"), condition("b")],
      layout: { a: { x: 0, y: 0 }, b: { x: 1600, y: 700 } },
    };

    const viewport = workflowCanvasFitViewport(draft, size);

    expect(viewport.zoom).toBeGreaterThanOrEqual(0.25);
    expect(viewport.zoom).toBeLessThan(1);
    expect(viewport.x).toBeGreaterThanOrEqual(0);
    expect(viewport.x + (1600 + 292) * viewport.zoom).toBeLessThanOrEqual(size.width);
  });

  it("centers the image input at 25 % when the nodes do not fit", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [condition("far"), { id: "image", type: "input.image", outputs: { imagen: "image" } }],
      layout: { far: { x: 0, y: 0 }, image: { x: 20000, y: 400 } },
    };

    const viewport = workflowCanvasFitViewport(draft, size);

    expect(viewport.zoom).toBe(0.25);
    expect(viewport.x + (20000 + 292 / 2) * viewport.zoom).toBe(size.width / 2);
    expect(viewport.y + (400 + 188 / 2) * viewport.zoom).toBe(size.height / 2);
  });

  it("centers the first node at 25 % when there is no image input", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [condition("first"), condition("far")],
      layout: { first: { x: 100, y: 100 }, far: { x: 20000, y: 0 } },
    };

    const viewport = workflowCanvasFitViewport(draft, size);

    expect(viewport.zoom).toBe(0.25);
    expect(viewport.x + (100 + 292 / 2) * viewport.zoom).toBe(size.width / 2);
  });
});

describe("workflow condition rule", () => {
  const condition = (operator: "gte" | "gt" | "lte" | "lt", threshold: number) =>
    ({
      id: "condition",
      type: "condition",
      sourceNodeId: "model",
      label: "perro",
      operator,
      threshold,
      branches: { true: "Verdadero", false: "Falso" },
    }) as const;

  it("reads the label, the operator symbol and the threshold with a decimal comma", () => {
    expect(workflowConditionRule(condition("gte", 0.8))).toBe("perro ≥ 0,8");
    expect(workflowConditionRule(condition("gt", 0.25))).toBe("perro > 0,25");
    expect(workflowConditionRule(condition("lte", 1))).toBe("perro ≤ 1");
    expect(workflowConditionRule(condition("lt", 0))).toBe("perro < 0");
  });
});
