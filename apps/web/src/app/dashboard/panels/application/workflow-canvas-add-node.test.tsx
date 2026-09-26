// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkflowCanvas,
  type WorkflowCanvasDraft,
  type WorkflowCanvasPlacement,
} from "./workflow-canvas";
import { stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";

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

const empty: WorkflowCanvasDraft = { nodes: [] };

function canvasElement(props: {
  draft?: WorkflowCanvasDraft;
  addNode?: {
    open: boolean;
    onToggle: () => void;
    panel: (placement: WorkflowCanvasPlacement) => React.ReactNode;
  };
}) {
  return (
    <WorkflowCanvas
      draft={props.draft ?? empty}
      canManage
      selectedConnection={null}
      connectionSource={null}
      cycleNodeIds={[]}
      savingPositions={false}
      arrangingNodes={false}
      addNode={props.addNode}
      selectedNodeIds={[]}
      {...handlers}
    />
  );
}

stubWorkflowCanvasLayout();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const canvas = () => screen.getByRole("region", { name: "Lienzo del workflow" });
const addNodeButton = () => screen.getByRole("button", { name: "Agregar nodo" });

function dropOnCanvas(payload: string) {
  // jsdom has no DragEvent, so the pointer position is set on a plain event.
  const drop = createEvent.drop(canvas(), {
    dataTransfer: {
      getData: (type: string) => (type === "application/x-ayni-workflow-node" ? payload : ""),
    },
  });
  Object.defineProperties(drop, { clientX: { value: 400 }, clientY: { value: 200 } });
  fireEvent(canvas(), drop);
}

describe("Agregar nodo on the canvas", () => {
  it("offers Agregar nodo in the canvas bar only when nodes can be added", () => {
    const onToggle = vi.fn();
    const { unmount } = render(
      canvasElement({ addNode: { open: false, onToggle, panel: () => null } }),
    );

    expect(addNodeButton().getAttribute("aria-keyshortcuts")).toBe("Tab");
    expect(addNodeButton().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(addNodeButton());
    expect(onToggle).toHaveBeenCalledTimes(1);
    unmount();

    render(canvasElement({}));
    expect(screen.queryByRole("button", { name: "Agregar nodo" })).toBeNull();
  });

  it("opens Agregar nodo with Tab while the canvas has the focus", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      canvasElement({ addNode: { open: false, onToggle, panel: () => null } }),
    );

    fireEvent.keyDown(canvas(), { key: "Tab", shiftKey: true });
    expect(onToggle).not.toHaveBeenCalled();
    const tab = createEvent.keyDown(canvas(), { key: "Tab" });
    fireEvent(canvas(), tab);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(tab.defaultPrevented).toBe(true);

    // Once it is open, Tab moves the focus as usual.
    rerender(canvasElement({ addNode: { open: true, onToggle, panel: () => null } }));
    fireEvent.keyDown(canvas(), { key: "Tab" });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows the panel next to the canvas and places new nodes at the center of the visible area", () => {
    let placement: WorkflowCanvasPlacement | undefined;
    render(
      canvasElement({
        addNode: {
          open: true,
          onToggle: vi.fn(),
          panel: (current) => {
            placement = current;
            return <aside aria-label="Agregar nodo" />;
          },
        },
      }),
    );

    expect(screen.getByRole("complementary", { name: "Agregar nodo" })).toBeTruthy();
    expect(addNodeButton().getAttribute("aria-expanded")).toBe("true");
    // A 1000 × 600 view at 100 %: its center is (500, 300), where the 292 × 188 card is centered.
    expect(placement?.visibleCenter()).toEqual({ x: 354, y: 206 });
  });

  it("returns the focus to the canvas when the panel closes", () => {
    const panel = () => <input aria-label="Buscar nodos" />;
    const { rerender } = render(
      canvasElement({ addNode: { open: true, onToggle: vi.fn(), panel } }),
    );
    screen.getByRole("textbox", { name: "Buscar nodos" }).focus();

    rerender(canvasElement({ addNode: { open: false, onToggle: vi.fn(), panel } }));

    expect(document.activeElement).toBe(canvas());
  });

  it("adds a dragged node where it is dropped", () => {
    render(canvasElement({ addNode: { open: true, onToggle: vi.fn(), panel: () => null } }));

    dropOnCanvas(JSON.stringify({ type: "model.tflite", modelVersionId: "leaf-1" }));
    dropOnCanvas(JSON.stringify({ type: "condition" }));
    dropOnCanvas("not json");

    expect(handlers.onDropPalette).toHaveBeenCalledTimes(1);
    expect(handlers.onDropPalette).toHaveBeenCalledWith(
      { type: "model.tflite", modelVersionId: "leaf-1" },
      { x: 254, y: 176 },
    );
  });
});
