import { describe, expect, it } from "vitest";
import type { WorkflowCanvasDraft, WorkflowCanvasNode } from "./workflow-canvas";
import { workflowCanvasEdges } from "./workflow-canvas";
import {
  arrangeWorkflowNodes,
  placeWorkflowNodeAfter,
  WORKFLOW_LAYOUT_LEVEL_GAP,
  WORKFLOW_LAYOUT_NODE_GAP,
} from "./workflow-canvas-layout";
import type { WorkflowCanvasSize } from "./workflow-canvas-viewport";

const image: WorkflowCanvasNode = {
  id: "image",
  type: "input.image",
  outputs: { imagen: "image" },
};
const model = (id: string): WorkflowCanvasNode => ({
  id,
  type: "model.tflite",
  modelVersionId: `${id}-version`,
  modelName: id,
  version: "1.0.0",
  inputs: {
    image: { type: "image", width: 224, height: 224, channels: 3, normalization: "zero_to_one" },
  },
  outputs: { result: { type: "classification", labels: ["hoja"] } },
});
const condition = (id: string, sourceNodeId: string): WorkflowCanvasNode => ({
  id,
  type: "condition",
  sourceNodeId,
  label: "hoja",
  operator: "gte",
  threshold: 0.5,
  branches: { true: "Verdadero", false: "Falso" },
});
const output = (id: string, sourceNodeId: string, sourcePort: string): WorkflowCanvasNode => ({
  id,
  type: "output",
  name: id,
  sourceNodeId,
  sourcePort,
  resultType: sourcePort === "result" ? "classification" : "boolean",
});
const fromImage = (targetNodeId: string) => ({
  sourceNodeId: "image",
  sourcePort: "imagen",
  targetNodeId,
  targetPort: "image",
});

/** Every card at 292 × 188 unless a test gives it another measured size. */
function sizesOf(draft: WorkflowCanvasDraft, measured: Record<string, WorkflowCanvasSize> = {}) {
  return Object.fromEntries(
    draft.nodes.map((node) => [node.id, measured[node.id] ?? { width: 292, height: 188 }]),
  );
}

function arrange(draft: WorkflowCanvasDraft, measured?: Record<string, WorkflowCanvasSize>) {
  return arrangeWorkflowNodes(draft.nodes, workflowCanvasEdges(draft), sizesOf(draft, measured));
}

// Leaf diagnosis: validate the leaf, then branch on the condition.
const diagnosis: WorkflowCanvasDraft = {
  nodes: [
    output("healthy", "leaf-check", "false"),
    image,
    condition("leaf-check", "leaf"),
    output("disease", "leaf-check", "true"),
    model("leaf"),
  ],
  connections: [fromImage("leaf")],
  // Every node piled on the same spot.
  layout: {
    healthy: { x: 48, y: 48 },
    image: { x: 48, y: 48 },
    "leaf-check": { x: 48, y: 48 },
    disease: { x: 48, y: 48 },
    leaf: { x: 48, y: 48 },
  },
};

describe("arrangeWorkflowNodes", () => {
  it("places every node right of its dependencies, 48 px apart per level and 24 px within one, without overlaps", () => {
    const measured = {
      leaf: { width: 320, height: 240 },
      "leaf-check": { width: 292, height: 212.5 },
      disease: { width: 260.4, height: 150 },
    };
    const sizes = sizesOf(diagnosis, measured);
    const positions = arrange(diagnosis, measured);

    expect(Object.keys(positions).sort()).toEqual(diagnosis.nodes.map((node) => node.id).sort());
    const box = (id: string) => ({ ...positions[id], ...sizes[id] });
    for (const edge of workflowCanvasEdges(diagnosis)) {
      const source = box(edge.sourceNodeId);
      expect(box(edge.targetNodeId).x - (source.x + source.width)).toBeGreaterThanOrEqual(48);
    }
    // disease and healthy share the last level.
    const [upper, lower] = [box("disease"), box("healthy")].sort((a, b) => a.y - b.y);
    expect(lower.y - (upper.y + upper.height)).toBeGreaterThanOrEqual(24);
    const ids = Object.keys(positions);
    for (const a of ids)
      for (const b of ids) {
        if (a >= b) continue;
        const [first, second] = [box(a), box(b)];
        const apart =
          first.x + first.width <= second.x ||
          second.x + second.width <= first.x ||
          first.y + first.height <= second.y ||
          second.y + second.height <= first.y;
        expect(apart, `${a} overlaps ${b}`).toBe(true);
      }
  });

  it("starts with the image input and keeps the Verdadero branch above the Falso one", () => {
    const positions = arrange(diagnosis);

    expect(positions.image.x).toBe(48);
    for (const id of ["leaf", "leaf-check", "disease", "healthy"])
      expect(positions[id].x).toBeGreaterThan(positions.image.x);
    // healthy (Falso) comes first in the draft, but the branches follow their ports.
    expect(positions.disease.y).toBeLessThan(positions.healthy.y);
  });

  it("orders the nodes of one level as the draft does", () => {
    const fanOut = (order: string[]): WorkflowCanvasDraft => ({
      nodes: [image, ...order.map(model)],
      connections: order.map(fromImage),
    });

    const forward = arrange(fanOut(["a", "b", "c"]));
    expect(forward.a.y).toBeLessThan(forward.b.y);
    expect(forward.b.y).toBeLessThan(forward.c.y);
    const backward = arrange(fanOut(["c", "b", "a"]));
    expect(backward.c.y).toBeLessThan(backward.b.y);
    expect(backward.b.y).toBeLessThan(backward.a.y);
  });

  it("puts the nodes the image input does not reach in a row below the main flow", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [
        // Its model has no image connected, so neither is reached.
        output("orphan-result", "orphan", "result"),
        image,
        model("orphan"),
        model("leaf"),
        // A reference to a deleted node, as a validation error would report.
        output("broken", "deleted-node", "result"),
      ],
      connections: [fromImage("leaf")],
    };
    const positions = arrange(draft);

    const mainBottom = Math.max(positions.image.y, positions.leaf.y) + 188;
    const row = ["orphan", "orphan-result", "broken"];
    for (const id of row) {
      expect(positions[id].y).toBe(mainBottom + 48);
    }
    // Dependencies first, then the draft order, 48 px apart.
    expect(positions.orphan.x).toBe(48);
    expect(positions["orphan-result"].x).toBe(48 + 292 + 48);
    expect(positions.broken.x).toBe(48 + 2 * (292 + 48));
  });

  it("puts every node in the row when the draft has no image input", () => {
    const draft: WorkflowCanvasDraft = {
      nodes: [output("result", "leaf", "result"), model("leaf")],
    };

    expect(arrange(draft)).toEqual({
      leaf: { x: 48, y: 48 },
      result: { x: 48 + 292 + 48, y: 48 },
    });
  });

  it("still arranges every node when the connections form a cycle", () => {
    // The server rejects cycles, but a corrupt draft must not block the action.
    const draft: WorkflowCanvasDraft = {
      nodes: [image, model("a"), model("b")],
      connections: [
        fromImage("a"),
        { sourceNodeId: "a", sourcePort: "result", targetNodeId: "b", targetPort: "image" },
        { sourceNodeId: "b", sourcePort: "result", targetNodeId: "a", targetPort: "image" },
      ],
    };

    const positions = arrange(draft);

    expect(Object.keys(positions).sort()).toEqual(["a", "b", "image"]);
    expect(new Set(Object.values(positions).map(({ x, y }) => `${x},${y}`)).size).toBe(3);
  });

  it("gives the same positions when the arranged draft is arranged again", () => {
    const first = arrange(diagnosis);

    expect(arrange({ ...diagnosis, layout: first })).toEqual(first);
  });
});

describe("placeWorkflowNodeAfter", () => {
  const card = { width: 292, height: 188 };
  const box = (x: number, y: number) => ({ x, y, ...card });

  it("places the node right of its source, level with it", () => {
    expect(placeWorkflowNodeAfter("source", { source: box(100, 40) }, card)).toEqual({
      x: 100 + 292 + WORKFLOW_LAYOUT_LEVEL_GAP,
      y: 40,
    });
  });

  it("moves down to the first free place when nodes take that place", () => {
    const right = 100 + 292 + WORKFLOW_LAYOUT_LEVEL_GAP;
    const boxes = {
      source: box(100, 40),
      // The source's first branch, and a second node just below it.
      first: box(right, 40),
      second: box(right + 100, 40 + 188 + WORKFLOW_LAYOUT_NODE_GAP),
      // Far below, leaving a free place in between.
      far: box(right, 2000),
    };

    const position = placeWorkflowNodeAfter("source", boxes, card);

    expect(position).toEqual({ x: right, y: 40 + 2 * (188 + WORKFLOW_LAYOUT_NODE_GAP) });
    for (const other of Object.values(boxes))
      expect(
        position.x < other.x + other.width &&
          position.x + card.width > other.x &&
          position.y < other.y + other.height &&
          position.y + card.height > other.y,
      ).toBe(false);
  });

  it("keeps a gap from a node that only nearly touches that place", () => {
    const right = 100 + 292 + WORKFLOW_LAYOUT_LEVEL_GAP;
    const boxes = { source: box(100, 40), near: box(right, 40 + 188 + 10) };

    expect(placeWorkflowNodeAfter("source", boxes, card).y).toBe(
      40 + 188 + 10 + 188 + WORKFLOW_LAYOUT_NODE_GAP,
    );
  });
});
