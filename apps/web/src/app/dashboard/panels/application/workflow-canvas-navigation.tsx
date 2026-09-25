"use client";

import {
  IconFocus2,
  IconGridDots,
  IconSelectAll,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import type { KeyboardEvent, MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  formatWorkflowCanvasZoom,
  WORKFLOW_CANVAS_MAX_ZOOM,
  WORKFLOW_CANVAS_MIN_ZOOM,
  type WorkflowCanvasBox,
  type WorkflowCanvasPoint,
  type WorkflowCanvasSize,
  type WorkflowCanvasViewport,
  workflowCanvasMinimap,
} from "./workflow-canvas-viewport";

const MINIMAP_SIZE = { width: 192, height: 128 };
const MINIMAP_KEY_STEP = 0.1;

/** Selection and grid controls; only administrators who can edit the draft get them. */
export type WorkflowCanvasEditControls = {
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  onSelectAll: () => void;
};

export function WorkflowCanvasControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  savingPositions = false,
  editing,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
  savingPositions?: boolean;
  editing?: WorkflowCanvasEditControls;
}) {
  const level = formatWorkflowCanvasZoom(zoom);
  return (
    <fieldset
      aria-label="Controles del lienzo"
      className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm"
    >
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Acercar"
        title="Acercar"
        disabled={zoom >= WORKFLOW_CANVAS_MAX_ZOOM}
        onClick={onZoomIn}
      >
        <IconZoomIn aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Alejar"
        title="Alejar"
        disabled={zoom <= WORKFLOW_CANVAS_MIN_ZOOM}
        onClick={onZoomOut}
      >
        <IconZoomOut aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Ajustar a la vista"
        title="Ajustar a la vista"
        onClick={onFit}
      >
        <IconFocus2 aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Restablecer zoom (${level})`}
        title="Restablecer zoom"
        className="min-w-16 whitespace-nowrap tabular-nums"
        onClick={onReset}
      >
        {level}
      </Button>
      {savingPositions && (
        <span role="status" className="whitespace-nowrap px-2 text-muted-foreground text-xs">
          Guardando posiciones…
        </span>
      )}
      {editing && (
        <>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Alinear a la cuadrícula"
            title="Alinear a la cuadrícula"
            aria-pressed={editing.snapToGrid}
            className="aria-pressed:bg-muted aria-pressed:text-foreground"
            onClick={editing.onToggleSnapToGrid}
          >
            <IconGridDots aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="whitespace-nowrap"
            onClick={editing.onSelectAll}
          >
            <IconSelectAll aria-hidden="true" />
            Seleccionar todo
          </Button>
        </>
      )}
    </fieldset>
  );
}

export function WorkflowCanvasMinimap({
  nodeIds,
  boxes,
  viewport,
  size,
  onCenter,
  onPan,
}: {
  /** One id per box, in the same order. */
  nodeIds: string[];
  boxes: WorkflowCanvasBox[];
  viewport: WorkflowCanvasViewport;
  size: WorkflowCanvasSize;
  onCenter: (point: WorkflowCanvasPoint) => void;
  onPan: (dx: number, dy: number) => void;
}) {
  const minimap = workflowCanvasMinimap(boxes, viewport, size, MINIMAP_SIZE);

  function centerClickedZone(event: MouseEvent<HTMLButtonElement>) {
    // Keyboard activation has no pointer position; the arrow keys pan instead.
    if (event.detail === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onCenter(minimap.toBoard({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }));
  }

  function panWithArrows(event: KeyboardEvent<HTMLButtonElement>) {
    const dx = size.width * MINIMAP_KEY_STEP;
    const dy = size.height * MINIMAP_KEY_STEP;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [dx, 0],
      ArrowRight: [-dx, 0],
      ArrowUp: [0, dy],
      ArrowDown: [0, -dy],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    onPan(move[0], move[1]);
  }

  return (
    <button
      type="button"
      aria-label="Minimapa"
      aria-describedby="workflow-minimap-hint"
      title="Haz clic para centrar esa zona o usa las flechas para desplazar la vista"
      className="block cursor-pointer overflow-hidden rounded-lg border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={MINIMAP_SIZE}
      onClick={centerClickedZone}
      onKeyDown={panWithArrows}
    >
      <span id="workflow-minimap-hint" className="sr-only">
        Haz clic para centrar esa zona o usa las flechas para desplazar la vista.
      </span>
      <svg aria-hidden="true" width={MINIMAP_SIZE.width} height={MINIMAP_SIZE.height}>
        {minimap.boxes.map((box, index) => (
          <rect
            key={nodeIds[index]}
            x={box.x}
            y={box.y}
            width={Math.max(2, box.width)}
            height={Math.max(2, box.height)}
            rx={1}
            fill="var(--muted-foreground)"
            fillOpacity={0.45}
          />
        ))}
        <rect
          data-testid="workflow-minimap-visible-area"
          x={minimap.visible.x}
          y={minimap.visible.y}
          width={minimap.visible.width}
          height={minimap.visible.height}
          fill="var(--primary)"
          fillOpacity={0.08}
          stroke="var(--primary)"
          strokeWidth={1.5}
        />
      </svg>
    </button>
  );
}
