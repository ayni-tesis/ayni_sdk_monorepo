"use client";

import {
  IconFocus2,
  IconGridDots,
  IconKeyboard,
  IconPlus,
  IconSelectAll,
  IconSitemap,
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

export const WORKFLOW_ARRANGE_SHORTCUT = "Shift+Alt+T";
const WORKFLOW_ADD_NODE_SHORTCUT = "Tab";
const NO_NODES_TO_ARRANGE_MESSAGE = "No hay nodos para ordenar.";

/** Selection, grid and arrangement controls; only administrators who can edit the draft get them. */
export type WorkflowCanvasEditControls = {
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  onSelectAll: () => void;
  /** Without nodes, Ordenar nodos is disabled and says why. */
  hasNodes: boolean;
  onArrangeNodes: () => void;
};

/** The Agregar nodo button; only administrators who can edit the draft get it. */
export type WorkflowCanvasAddNodeControl = { open: boolean; onToggle: () => void };

export function WorkflowCanvasControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  onShowShortcuts,
  savingPositions = false,
  arrangingNodes = false,
  addNode,
  editing,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
  /** Opens the Atajos de teclado panel, like ? on the canvas. */
  onShowShortcuts?: () => void;
  savingPositions?: boolean;
  arrangingNodes?: boolean;
  addNode?: WorkflowCanvasAddNodeControl;
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
        aria-keyshortcuts="+"
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
        aria-keyshortcuts="-"
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
        aria-keyshortcuts="1"
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
        aria-keyshortcuts="0"
        className="min-w-16 whitespace-nowrap tabular-nums"
        onClick={onReset}
      >
        {level}
      </Button>
      {(savingPositions || arrangingNodes) && (
        <span role="status" className="whitespace-nowrap px-2 text-muted-foreground text-xs">
          {arrangingNodes ? "Ordenando nodos…" : "Guardando posiciones…"}
        </span>
      )}
      {addNode && (
        <>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="whitespace-nowrap aria-expanded:bg-muted aria-expanded:text-foreground"
            aria-expanded={addNode.open}
            aria-keyshortcuts={WORKFLOW_ADD_NODE_SHORTCUT}
            title="Agregar nodo (Tab)"
            onClick={addNode.onToggle}
          >
            <IconPlus aria-hidden="true" />
            Agregar nodo
          </Button>
        </>
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
            aria-keyshortcuts="Control+A Meta+A"
            onClick={editing.onSelectAll}
          >
            <IconSelectAll aria-hidden="true" />
            Seleccionar todo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="whitespace-nowrap"
            aria-keyshortcuts={WORKFLOW_ARRANGE_SHORTCUT}
            title={
              editing.hasNodes ? "Ordenar nodos (Shift + Alt + T)" : NO_NODES_TO_ARRANGE_MESSAGE
            }
            disabled={!editing.hasNodes || savingPositions || arrangingNodes}
            onClick={editing.onArrangeNodes}
          >
            <IconSitemap aria-hidden="true" />
            Ordenar nodos
          </Button>
        </>
      )}
      {onShowShortcuts && (
        <>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Atajos de teclado"
            title="Atajos de teclado (?)"
            aria-keyshortcuts="?"
            onClick={onShowShortcuts}
          >
            <IconKeyboard aria-hidden="true" />
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
