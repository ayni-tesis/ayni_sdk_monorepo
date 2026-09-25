import { describe, expect, it } from "vitest";
import {
  clampWorkflowCanvasZoom,
  fitWorkflowCanvasViewport,
  formatWorkflowCanvasZoom,
  stepWorkflowCanvasZoom,
  WORKFLOW_CANVAS_MAX_ZOOM,
  WORKFLOW_CANVAS_MIN_ZOOM,
  workflowCanvasMinimap,
} from "./workflow-canvas-viewport";

const size = { width: 1000, height: 600 };

describe("workflow canvas viewport", () => {
  it("limits the zoom between 25 % and 200 %", () => {
    expect(WORKFLOW_CANVAS_MIN_ZOOM).toBe(0.25);
    expect(WORKFLOW_CANVAS_MAX_ZOOM).toBe(2);
    expect(clampWorkflowCanvasZoom(0.1)).toBe(0.25);
    expect(clampWorkflowCanvasZoom(3)).toBe(2);
    expect(clampWorkflowCanvasZoom(1.3)).toBe(1.3);
  });

  it("steps the zoom by 25 % snapping to the next step and stopping at the limits", () => {
    expect(stepWorkflowCanvasZoom(1, 1)).toBe(1.25);
    expect(stepWorkflowCanvasZoom(1, -1)).toBe(0.75);
    expect(stepWorkflowCanvasZoom(0.63, 1)).toBe(0.75);
    expect(stepWorkflowCanvasZoom(0.63, -1)).toBe(0.5);
    expect(stepWorkflowCanvasZoom(2, 1)).toBe(2);
    expect(stepWorkflowCanvasZoom(0.25, -1)).toBe(0.25);
  });

  it("formats the zoom as a rounded percentage", () => {
    expect(formatWorkflowCanvasZoom(1)).toBe("100 %");
    expect(formatWorkflowCanvasZoom(0.634)).toBe("63 %");
  });

  it("fits every box inside the visible area and centers them", () => {
    const boxes = [
      { x: 0, y: 0, width: 300, height: 200 },
      { x: 1700, y: 900, width: 300, height: 200 },
    ];

    const viewport = fitWorkflowCanvasViewport(boxes, size);

    expect(viewport.zoom).toBeCloseTo((1000 - 96) / 2000);
    for (const box of boxes) {
      expect(viewport.x + box.x * viewport.zoom).toBeGreaterThanOrEqual(0);
      expect(viewport.y + box.y * viewport.zoom).toBeGreaterThanOrEqual(0);
      expect(viewport.x + (box.x + box.width) * viewport.zoom).toBeLessThanOrEqual(size.width);
      expect(viewport.y + (box.y + box.height) * viewport.zoom).toBeLessThanOrEqual(size.height);
    }
    expect(viewport.x + 1000 * viewport.zoom).toBeCloseTo(size.width / 2);
    expect(viewport.y + 550 * viewport.zoom).toBeCloseTo(size.height / 2);
  });

  it("does not fit beyond the maximum zoom", () => {
    expect(fitWorkflowCanvasViewport([{ x: 0, y: 0, width: 100, height: 50 }], size).zoom).toBe(2);
  });

  it("fits up to a lower zoom ceiling when one is given, keeping the boxes centered", () => {
    const viewport = fitWorkflowCanvasViewport(
      [{ x: 0, y: 0, width: 100, height: 50 }],
      size,
      undefined,
      1,
    );

    expect(viewport).toEqual({ x: 450, y: 275, zoom: 1 });
  });

  it("uses the minimum zoom centered on the focus box when the boxes do not fit", () => {
    const boxes = [
      { x: 0, y: 0, width: 300, height: 200 },
      { x: 9000, y: 0, width: 300, height: 200 },
    ];

    const viewport = fitWorkflowCanvasViewport(boxes, size, boxes[1]);

    expect(viewport.zoom).toBe(WORKFLOW_CANVAS_MIN_ZOOM);
    expect(viewport.x + 9150 * viewport.zoom).toBe(size.width / 2);
    expect(viewport.y + 100 * viewport.zoom).toBe(size.height / 2);
  });

  it("maps the nodes and the visible area into the minimap and back", () => {
    const minimap = workflowCanvasMinimap(
      [{ x: 0, y: 0, width: 400, height: 200 }],
      { x: 0, y: 0, zoom: 1 },
      { width: 400, height: 400 },
      { width: 200, height: 100 },
    );

    // The world is the union of the nodes and the visible area (400 × 400).
    expect(minimap.scale).toBeCloseTo(100 / 400);
    expect(minimap.visible.width).toBeCloseTo(100);
    expect(minimap.boxes[0].width).toBeCloseTo(100);
    const board = minimap.toBoard({
      x: minimap.boxes[0].x + minimap.boxes[0].width / 2,
      y: minimap.boxes[0].y + minimap.boxes[0].height / 2,
    });
    expect(board.x).toBeCloseTo(200);
    expect(board.y).toBeCloseTo(100);
  });
});
