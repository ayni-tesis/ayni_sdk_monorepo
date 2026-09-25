// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WorkflowCanvas, type WorkflowCanvasDraft } from "./workflow-canvas";

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
  onSelectNode: vi.fn(),
  onRequestDeleteNode: vi.fn(),
  onSelectConnection: vi.fn(),
  onConnect: vi.fn(),
  onMoveNode: vi.fn(),
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
      savingPosition={false}
      palette={null}
      selectedNodeId={null}
      {...handlers}
    />,
  );
}

// jsdom has no layout. React Flow measures its container and nodes with
// offsetWidth/offsetHeight and ResizeObserver, and reads the zoom back with
// DOMMatrixReadOnly, so the canvas gets a 1000 × 600 size and 292 × 188 nodes.
const sizeOf = (element: HTMLElement) =>
  element.classList.contains("react-flow__renderer")
    ? { width: 1000, height: 600 }
    : element.classList.contains("react-flow__node")
      ? { width: 292, height: 188 }
      : { width: 0, height: 0 };
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const contentRect = { x: 0, y: 0, ...sizeOf(target as HTMLElement) };
        this.callback(
          [{ target, contentRect } as unknown as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "DOMMatrixReadOnly",
    class {
      m22: number;
      constructor(transform?: string) {
        this.m22 = Number(transform?.match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
      }
    },
  );
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return sizeOf(this).width;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return sizeOf(this).height;
    },
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  if (originalOffsetWidth)
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  if (originalOffsetHeight)
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const zoomLevel = () => screen.getByRole("button", { name: /^Restablecer zoom/ }).textContent;
const control = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const pane = () => document.querySelector(".react-flow__pane") as HTMLElement;
function viewport() {
  const transform = (document.querySelector(".react-flow__viewport") as HTMLElement).style
    .transform;
  const [, x, y, zoom] =
    transform.match(/translate\((-?[\d.e-]+)px, ?(-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/) ?? [];
  return { x: Number(x), y: Number(y), zoom: Number(zoom) };
}

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
    expect(handlers.onMoveNode).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("button", { name: "Restablecer zoom (200 %)" }));
    fireEvent.click(control("Alejar"));
    fireEvent.click(control("Alejar"));
    expect(zoomLevel()).toBe("50 %");
    const handle = screen.getByRole("button", { name: "Mover Condición: a" });

    // d3-drag reads `event.view`, which jsdom's MouseEvent constructor refuses
    // to take, so it is set on each event afterwards.
    const mouse = (
      type: "mouseDown" | "mouseMove" | "mouseUp",
      target: Element | Window,
      clientX: number,
      clientY: number,
    ) => {
      const event = createEvent[type](target, { button: 0, clientX, clientY });
      Object.defineProperty(event, "view", { value: window });
      fireEvent(target, event);
    };
    act(() => {
      mouse("mouseDown", handle, 10, 10);
      mouse("mouseMove", window, 12, 10);
      mouse("mouseMove", window, 72, 50);
      mouse("mouseUp", window, 72, 50);
    });

    // React Flow starts the drag once the pointer passes its 1 px threshold (12, 10);
    // the next 60 × 40 screen pixels at 50 % are 120 × 80 board pixels.
    expect(handlers.onMoveNode).toHaveBeenCalledWith("a", { x: 220, y: 180 });
    // After a drag, d3-drag swallows the next click until a zero-delay timeout.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("moves a node with the keyboard and saves it once when dropped", () => {
    renderCanvas({ nodes: [condition("a")], layout: { a: { x: 100, y: 100 } } }, true);
    const handle = control("Mover Condición: a");

    fireEvent.keyDown(handle, { key: "Enter" });
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(handlers.onMoveNode).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: "Enter" });

    expect(handlers.onMoveNode).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveNode).toHaveBeenCalledWith("a", { x: 132, y: 116 });
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  it("cancels a keyboard move with Escape without saving", () => {
    renderCanvas({ nodes: [condition("a")], layout: { a: { x: 100, y: 100 } } }, true);
    const handle = control("Mover Condición: a");

    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "Escape" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });

    expect(handlers.onMoveNode).not.toHaveBeenCalled();
    expect(handle.getAttribute("aria-pressed")).toBe("false");
  });

  it("lets members without edit permission navigate in read-only mode", () => {
    renderCanvas(wideDraft, false);

    fireEvent.click(control("Acercar"));

    expect(zoomLevel()).toBe("50 %");
    expect(control("Mover Condición: a").disabled).toBe(true);
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

  it("adds a palette node where it is dropped", () => {
    renderCanvas({ nodes: [] }, true);

    const canvas = screen.getByRole("region", { name: "Lienzo del workflow" });
    // jsdom has no DragEvent, so the pointer position is set on a plain event.
    const drop = createEvent.drop(canvas, {
      dataTransfer: {
        getData: (type: string) => (type === "application/x-ayni-workflow-node" ? "output" : ""),
      },
    });
    Object.defineProperties(drop, { clientX: { value: 400 }, clientY: { value: 200 } });
    fireEvent(canvas, drop);

    expect(handlers.onDropPalette).toHaveBeenCalledWith("output", { x: 254, y: 176 });
  });
});
