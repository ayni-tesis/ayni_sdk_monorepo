import { createEvent, fireEvent } from "@testing-library/react";
import { afterAll, beforeAll, vi } from "vitest";

// jsdom has no layout. React Flow measures its container and nodes with
// offsetWidth/offsetHeight and ResizeObserver, and reads the zoom back with
// DOMMatrixReadOnly, so the canvas gets a 1000 × 600 size and 292 × 188 nodes.
const sizeOf = (element: HTMLElement) =>
  element.classList.contains("react-flow__renderer")
    ? { width: 1000, height: 600 }
    : element.classList.contains("react-flow__node")
      ? { width: 292, height: 188 }
      : { width: 0, height: 0 };

/** Registers the jsdom layout stubs React Flow needs for the current test file. */
export function stubWorkflowCanvasLayout() {
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );

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
}

/** Reads the React Flow viewport back from its CSS transform. */
export function canvasViewport() {
  const transform = (document.querySelector(".react-flow__viewport") as HTMLElement).style
    .transform;
  const [, x, y, zoom] =
    transform.match(/translate\((-?[\d.e-]+)px, ?(-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/) ?? [];
  return { x: Number(x), y: Number(y), zoom: Number(zoom) };
}

/**
 * Fires a mouse event d3-drag accepts. d3-drag reads `event.view`, which jsdom's
 * MouseEvent constructor refuses to take, so it is set on the event afterwards.
 */
export function canvasMouse(
  type: "mouseDown" | "mouseMove" | "mouseUp",
  target: Element | Window | Document,
  clientX: number,
  clientY: number,
) {
  const event = createEvent[type](target, { button: 0, clientX, clientY });
  Object.defineProperty(event, "view", { value: window });
  fireEvent(target, event);
}

/**
 * Drags `target` by (dx, dy) screen pixels. React Flow starts a drag once the
 * pointer passes its 1 px threshold (12, 10) and measures the move from there.
 */
export function dragCanvasElement(target: Element, dx: number, dy: number) {
  canvasMouse("mouseDown", target, 10, 10);
  canvasMouse("mouseMove", window, 12, 10);
  canvasMouse("mouseMove", window, 12 + dx, 10 + dy);
  canvasMouse("mouseUp", window, 12 + dx, 10 + dy);
}

/** After a drag, d3-drag swallows the next click until a zero-delay timeout. */
export const afterCanvasDrag = () => new Promise((resolve) => setTimeout(resolve, 0));
