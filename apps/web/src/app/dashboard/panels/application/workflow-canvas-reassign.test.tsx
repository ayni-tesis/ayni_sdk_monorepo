// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  WorkflowCanvas,
  type WorkflowCanvasAddNode,
  type WorkflowCanvasConnection,
  type WorkflowCanvasDraft,
  type WorkflowCanvasNode,
} from "./workflow-canvas";
import { canvasMouse, stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";

stubWorkflowCanvasLayout();

const model = (id: string, name: string, labels: string[]): WorkflowCanvasNode => ({
  id,
  type: "model.tflite",
  modelVersionId: `${id}-version`,
  modelName: name,
  version: "1.0.0",
  inputs: {
    image: { type: "image", width: 224, height: 224, channels: 3, normalization: "none" },
  },
  outputs: { result: { type: "classification", labels } },
});

// A condition on "perro" fed by model-a; model-b also produces "perro",
// model-c does not.
const draft: WorkflowCanvasDraft = {
  nodes: [
    model("model-a", "Perros", ["perro"]),
    model("model-b", "Mascotas", ["gato", "perro"]),
    model("model-c", "Gatos", ["gato"]),
    {
      id: "condition",
      type: "condition",
      sourceNodeId: "model-a",
      label: "perro",
      operator: "gte",
      threshold: 0.8,
      branches: { true: "Verdadero", false: "Falso" },
    },
  ],
  layout: {
    "model-a": { x: 0, y: 0 },
    "model-b": { x: 0, y: 300 },
    "model-c": { x: 0, y: 600 },
    condition: { x: 500, y: 0 },
  },
};

const connection = (
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort: string,
): WorkflowCanvasConnection => ({ sourceNodeId, sourcePort, targetNodeId, targetPort });
const currentSource = connection("model-a", "result", "condition", "source");

const handlers = {
  onSelectSource: vi.fn(),
  onSelectNodes: vi.fn(),
  onRequestDeleteNode: vi.fn(),
  onSelectConnection: vi.fn(),
  onConnect: vi.fn(),
  onMoveNodes: vi.fn(),
  onArrangeNodes: vi.fn(),
  onDropPalette: vi.fn(),
  onRemoveConnection: vi.fn(),
};
const onAddAfter = vi.fn();
const addNode: WorkflowCanvasAddNode = {
  open: false,
  onToggle: vi.fn(),
  onAddAfter,
  panel: () => null,
};

function renderCanvas({
  canManage = true,
  pendingConnection = null,
}: {
  canManage?: boolean;
  pendingConnection?: WorkflowCanvasConnection | null;
} = {}) {
  return render(
    <WorkflowCanvas
      draft={draft}
      canManage={canManage}
      selectedConnection={null}
      connectionSource={null}
      cycleNodeIds={[]}
      savingPositions={false}
      arrangingNodes={false}
      selectedNodeIds={[]}
      pendingConnection={pendingConnection}
      addNode={canManage ? addNode : undefined}
      {...handlers}
    />,
  );
}

// jsdom has no hit testing; React Flow asks which element is under the pointer
// to find the port a connection is dropped on.
let elementUnderPointer: Element | null = null;
beforeAll(() => {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => elementUnderPointer,
  });
});
afterAll(() => {
  Reflect.deleteProperty(document, "elementFromPoint");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  elementUnderPointer = null;
});

const card = (id: string) => screen.getByTestId(`workflow-node-${id}`);
const port = (nodeId: string, portId: string) =>
  document.querySelector(
    `.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${portId}"]`,
  ) as HTMLElement;
const portState = (nodeId: string, portId: string) =>
  card(nodeId).querySelector(`[data-port="${portId}"]`)?.getAttribute("data-port-state") ?? null;
const edgeId = (edge: WorkflowCanvasConnection) =>
  `${edge.sourceNodeId}:${edge.sourcePort}:${edge.targetNodeId}:${edge.targetPort}`;
const edge = (item: WorkflowCanvasConnection) =>
  document.querySelector(`.react-flow__edge[data-id="${edgeId(item)}"]`) as SVGGElement;
/** The end of an edge that its source port holds, dragged to give it another source. */
const sourceEnd = (item: WorkflowCanvasConnection) =>
  edge(item).querySelector(".react-flow__edgeupdater-source");

/** Presses on `element` and moves past React Flow's 1 px threshold. */
function startDrag(element: Element) {
  act(() => {
    canvasMouse("mouseDown", element, 10, 10);
    canvasMouse("mouseMove", document, 20, 10);
  });
}

/** Moves the pointer over `target` (or empty space) and releases it there. */
function dropOn(target: Element | null) {
  elementUnderPointer = target ?? document.querySelector(".react-flow__pane");
  act(() => {
    canvasMouse("mouseMove", document, 90_000, 90_000);
    canvasMouse("mouseUp", document, 90_000, 90_000);
  });
}

describe("dragging an output to the Origen of a condition (US-131)", () => {
  it("marks the Origen compatible for another model with the condition's label and reassigns it on drop", () => {
    renderCanvas();

    startDrag(port("model-b", "result"));
    expect(portState("condition", "source")).toBe("compatible");

    dropOn(port("condition", "source"));

    expect(handlers.onConnect).toHaveBeenCalledExactlyOnceWith(
      connection("model-b", "result", "condition", "source"),
    );
  });

  it("marks the Origen incompatible for a model without the label and still reports the drop", () => {
    renderCanvas();

    startDrag(port("model-c", "result"));
    expect(portState("condition", "source")).toBe("incompatible");

    dropOn(port("condition", "source"));

    // Reported so that it can be rejected with the condition's message.
    expect(handlers.onConnect).toHaveBeenCalledExactlyOnceWith(
      connection("model-c", "result", "condition", "source"),
    );
  });
});

describe("dragging the source end of an Origen edge (US-131)", () => {
  it("lets administrators drag the source end of a condition's source edge to another output", () => {
    renderCanvas();
    const end = sourceEnd(currentSource);
    if (!end) throw new Error("Expected the source end of the edge to be draggable");

    startDrag(end);
    // Outputs that can feed the condition are marked; the others are dimmed.
    expect(portState("model-b", "result")).toBe("compatible");
    expect(within(card("model-b")).getByText("Compatible")).toBeTruthy();
    expect(portState("model-c", "result")).toBe("incompatible");
    expect(portState("condition", "true")).toBe("incompatible");

    dropOn(port("model-b", "result"));

    expect(handlers.onConnect).toHaveBeenCalledExactlyOnceWith(
      connection("model-b", "result", "condition", "source"),
    );
    expect(onAddAfter).not.toHaveBeenCalled();
  });

  it("reports a drop on an output the condition does not accept so it can be rejected", () => {
    renderCanvas();
    const end = sourceEnd(currentSource);
    if (!end) throw new Error("Expected the source end of the edge to be draggable");

    startDrag(end);
    dropOn(port("model-c", "result"));

    expect(handlers.onConnect).toHaveBeenCalledExactlyOnceWith(
      connection("model-c", "result", "condition", "source"),
    );
  });

  it("keeps the edge when it is dropped on the background or back on its source", () => {
    renderCanvas();

    startDrag(sourceEnd(currentSource) as Element);
    dropOn(null);
    startDrag(sourceEnd(currentSource) as Element);
    dropOn(port("model-a", "result"));

    expect(handlers.onConnect).not.toHaveBeenCalled();
    expect(onAddAfter).not.toHaveBeenCalled();
    expect(edge(currentSource)).not.toBeNull();
  });

  it("offers no draggable end to members", () => {
    renderCanvas({ canManage: false });

    expect(edge(currentSource)).not.toBeNull();
    expect(sourceEnd(currentSource)).toBeNull();
  });
});

describe("the reassigned edge while it saves (US-131)", () => {
  it("draws the new edge dotted until it is saved", () => {
    const pending = connection("model-a", "result", "condition", "source");
    const { rerender } = renderCanvas({ pendingConnection: pending });
    const path = () =>
      edge(pending).querySelector(".react-flow__edge-path") as SVGPathElement | null;

    expect(path()?.style.strokeDasharray).toBe("1 6");

    rerender(
      <WorkflowCanvas
        draft={draft}
        canManage
        selectedConnection={null}
        connectionSource={null}
        cycleNodeIds={[]}
        savingPositions={false}
        arrangingNodes={false}
        selectedNodeIds={[]}
        pendingConnection={null}
        {...handlers}
      />,
    );
    expect(path()?.style.strokeDasharray).toBe("5 5");
  });
});
