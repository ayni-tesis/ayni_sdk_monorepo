// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  WorkflowCanvas,
  type WorkflowCanvasAddNode,
  type WorkflowCanvasDraft,
  type WorkflowCanvasPlacement,
} from "./workflow-canvas";
import { canvasMouse, stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";

stubWorkflowCanvasLayout();

// The model's Resultado already feeds the condition, and Verdadero an output.
const draft: WorkflowCanvasDraft = {
  nodes: [
    { id: "image", type: "input.image", outputs: { imagen: "image" } },
    {
      id: "model",
      type: "model.tflite",
      modelVersionId: "model-version",
      modelName: "Clasificador",
      version: "1.0.0",
      inputs: {
        image: { type: "image", width: 224, height: 224, channels: 3, normalization: "none" },
      },
      outputs: { result: { type: "classification", labels: ["perro"] } },
    },
    {
      id: "condition",
      type: "condition",
      sourceNodeId: "model",
      label: "perro",
      operator: "gte",
      threshold: 0.5,
      branches: { true: "Verdadero", false: "Falso" },
    },
    {
      id: "output",
      type: "output",
      name: "Perro",
      sourceNodeId: "condition",
      sourcePort: "true",
      resultType: "boolean",
    },
  ],
  connections: [
    { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
  ],
  layout: {
    image: { x: 0, y: 0 },
    model: { x: 400, y: 0 },
    condition: { x: 800, y: 0 },
    output: { x: 1140, y: 0 },
  },
};

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

function renderCanvas({
  addNode,
  savingPositions = false,
}: {
  addNode?: WorkflowCanvasAddNode;
  savingPositions?: boolean;
} = {}) {
  return render(
    <WorkflowCanvas
      draft={draft}
      canManage
      selectedConnection={null}
      connectionSource={null}
      cycleNodeIds={[]}
      savingPositions={savingPositions}
      arrangingNodes={false}
      addNode={addNode}
      selectedNodeIds={[]}
      {...handlers}
    />,
  );
}

const addNodeControl = (overrides: Partial<WorkflowCanvasAddNode> = {}): WorkflowCanvasAddNode => ({
  open: false,
  onToggle: vi.fn(),
  onAddAfter: vi.fn(),
  panel: () => null,
  ...overrides,
});

// jsdom has no hit testing; React Flow asks which element is under the pointer.
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

function dragConnection(nodeId: string, portId: string, dropOn: Element | null) {
  act(() => {
    canvasMouse("mouseDown", port(nodeId, portId), 10, 10);
    canvasMouse("mouseMove", document, 20, 10);
  });
  elementUnderPointer = dropOn;
  act(() => {
    canvasMouse("mouseMove", document, 90_000, 90_000);
    canvasMouse("mouseUp", document, 90_000, 90_000);
  });
}

describe("adding a node after an output port", () => {
  it("offers + on every output port, connected or not", () => {
    const addNode = addNodeControl();
    renderCanvas({ addNode });

    for (const [nodeId, portLabel, sourcePort] of [
      ["image", "imagen", "imagen"],
      ["model", "Resultado", "result"],
      ["condition", "Verdadero", "true"],
      ["condition", "Falso", "false"],
    ]) {
      fireEvent.click(
        within(card(nodeId)).getByRole("button", {
          name: `Agregar nodo después de ${portLabel}`,
        }),
      );
      expect(addNode.onAddAfter).toHaveBeenLastCalledWith({ sourceNodeId: nodeId, sourcePort });
    }
    expect(addNode.onAddAfter).toHaveBeenCalledTimes(4);
    // An output node has no output port.
    expect(
      within(card("output")).queryByRole("button", { name: /Agregar nodo después/ }),
    ).toBeNull();
  });

  it("does not offer + without Agregar nodo, and disables it while positions save", () => {
    const { unmount } = renderCanvas();
    expect(screen.queryByRole("button", { name: /Agregar nodo después/ })).toBeNull();
    unmount();

    renderCanvas({ addNode: addNodeControl(), savingPositions: true });
    const add = screen.getByRole("button", { name: "Agregar nodo después de imagen" });
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens Agregar nodo after the port a connection is dropped on the background from", () => {
    const addNode = addNodeControl();
    renderCanvas({ addNode });

    dragConnection("model", "result", document.querySelector(".react-flow__pane"));

    expect(addNode.onAddAfter).toHaveBeenCalledExactlyOnceWith({
      sourceNodeId: "model",
      sourcePort: "result",
    });
    expect(handlers.onConnect).not.toHaveBeenCalled();
  });

  it("does nothing when the connection is dropped on a card or cancelled", () => {
    const addNode = addNodeControl();
    renderCanvas({ addNode });

    dragConnection("model", "result", card("image"));
    act(() => {
      canvasMouse("mouseDown", port("image", "imagen"), 10, 10);
      canvasMouse("mouseMove", document, 20, 10);
    });
    fireEvent.keyDown(document, { key: "Escape" });
    elementUnderPointer = document.querySelector(".react-flow__pane");
    act(() => canvasMouse("mouseUp", document, 90_000, 90_000));

    expect(addNode.onAddAfter).not.toHaveBeenCalled();
    expect(handlers.onConnect).not.toHaveBeenCalled();
  });

  it("places the new node right of its source, below the nodes already there", () => {
    let placement: WorkflowCanvasPlacement | undefined;
    renderCanvas({
      addNode: addNodeControl({
        open: true,
        panel: (current) => {
          placement = current;
          return null;
        },
      }),
    });

    // Right of the 292 px model card at x 400; the condition takes y 0, so the
    // node goes below it with a 24 px gap.
    expect(placement?.after("model")).toEqual({ x: 740, y: 212 });
    // Nothing is right of the output.
    expect(placement?.after("output")).toEqual({ x: 1480, y: 0 });
  });
});
