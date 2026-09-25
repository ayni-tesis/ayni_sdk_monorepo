// Pure view math for the workflow canvas. A viewport has the same shape as the
// React Flow viewport: a board point `p` is drawn at `p * zoom + (x, y)` inside
// the visible area. It is view state only: navigating never changes the draft.

export type WorkflowCanvasViewport = { x: number; y: number; zoom: number };
export type WorkflowCanvasPoint = { x: number; y: number };
export type WorkflowCanvasSize = { width: number; height: number };
export type WorkflowCanvasBox = { x: number; y: number; width: number; height: number };

export const WORKFLOW_CANVAS_MIN_ZOOM = 0.25;
export const WORKFLOW_CANVAS_MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;
const FIT_PADDING = 48;

export function clampWorkflowCanvasZoom(zoom: number): number {
  return Math.min(WORKFLOW_CANVAS_MAX_ZOOM, Math.max(WORKFLOW_CANVAS_MIN_ZOOM, zoom));
}

/** Next 25 % step in `direction`, snapping an in-between zoom to the nearest step. */
export function stepWorkflowCanvasZoom(zoom: number, direction: 1 | -1): number {
  const steps = zoom / ZOOM_STEP;
  const next =
    direction > 0
      ? (Math.floor(steps + 1e-6) + 1) * ZOOM_STEP
      : (Math.ceil(steps - 1e-6) - 1) * ZOOM_STEP;
  return clampWorkflowCanvasZoom(next);
}

export function formatWorkflowCanvasZoom(zoom: number): string {
  return `${Math.round(zoom * 100)} %`;
}

function unionBox(boxes: WorkflowCanvasBox[]): WorkflowCanvasBox {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Fits every box in the visible area within the zoom limits. When the boxes do
 * not fit even at the minimum zoom, it keeps that zoom and centers `focus`.
 */
export function fitWorkflowCanvasViewport(
  boxes: WorkflowCanvasBox[],
  size: WorkflowCanvasSize,
  focus: WorkflowCanvasBox | undefined = boxes[0],
): WorkflowCanvasViewport {
  if (boxes.length === 0) return { x: 0, y: 0, zoom: 1 };
  const bounds = unionBox(boxes);
  const fitZoom = Math.min(
    Math.max(1, size.width - FIT_PADDING * 2) / Math.max(1, bounds.width),
    Math.max(1, size.height - FIT_PADDING * 2) / Math.max(1, bounds.height),
  );
  const zoom = clampWorkflowCanvasZoom(fitZoom);
  const target = fitZoom < WORKFLOW_CANVAS_MIN_ZOOM && focus ? focus : bounds;
  return {
    x: size.width / 2 - (target.x + target.width / 2) * zoom,
    y: size.height / 2 - (target.y + target.height / 2) * zoom,
    zoom,
  };
}

/**
 * Projects the nodes and the visible area into a minimap of `minimapSize`
 * pixels, centered, and converts minimap points back to board points.
 */
export function workflowCanvasMinimap(
  boxes: WorkflowCanvasBox[],
  viewport: WorkflowCanvasViewport,
  size: WorkflowCanvasSize,
  minimapSize: WorkflowCanvasSize,
) {
  const visible = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: size.width / viewport.zoom,
    height: size.height / viewport.zoom,
  };
  const world = unionBox([...boxes, visible]);
  const scale = Math.min(
    minimapSize.width / Math.max(1, world.width),
    minimapSize.height / Math.max(1, world.height),
  );
  const offsetX = (minimapSize.width - world.width * scale) / 2;
  const offsetY = (minimapSize.height - world.height * scale) / 2;
  const project = (box: WorkflowCanvasBox): WorkflowCanvasBox => ({
    x: offsetX + (box.x - world.x) * scale,
    y: offsetY + (box.y - world.y) * scale,
    width: box.width * scale,
    height: box.height * scale,
  });
  return {
    scale,
    boxes: boxes.map(project),
    visible: project(visible),
    toBoard: (point: WorkflowCanvasPoint): WorkflowCanvasPoint => ({
      x: world.x + (point.x - offsetX) / scale,
      y: world.y + (point.y - offsetY) / scale,
    }),
  };
}
