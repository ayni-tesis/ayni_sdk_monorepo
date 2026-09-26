// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowCanvas, type WorkflowCanvasDraft } from "./workflow-canvas";
import {
  afterCanvasDrag,
  dragCanvasElement,
  stubWorkflowCanvasLayout,
  canvasViewport as viewport,
} from "./workflow-canvas-test-utils";

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

const wideDraft: WorkflowCanvasDraft = {
  nodes: [condition("a"), condition("b")],
  layout: { a: { x: 0, y: 0 }, b: { x: 1600, y: 700 } },
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

function renderCanvas(draft: WorkflowCanvasDraft = wideDraft, canManage = false) {
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
      {...handlers}
    />,
  );
}

stubWorkflowCanvasLayout();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const zoomLevel = () => screen.getByRole("button", { name: /^Restablecer zoom/ }).textContent;
const control = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const pane = () => document.querySelector(".react-flow__pane") as HTMLElement;

describe("workflow canvas navigation", () => {
  it("offers named navigation controls", () => {
    renderCanvas();

    expect(control("Acercar")).toBeTruthy();
    expect(control("Alejar")).toBeTruthy();
    expect(control("Ajustar a la vista")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Restablecer zoom \(\d+ %\)$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minimapa" })).toBeTruthy();
  });

  it("fits every node when the draft opens and when using Ajustar a la vista", () => {
    renderCanvas();

    // Bounds are 1892 × 888; the width limits the scale to (1000 - 96) / 1892.
    expect(zoomLevel()).toBe("48 %");
    const fitted = viewport();
    expect(fitted.zoom).toBeCloseTo(904 / 1892);
    expect(fitted.x).toBeGreaterThanOrEqual(0);
    expect(fitted.x + (1600 + 292) * fitted.zoom).toBeLessThanOrEqual(1000);

    fireEvent.click(screen.getByRole("button", { name: "Restablecer zoom (48 %)" }));
    expect(zoomLevel()).toBe("100 %");
    fireEvent.click(control("Ajustar a la vista"));

    expect(zoomLevel()).toBe("48 %");
    expect(viewport()).toEqual(fitted);
  });

  it("centers the image input at 25 % when the nodes do not fit", () => {
    renderCanvas({
      nodes: [condition("far"), { id: "image", type: "input.image", outputs: { imagen: "image" } }],
      layout: { far: { x: 0, y: 0 }, image: { x: 20000, y: 400 } },
    });

    expect(zoomLevel()).toBe("25 %");
    const { x, y, zoom } = viewport();
    expect(x + (20000 + 146) * zoom).toBeCloseTo(500);
    expect(y + (400 + 94) * zoom).toBeCloseTo(300);
  });

  it("opens a small draft at 100 % while Ajustar a la vista may zoom up to 200 %", () => {
    renderCanvas({ nodes: [condition("a")], layout: { a: { x: 100, y: 100 } } });

    // A 292 × 188 node would fit at 200 % in 1000 × 600; opening stops at 100 %.
    expect(zoomLevel()).toBe("100 %");
    const { x, y } = viewport();
    expect(x + (100 + 146)).toBeCloseTo(500);
    expect(y + (100 + 94)).toBeCloseTo(300);

    fireEvent.click(control("Ajustar a la vista"));

    expect(zoomLevel()).toBe("200 %");
  });

  it("keeps the maximum zoom and disables Acercar at 200 %", () => {
    renderCanvas();

    for (let step = 0; step < 8; step += 1) fireEvent.click(control("Acercar"));
    expect(zoomLevel()).toBe("200 %");
    expect(control("Acercar").disabled).toBe(true);

    fireEvent.click(control("Acercar"));
    fireEvent.wheel(pane(), { ctrlKey: true, deltaY: -500 });

    expect(zoomLevel()).toBe("200 %");
    expect(viewport().zoom).toBe(2);
  });

  it("keeps the minimum zoom and disables Alejar at 25 %", () => {
    renderCanvas();

    for (let step = 0; step < 3; step += 1) fireEvent.click(control("Alejar"));

    expect(zoomLevel()).toBe("25 %");
    expect(control("Alejar").disabled).toBe(true);
  });

  it("zooms with Ctrl + wheel without changing the draft", () => {
    renderCanvas(wideDraft, true);

    fireEvent.wheel(pane(), { ctrlKey: true, deltaY: -100, clientX: 500, clientY: 300 });

    expect(viewport().zoom).toBeGreaterThan(904 / 1892);
    expect(handlers.onMoveNodes).not.toHaveBeenCalled();
    expect(wideDraft.layout).toEqual({ a: { x: 0, y: 0 }, b: { x: 1600, y: 700 } });
  });

  it("centers the clicked zone of the minimap and pans it with the arrow keys", () => {
    renderCanvas();
    const minimap = screen.getByRole("button", { name: "Minimapa" });
    const fitted = viewport();

    fireEvent.click(minimap, { detail: 1, clientX: 0, clientY: 0 });
    const centered = viewport();
    expect(centered).not.toEqual(fitted);
    expect(centered.zoom).toBe(fitted.zoom);

    fireEvent.keyDown(minimap, { key: "ArrowRight" });
    expect(viewport().x).toBeLessThan(centered.x);
  });

  it("saves a moved node in board coordinates at any zoom", async () => {
    renderCanvas({ nodes: [condition("a")], layout: { a: { x: 100, y: 100 } } }, true);
    fireEvent.click(control("Alejar"));
    fireEvent.click(control("Alejar"));
    expect(zoomLevel()).toBe("50 %");
    // Free placement, so the result shows the plain screen-to-board conversion.
    fireEvent.click(control("Alinear a la cuadrícula"));
    const card = within(screen.getByTestId("workflow-node-a")).getByText("a ≥ 0,5");

    act(() => dragCanvasElement(card, 60, 40));

    // 60 × 40 screen pixels at 50 % are 120 × 80 board pixels.
    expect(handlers.onMoveNodes).toHaveBeenCalledWith({ a: { x: 220, y: 180 } });
    await afterCanvasDrag();
  });

  it("lets members without edit permission navigate in read-only mode", () => {
    renderCanvas(wideDraft, false);

    fireEvent.click(control("Acercar"));

    expect(zoomLevel()).toBe("50 %");
    expect(control("Condición a ≥ 0,5").disabled).toBe(true);
    expect(document.querySelector(".react-flow__node.draggable")).toBeNull();
  });

  it("shows the empty state and the admin-only help", () => {
    const { unmount } = renderCanvas({ nodes: [] }, true);
    expect(screen.getByText("Este borrador aún no tiene nodos.")).toBeTruthy();
    expect(screen.getByText("Agrega un nodo de entrada de imagen para empezar.")).toBeTruthy();
    unmount();

    renderCanvas({ nodes: [] }, false);
    expect(screen.getByText("Este borrador aún no tiene nodos.")).toBeTruthy();
    expect(screen.queryByText("Agrega un nodo de entrada de imagen para empezar.")).toBeNull();
    expect(control("Acercar")).toBeTruthy();
  });
});
