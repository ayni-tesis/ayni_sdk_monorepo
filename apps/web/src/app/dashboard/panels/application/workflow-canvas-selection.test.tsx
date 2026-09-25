// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowCanvas, type WorkflowCanvasDraft } from "./workflow-canvas";
import {
  afterCanvasDrag,
  canvasViewport,
  dragCanvasElement,
  stubWorkflowCanvasLayout,
} from "./workflow-canvas-test-utils";

stubWorkflowCanvasLayout();

const condition = (id: string) =>
  ({
    id,
    type: "condition",
    sourceNodeId: "model",
    label: id,
    operator: "gte",
    threshold: 0.5,
    branches: { true: "Verdadero", false: "Falso" },
  }) as const;

// Three grid-aligned nodes in a row; at 100 % they all fit in the 1000 px canvas.
const rowDraft: WorkflowCanvasDraft = {
  nodes: [condition("a"), condition("b"), condition("c")],
  layout: { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, c: { x: 800, y: 0 } },
};

const handlers = {
  onSelectSource: vi.fn(),
  onSelectNodes: vi.fn(),
  onRequestDeleteNode: vi.fn(),
  onSelectConnection: vi.fn(),
  onConnect: vi.fn(),
  onMoveNodes: vi.fn(),
  onDropPalette: vi.fn(),
  onRemoveConnection: vi.fn(),
};

function Canvas({
  draft = rowDraft,
  canManage = true,
  savingPositions = false,
  initialSelection = [],
}: {
  draft?: WorkflowCanvasDraft;
  canManage?: boolean;
  savingPositions?: boolean;
  initialSelection?: string[];
}) {
  const [selectedNodeIds, setSelectedNodeIds] = useState(initialSelection);
  return (
    <WorkflowCanvas
      draft={draft}
      canManage={canManage}
      selectedConnection={null}
      connectionSource={null}
      cycleNodeIds={[]}
      savingPositions={savingPositions}
      palette={null}
      {...handlers}
      selectedNodeIds={selectedNodeIds}
      onSelectNodes={(nodeIds) => {
        handlers.onSelectNodes(nodeIds);
        setSelectedNodeIds(nodeIds);
      }}
    />
  );
}

/** Renders the canvas at 100 %, so screen pixels and board pixels match. */
function renderCanvas(props: Parameters<typeof Canvas>[0] = {}) {
  const result = render(<Canvas {...props} />);
  const reset = screen.getByRole("button", { name: /^Restablecer zoom/ });
  fireEvent.click(reset);
  return result;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const card = (id: string) => screen.getByTestId(`workflow-node-${id}`);
// The type badge is a plain part of the card, neither a port nor a button.
const cardBody = (id: string) => within(card(id)).getByText("condition");
const selectButton = (id: string) =>
  screen.getByRole("button", { name: `Condición: ${id}` }) as HTMLButtonElement;
const isSelected = (id: string) => selectButton(id).getAttribute("aria-pressed") === "true";
const canvas = () => screen.getByRole("region", { name: "Lienzo del workflow" });
const pane = () => document.querySelector(".react-flow__pane") as HTMLElement;

/** Draws a Shift + drag box between two board points (the canvas is at 100 %). */
function boxSelect(fromX: number, fromY: number, toX: number, toY: number) {
  const { x, y } = canvasViewport();
  const pointer = (type: "pointerDown" | "pointerMove" | "pointerUp", bx: number, by: number) =>
    fireEvent[type](pane(), {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: x + bx,
      clientY: y + by,
    });
  fireEvent.keyDown(document, { key: "Shift" });
  pointer("pointerDown", fromX, fromY);
  pointer("pointerMove", (fromX + toX) / 2, (fromY + toY) / 2);
  pointer("pointerMove", toX, toY);
  pointer("pointerUp", toX, toY);
  fireEvent.keyUp(document, { key: "Shift" });
}

describe("moving workflow nodes", () => {
  it("moves every selected node together and saves them in one operation", async () => {
    renderCanvas({ initialSelection: ["a", "b"] });

    act(() => dragCanvasElement(cardBody("a"), 37, 21));

    // The drag snaps to the 16 px grid and keeps the distance between the nodes.
    expect(handlers.onMoveNodes).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveNodes).toHaveBeenCalledWith({
      a: { x: 32, y: 16 },
      b: { x: 432, y: 16 },
    });
    await afterCanvasDrag();
  });

  it("places nodes freely when Alinear a la cuadrícula is off", async () => {
    renderCanvas();
    const snap = screen.getByRole("button", { name: "Alinear a la cuadrícula" });
    expect(snap.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(snap);
    expect(snap.getAttribute("aria-pressed")).toBe("false");
    act(() => dragCanvasElement(cardBody("a"), 37, 21));

    expect(handlers.onMoveNodes).toHaveBeenCalledWith({ a: { x: 37, y: 21 } });
    await afterCanvasDrag();
  });

  it("moves a node left of and above the first node", async () => {
    renderCanvas();

    act(() => dragCanvasElement(cardBody("a"), -100, -60));

    expect(handlers.onMoveNodes).toHaveBeenCalledWith({ a: { x: -96, y: -64 } });
    await afterCanvasDrag();
  });

  it("does not start a move from the card's buttons", async () => {
    renderCanvas();

    act(() => dragCanvasElement(selectButton("a"), 64, 64));

    expect(handlers.onMoveNodes).not.toHaveBeenCalled();
    await afterCanvasDrag();
  });

  it("moves the selection one grid cell per Shift + arrow and saves once the keys are released", () => {
    renderCanvas({ initialSelection: ["a", "b"] });
    const target = selectButton("a");

    fireEvent.keyDown(target, { key: "Shift", shiftKey: true });
    for (let press = 0; press < 3; press += 1) {
      fireEvent.keyDown(target, { key: "ArrowRight", shiftKey: true });
      fireEvent.keyUp(target, { key: "ArrowRight", shiftKey: true });
    }
    fireEvent.keyDown(target, { key: "ArrowDown", shiftKey: true });
    expect(handlers.onMoveNodes).not.toHaveBeenCalled();
    fireEvent.keyUp(target, { key: "Shift" });

    expect(handlers.onMoveNodes).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveNodes).toHaveBeenCalledWith({
      a: { x: 48, y: 16 },
      b: { x: 448, y: 16 },
    });
  });

  it("does not move nodes with the arrow keys alone", () => {
    renderCanvas({ initialSelection: ["a"] });

    fireEvent.keyDown(selectButton("a"), { key: "ArrowRight" });
    fireEvent.keyUp(selectButton("a"), { key: "ArrowRight" });
    fireEvent.keyDown(canvas(), { key: "Shift", shiftKey: true });
    fireEvent.keyUp(canvas(), { key: "Shift" });

    expect(handlers.onMoveNodes).not.toHaveBeenCalled();
  });

  it("shows Guardando posiciones… next to the zoom level while saving", () => {
    renderCanvas({ savingPositions: true });

    const controls = screen.getByRole("group", { name: "Controles del lienzo" });
    expect(within(controls).getByText("Guardando posiciones…")).toBeTruthy();
  });

  it("lets members without edit permission neither drag nor move nodes", async () => {
    renderCanvas({ canManage: false, initialSelection: ["a"] });

    expect(document.querySelector(".react-flow__node.draggable")).toBeNull();
    expect(screen.queryByRole("button", { name: "Seleccionar todo" })).toBeNull();
    act(() => dragCanvasElement(cardBody("a"), 64, 64));
    fireEvent.keyDown(canvas(), { key: "ArrowRight", shiftKey: true });
    fireEvent.keyUp(canvas(), { key: "Shift" });

    expect(handlers.onMoveNodes).not.toHaveBeenCalled();
    await afterCanvasDrag();
  });
});

describe("selecting workflow nodes", () => {
  it("selects every node with Seleccionar todo and clears it with a click on the background", () => {
    renderCanvas();

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todo" }));
    expect(handlers.onSelectNodes).toHaveBeenLastCalledWith(["a", "b", "c"]);
    expect(["a", "b", "c"].every(isSelected)).toBe(true);

    fireEvent.click(pane());
    expect(handlers.onSelectNodes).toHaveBeenLastCalledWith([]);
    expect(["a", "b", "c"].some(isSelected)).toBe(false);
  });

  it("adds and removes nodes with Ctrl + click", () => {
    renderCanvas({ initialSelection: ["a"] });

    fireEvent.click(selectButton("b"), { ctrlKey: true });
    expect(handlers.onSelectNodes).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.click(selectButton("a"), { metaKey: true });
    expect(handlers.onSelectNodes).toHaveBeenLastCalledWith(["b"]);
    fireEvent.click(selectButton("c"));
    expect(handlers.onSelectNodes).toHaveBeenLastCalledWith(["c"]);
  });

  it("adds a node to the selection with Ctrl + click on its card", () => {
    renderCanvas({ initialSelection: ["a"] });

    fireEvent.keyDown(document, { key: "Control" });
    fireEvent.click(cardBody("c"));
    fireEvent.keyUp(document, { key: "Control" });

    expect(isSelected("a")).toBe(true);
    expect(isSelected("c")).toBe(true);
    expect(isSelected("b")).toBe(false);
  });

  it("selects the nodes inside a Shift + drag box on the background", () => {
    renderCanvas();

    // A box around a (0-292) and b (400-692), stopping short of c (800).
    boxSelect(-20, -20, 720, 220);

    expect(handlers.onSelectNodes).toHaveBeenLastCalledWith(["a", "b"]);
    expect(isSelected("a") && isSelected("b")).toBe(true);
    expect(isSelected("c")).toBe(false);
  });

  it("drags a box-selected group and saves it in one operation", async () => {
    renderCanvas();
    boxSelect(-20, -20, 720, 220);

    const selectionRect = document.querySelector(".react-flow__nodesselection-rect");
    expect(selectionRect).toBeTruthy();
    act(() => dragCanvasElement(selectionRect as Element, 37, 21));

    expect(handlers.onMoveNodes).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveNodes).toHaveBeenCalledWith({
      a: { x: 32, y: 16 },
      b: { x: 432, y: 16 },
    });
    await afterCanvasDrag();
  });

  it("keeps placed nodes where they are when Alinear a la cuadrícula is toggled", () => {
    renderCanvas({ draft: { nodes: [condition("a")], layout: { a: { x: 37, y: 21 } } } });
    const snap = screen.getByRole("button", { name: "Alinear a la cuadrícula" });

    fireEvent.click(snap);
    fireEvent.click(snap);

    expect(handlers.onMoveNodes).not.toHaveBeenCalled();
    expect(
      (document.querySelector('.react-flow__node[data-id="a"]') as HTMLElement).style.transform,
    ).toBe("translate(37px,21px)");
  });

  it("saves a Shift + arrow move when the focus leaves the canvas", () => {
    renderCanvas({ initialSelection: ["a"] });

    fireEvent.keyDown(canvas(), { key: "ArrowDown", shiftKey: true });
    fireEvent.blur(canvas(), { relatedTarget: document.body });

    expect(handlers.onMoveNodes).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveNodes).toHaveBeenCalledWith({ a: { x: 0, y: 16 } });
  });

  it("marks selected nodes with a thicker border, not only a color", () => {
    renderCanvas({ initialSelection: ["a"] });

    expect(card("a").className).toContain("border-2");
    expect(card("b").className).not.toContain("border-2");
  });
});
