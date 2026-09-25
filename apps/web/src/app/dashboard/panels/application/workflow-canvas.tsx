"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  type Dimensions,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeChange,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
  useViewport,
  type XYPosition,
} from "@xyflow/react";
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  WorkflowCanvasControls,
  type WorkflowCanvasEditControls,
  WorkflowCanvasMinimap,
} from "./workflow-canvas-navigation";
import {
  fitWorkflowCanvasViewport,
  stepWorkflowCanvasZoom,
  WORKFLOW_CANVAS_MAX_ZOOM,
  WORKFLOW_CANVAS_MIN_ZOOM,
  type WorkflowCanvasBox,
  type WorkflowCanvasSize,
  type WorkflowCanvasViewport,
} from "./workflow-canvas-viewport";

export type WorkflowCanvasPosition = { x: number; y: number };
export type WorkflowCanvasConnection = {
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};
export type WorkflowCanvasNode =
  | { id: string; type: "input.image"; outputs: { imagen: "image" } }
  | {
      id: string;
      type: "model.tflite";
      modelVersionId: string;
      modelName: string;
      version: string;
      inputs: {
        image: {
          type: "image";
          width: number;
          height: number;
          channels: number;
          normalization: string;
        };
      };
      outputs: {
        result:
          | { type: "classification"; labels: string[] }
          | { type: "detection"; labels: string[]; scoreThreshold: number };
      };
    }
  | {
      id: string;
      type: "condition";
      sourceNodeId: string;
      label: string;
      operator: "gte" | "gt" | "lte" | "lt";
      threshold: number;
      branches: { true: "Verdadero"; false: "Falso" };
    }
  | {
      id: string;
      type: "output";
      name: string;
      sourceNodeId: string;
      sourcePort: string;
      resultType: "classification" | "detection" | "boolean";
    };
export type WorkflowCanvasDraft = {
  nodes: WorkflowCanvasNode[];
  connections?: WorkflowCanvasConnection[];
  layout?: Record<string, WorkflowCanvasPosition>;
};
export type WorkflowCanvasNodeType = WorkflowCanvasNode["type"];

export type WorkflowCanvasPositions = Record<string, WorkflowCanvasPosition>;

type ConnectionSource = { sourceNodeId: string; sourcePort: string } | null;
type CanvasEdge = WorkflowCanvasConnection;
type MeasuredSizes = Record<string, Partial<Dimensions> | undefined>;
type WorkflowFlowNodeData = {
  node: WorkflowCanvasNode;
  canManage: boolean;
  canSelect: boolean;
  cycle: boolean;
  connectionSource: ConnectionSource;
  onSelectSource: (source: Exclude<ConnectionSource, null>) => void;
  /** Selects only this node, or adds or removes it when `toggle` is set. */
  onSelectNode: (nodeId: string, toggle: boolean) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
};
type WorkflowFlowNode = Node<WorkflowFlowNodeData, "workflow">;

const NODE_WIDTH = 292;
const NODE_HEIGHT = 188;
const NODE_GAP_X = 344;
const NODE_GAP_Y = 244;
const GRID_SIZE = 16;
const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];
// The server accepts node coordinates between -100 000 and 100 000, so a node
// may sit left of or above the first one.
const NODE_EXTENT: [[number, number], [number, number]] = [
  [-100_000, -100_000],
  [100_000, 100_000],
];
// Shift + an arrow moves the selection one grid cell.
const KEYBOARD_MOVE_DELTAS: Record<string, XYPosition> = {
  ArrowLeft: { x: -GRID_SIZE, y: 0 },
  ArrowRight: { x: GRID_SIZE, y: 0 },
  ArrowUp: { x: 0, y: -GRID_SIZE },
  ArrowDown: { x: 0, y: GRID_SIZE },
};

/** Rounds a board position and keeps the whole node inside the server's bounds. */
function savablePosition(position: XYPosition): WorkflowCanvasPosition {
  return {
    x: Math.min(
      NODE_EXTENT[1][0] - NODE_WIDTH,
      Math.max(NODE_EXTENT[0][0], Math.round(position.x)),
    ),
    y: Math.min(
      NODE_EXTENT[1][1] - NODE_HEIGHT,
      Math.max(NODE_EXTENT[0][1], Math.round(position.y)),
    ),
  };
}
const PALETTE_MIME = "application/x-ayni-workflow-node";
const PALETTE_NODE_TYPES: readonly string[] = [
  "input.image",
  "model.tflite",
  "condition",
  "output",
];
export const WORKFLOW_CYCLE_MESSAGE =
  "Esta conexión crearía un ciclo. Los workflows deben ser acíclicos.";

export function defaultWorkflowCanvasPosition(index: number): WorkflowCanvasPosition {
  return { x: 48 + (index % 3) * NODE_GAP_X, y: 48 + Math.floor(index / 3) * NODE_GAP_Y };
}

export function workflowNodePosition(
  draft: WorkflowCanvasDraft,
  node: WorkflowCanvasNode,
  index: number,
): WorkflowCanvasPosition {
  return draft.layout?.[node.id] ?? defaultWorkflowCanvasPosition(index);
}

export function nextWorkflowCanvasPosition(draft: WorkflowCanvasDraft): WorkflowCanvasPosition {
  const existing = draft.nodes.map((node, index) => workflowNodePosition(draft, node, index));
  for (let index = 0; ; index += 1) {
    const candidate = defaultWorkflowCanvasPosition(index);
    if (
      existing.every(
        (position) =>
          position.x + NODE_WIDTH + 24 <= candidate.x ||
          candidate.x + NODE_WIDTH + 24 <= position.x ||
          position.y + NODE_HEIGHT + 24 <= candidate.y ||
          candidate.y + NODE_HEIGHT + 24 <= position.y,
      )
    )
      return candidate;
  }
}

function workflowNodeBoxes(
  draft: WorkflowCanvasDraft,
  measured: MeasuredSizes = {},
): WorkflowCanvasBox[] {
  return draft.nodes.map((node, index) => ({
    ...workflowNodePosition(draft, node, index),
    width: measured[node.id]?.width || NODE_WIDTH,
    height: measured[node.id]?.height || NODE_HEIGHT,
  }));
}

/** Fits every node; if they do not fit at the minimum zoom, centers the image input or the first node. */
export function workflowCanvasFitViewport(
  draft: WorkflowCanvasDraft,
  size: WorkflowCanvasSize,
  measured?: MeasuredSizes,
  maxZoom?: number,
): WorkflowCanvasViewport {
  const boxes = workflowNodeBoxes(draft, measured);
  const imageInputIndex = draft.nodes.findIndex((node) => node.type === "input.image");
  return fitWorkflowCanvasViewport(boxes, size, boxes[Math.max(0, imageInputIndex)], maxZoom);
}

export function workflowCanvasEdges(draft: WorkflowCanvasDraft): CanvasEdge[] {
  return [
    ...(draft.connections ?? []),
    ...draft.nodes.flatMap((node) =>
      node.type === "condition"
        ? [
            {
              sourceNodeId: node.sourceNodeId,
              sourcePort: "result",
              targetNodeId: node.id,
              targetPort: "source",
            },
          ]
        : node.type === "output"
          ? [
              {
                sourceNodeId: node.sourceNodeId,
                sourcePort: node.sourcePort,
                targetNodeId: node.id,
                targetPort: "source",
              },
            ]
          : [],
    ),
  ];
}

export function WorkflowPaletteButton({
  nodeType,
  disabled = false,
  onClick,
  children,
}: {
  nodeType: WorkflowCanvasNodeType;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      draggable={!disabled}
      className="w-full cursor-grab justify-start active:cursor-grabbing"
      onDragStart={(event) => {
        event.dataTransfer.setData(PALETTE_MIME, nodeType);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const nodeTypes = { workflow: WorkflowNodeCard };

// Any part of the card drags the node; its buttons carry `nodrag` and its ports
// start connections instead.
function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const { node, canManage, canSelect, cycle, connectionSource } = data;
  const nodeTitle =
    node.type === "input.image"
      ? "Imagen de entrada"
      : node.type === "model.tflite"
        ? `${node.modelName} · ${node.version}`
        : node.type === "condition"
          ? `Condición: ${node.label}`
          : `Salida: ${node.name}`;
  const connectFromSelection = () => {
    if (node.type === "model.tflite" && connectionSource?.sourcePort === "imagen")
      data.onConnect({ ...connectionSource, targetNodeId: node.id, targetPort: "image" });
  };

  return (
    <article
      data-testid={`workflow-node-${node.id}`}
      // A selected node is told apart by a thicker border as well as its color;
      // a cycle error keeps its red border and ring.
      className={`w-[292px] rounded-lg bg-card p-3 text-card-foreground shadow-sm ${selected ? "border-2" : "border"} ${cycle ? "border-destructive ring-2 ring-destructive" : selected ? "border-cyan-500" : ""}`}
    >
      <header className="mb-3 flex min-h-8 items-center gap-2 border-b pb-2">
        <button
          type="button"
          className={`nodrag min-w-0 flex-1 truncate text-left font-medium text-sm ${selected ? "text-cyan-700 dark:text-cyan-400" : ""}`}
          aria-pressed={selected}
          disabled={!canSelect}
          title={canSelect ? "Ctrl o Cmd + clic agrega o quita el nodo de la selección" : undefined}
          onClick={(event) => {
            // The card would otherwise select the node a second time.
            event.stopPropagation();
            data.onSelectNode(node.id, event.ctrlKey || event.metaKey);
          }}
        >
          {nodeTitle}
        </button>
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs uppercase tracking-wide">
          {node.type.replace(".", " · ")}
        </span>
      </header>

      {/* Each Handle sits inside the relative row of its port, so edges and
          drag-to-connect start and end next to the port they belong to. */}
      {node.type === "input.image" && (
        <div className="relative flex items-center justify-between gap-2">
          <span className="rounded bg-muted px-2 py-1 text-xs">imagen: image</span>
          <button
            type="button"
            disabled={!canManage}
            aria-pressed={
              connectionSource?.sourceNodeId === node.id && connectionSource.sourcePort === "imagen"
            }
            aria-label="Salida imagen"
            title="Selecciónala para conectar, o arrastra desde su punto de salida hasta la entrada de un modelo"
            className="nodrag rounded border px-2 py-1 text-xs aria-pressed:border-primary aria-pressed:bg-primary/10"
            onClick={() => data.onSelectSource({ sourceNodeId: node.id, sourcePort: "imagen" })}
          >
            Salida imagen
          </button>
          <Handle type="source" position={Position.Right} id="imagen" isConnectable={canManage} />
        </div>
      )}

      {node.type === "model.tflite" && (
        <div className="space-y-3">
          <div className="relative">
            <button
              type="button"
              disabled={!canManage}
              aria-label={`Conectar entrada de imagen de ${node.modelName} · ${node.version}`}
              aria-disabled={!canManage || !connectionSource}
              className="nodrag flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={connectFromSelection}
            >
              <span>Entrada de imagen</span>
              <span className="text-muted-foreground">
                {node.inputs.image.width}×{node.inputs.image.height}
              </span>
            </button>
            <Handle type="target" position={Position.Left} id="image" isConnectable={canManage} />
          </div>
          <div className="relative flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">Resultado del modelo</span>
            <span className="rounded bg-muted px-2 py-1 text-xs">{node.outputs.result.type}</span>
            <Handle type="source" position={Position.Right} id="result" isConnectable={false} />
          </div>
        </div>
      )}

      {node.type === "condition" && (
        <div className="space-y-3 text-xs">
          <p className="relative">
            {node.operator} {node.threshold}
            <Handle type="target" position={Position.Left} id="source" isConnectable={false} />
          </p>
          <div className="flex gap-2">
            <span className="relative rounded bg-muted px-2 py-1">
              {node.branches.true}
              <Handle type="source" position={Position.Right} id="true" isConnectable={false} />
            </span>
            <span className="relative rounded bg-muted px-2 py-1">
              {node.branches.false}
              <Handle type="source" position={Position.Right} id="false" isConnectable={false} />
            </span>
          </div>
        </div>
      )}

      {node.type === "output" && (
        <div className="relative flex items-center justify-between gap-2">
          <Handle type="target" position={Position.Left} id="source" isConnectable={false} />
          <span className="text-muted-foreground text-xs">Resultado recibido</span>
          <span className="rounded bg-muted px-2 py-1 text-xs">{node.resultType}</span>
        </div>
      )}
    </article>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasFlow {...props} />
    </ReactFlowProvider>
  );
}

type WorkflowCanvasProps = {
  draft: WorkflowCanvasDraft;
  canManage: boolean;
  selectedConnection: WorkflowCanvasConnection | null;
  connectionSource: ConnectionSource;
  cycleNodeIds: string[];
  savingPositions: boolean;
  palette: ReactNode;
  onSelectSource: (source: Exclude<ConnectionSource, null>) => void;
  /** The selected nodes, in draft order. */
  selectedNodeIds: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onRequestDeleteNode: (nodeId: string) => void;
  onSelectConnection: (connection: WorkflowCanvasConnection) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
  /** Saves every moved node in one operation. */
  onMoveNodes: (positions: WorkflowCanvasPositions) => void;
  onDropPalette: (nodeType: WorkflowCanvasNodeType, position: WorkflowCanvasPosition) => void;
  onRemoveConnection: (connection: WorkflowCanvasConnection) => void;
};

function WorkflowCanvasFlow({
  draft,
  canManage: canManageDraft,
  selectedConnection,
  connectionSource,
  cycleNodeIds,
  savingPositions,
  palette,
  onSelectSource,
  selectedNodeIds,
  onSelectNodes,
  onRequestDeleteNode,
  onSelectConnection,
  onConnect,
  onMoveNodes,
  onDropPalette,
  onRemoveConnection,
}: WorkflowCanvasProps) {
  const canManage = canManageDraft && !savingPositions;
  const { screenToFlowPosition } = useReactFlow();
  // React Flow reports measured sizes and in-progress drag positions through
  // `onNodesChange`; the saved positions still come only from the draft.
  const [measured, setMeasured] = useState<MeasuredSizes>({});
  const [dragged, setDragged] = useState<Record<string, XYPosition>>({});
  // Positions reached with Shift + arrows, saved together once Shift is released.
  const [keyboardMoved, setKeyboardMoved] = useState<Record<string, XYPosition>>({});
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  // React Flow may report several selection changes before the next render.
  const selectionRef = useRef(selectedNodeIds);
  selectionRef.current = selectedNodeIds;

  const clearDragged = (nodeId: string) => setDragged(({ [nodeId]: _cleared, ...rest }) => rest);
  const draftOrder = (nodeIds: Set<string>) =>
    draft.nodes.map((node) => node.id).filter((nodeId) => nodeIds.has(nodeId));

  function savedPosition(nodeId: string) {
    const index = draft.nodes.findIndex((node) => node.id === nodeId);
    return index < 0 ? undefined : workflowNodePosition(draft, draft.nodes[index], index);
  }

  function changeSelection(nodeIds: string[]) {
    const current = selectionRef.current;
    if (nodeIds.length === current.length && nodeIds.every((id, i) => id === current[i])) return;
    selectionRef.current = nodeIds;
    onSelectNodes(nodeIds);
  }

  function selectNode(nodeId: string, toggle: boolean) {
    const selection = new Set(toggle ? selectionRef.current : []);
    if (toggle && selection.has(nodeId)) selection.delete(nodeId);
    else selection.add(nodeId);
    changeSelection(draftOrder(selection));
  }

  /** Saves the nodes whose position changed, all in one operation. */
  function saveMovedNodes(moved: { id: string; position: XYPosition }[]) {
    const positions: WorkflowCanvasPositions = {};
    for (const { id, position } of moved) {
      const saved = savedPosition(id);
      const next = savablePosition(position);
      if (saved && (next.x !== saved.x || next.y !== saved.y)) positions[id] = next;
    }
    if (Object.keys(positions).length > 0) onMoveNodes(positions);
  }

  function moveSelectionWithKeyboard(event: KeyboardEvent<HTMLElement>) {
    const delta = KEYBOARD_MOVE_DELTAS[event.key];
    // The arrows alone are left for moving the focus between nodes.
    if (!delta || !event.shiftKey || event.defaultPrevented || !canManage) return;
    if (selectedNodeIds.length === 0) return;
    event.preventDefault();
    setKeyboardMoved((current) => {
      const next = { ...current };
      for (const nodeId of selectedNodeIds) {
        const from = current[nodeId] ?? savedPosition(nodeId);
        if (from) next[nodeId] = savablePosition({ x: from.x + delta.x, y: from.y + delta.y });
      }
      return next;
    });
  }

  function finishKeyboardMove() {
    const moved = Object.entries(keyboardMoved);
    if (moved.length === 0) return;
    setKeyboardMoved({});
    saveMovedNodes(moved.map(([id, position]) => ({ id, position })));
  }

  const nodeIds = new Set(draft.nodes.map((node) => node.id));
  const nodes: WorkflowFlowNode[] = draft.nodes.map((node, index) => ({
    id: node.id,
    type: "workflow",
    position:
      dragged[node.id] ?? keyboardMoved[node.id] ?? workflowNodePosition(draft, node, index),
    measured: measured[node.id],
    initialWidth: NODE_WIDTH,
    initialHeight: NODE_HEIGHT,
    selected: selectedNodeIds.includes(node.id),
    data: {
      node,
      canManage,
      canSelect: canManageDraft,
      cycle: cycleNodeIds.includes(node.id),
      connectionSource,
      onSelectSource,
      onSelectNode: selectNode,
      onConnect,
    },
  }));
  const edges: Edge[] = workflowCanvasEdges(draft)
    .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
    .map((edge) => ({
      id: `${edge.sourceNodeId}:${edge.sourcePort}:${edge.targetNodeId}:${edge.targetPort}`,
      source: edge.sourceNodeId,
      sourceHandle: edge.sourcePort,
      target: edge.targetNodeId,
      targetHandle: edge.targetPort,
      selectable: false,
      style: { stroke: "var(--muted-foreground)", strokeWidth: 2, strokeDasharray: "5 5" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
    }));

  // Sizes, in-progress drags and selection matter here; removal is off.
  function handleNodesChange(changes: NodeChange<WorkflowFlowNode>[]) {
    const selection = new Set(selectionRef.current);
    let selectionChanged = false;
    for (const change of changes) {
      if (change.type === "select") {
        if (change.selected) selection.add(change.id);
        else selection.delete(change.id);
        selectionChanged = true;
      } else if (change.type === "dimensions" && change.dimensions) {
        const { id, dimensions } = change;
        setMeasured((current) => ({ ...current, [id]: dimensions }));
      } else if (change.type === "position" && change.dragging && change.position) {
        const { id, position } = change;
        setDragged((current) => ({ ...current, [id]: position }));
      } else if (change.type === "position" && change.dragging === false) {
        // A finished or aborted drag; onNodeDragStop saves the finished one.
        clearDragged(change.id);
      }
    }
    if (selectionChanged) changeSelection(draftOrder(selection));
  }

  function saveDraggedNodes(moved: WorkflowFlowNode[]) {
    for (const node of moved) clearDragged(node.id);
    saveMovedNodes(moved);
  }

  function readPaletteNodeType(event: DragEvent<HTMLElement>) {
    const nodeType = event.dataTransfer.getData(PALETTE_MIME);
    return PALETTE_NODE_TYPES.includes(nodeType) ? (nodeType as WorkflowCanvasNodeType) : null;
  }

  return (
    <>
      {cycleNodeIds.length > 0 && (
        <p role="alert" className="mb-3 text-destructive text-sm">
          {WORKFLOW_CYCLE_MESSAGE}
        </p>
      )}
      <div
        className={`grid gap-4 ${palette ? "lg:grid-cols-[17rem_minmax(0,1fr)]" : "grid-cols-1"}`}
        data-testid="workflow-draft-editor"
      >
        {palette}
        <div className="min-w-0 space-y-2">
          {/* Focusable so that Shift + arrows reach it after a click on a node. */}
          <section
            data-testid="workflow-canvas"
            aria-label="Lienzo del workflow"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas takes keyboard shortcuts.
            tabIndex={0}
            className={`relative h-[720px] overflow-hidden rounded-lg border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dropActive ? "ring-2 ring-primary/60 ring-inset" : ""}`}
            onKeyDown={moveSelectionWithKeyboard}
            onKeyUp={(event) => {
              if (event.key === "Shift") finishKeyboardMove();
            }}
            onBlur={(event) => {
              // Leaving the canvas releases the keys too.
              if (!event.currentTarget.contains(event.relatedTarget as Element | null))
                finishKeyboardMove();
            }}
            onDragOver={(event) => {
              if (!canManage || !event.dataTransfer.types.includes(PALETTE_MIME)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDropActive(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Element | null))
                setDropActive(false);
            }}
            onDrop={(event) => {
              setDropActive(false);
              const nodeType = readPaletteNodeType(event);
              if (!canManage || !nodeType) return;
              event.preventDefault();
              // The grid aligns moved nodes; a dropped node keeps its place under the pointer.
              const position = screenToFlowPosition(
                { x: event.clientX, y: event.clientY },
                { snapToGrid: false },
              );
              onDropPalette(
                nodeType,
                savablePosition({ x: position.x - NODE_WIDTH / 2, y: position.y - 24 }),
              );
            }}
          >
            <ReactFlow<WorkflowFlowNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              // Also called, with every dragged node, when the selection box is dragged.
              onNodeDragStop={(_, _node, moved) => saveDraggedNodes(moved)}
              onConnect={(connection) =>
                onConnect({
                  sourceNodeId: connection.source,
                  sourcePort: connection.sourceHandle ?? "",
                  targetNodeId: connection.target,
                  targetPort: connection.targetHandle ?? "",
                })
              }
              nodeExtent={NODE_EXTENT}
              minZoom={WORKFLOW_CANVAS_MIN_ZOOM}
              maxZoom={WORKFLOW_CANVAS_MAX_ZOOM}
              nodesDraggable={canManage}
              nodesConnectable={canManage}
              nodesFocusable={false}
              edgesFocusable={false}
              // Shift + drag on the background draws a selection box; Ctrl or Cmd +
              // click adds or removes a node; a click on the background clears it.
              elementsSelectable={canManageDraft}
              selectionKeyCode="Shift"
              multiSelectionKeyCode={["Control", "Meta"]}
              // The canvas moves the selection with Shift + arrows itself, so React
              // Flow's own arrow-key moves stay off.
              disableKeyboardA11y
              snapToGrid={snapToGrid}
              snapGrid={SNAP_GRID}
              deleteKeyCode={null}
              // Middle button, or Space (panActivationKeyCode) + drag, pans; Ctrl + wheel
              // and trackpad pinch zoom; a plain wheel keeps scrolling the page.
              panOnDrag={[1]}
              zoomOnScroll={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              attributionPosition="top-right"
              ariaLabelConfig={{ "handle.ariaLabel": "Puerto de conexión" }}
              style={{ "--xy-background-color": "var(--background)" } as CSSProperties}
            >
              <Background
                gap={22}
                color="color-mix(in srgb, var(--muted-foreground) 28%, transparent)"
              />
              <CanvasNavigation
                draft={draft}
                measured={measured}
                savingPositions={savingPositions}
                editing={
                  canManageDraft
                    ? {
                        snapToGrid,
                        onToggleSnapToGrid: () => setSnapToGrid((current) => !current),
                        onSelectAll: () => changeSelection(draft.nodes.map((node) => node.id)),
                      }
                    : undefined
                }
              />
            </ReactFlow>

            {draft.nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="w-80 text-center">
                  <p className="font-medium text-sm">Este borrador aún no tiene nodos.</p>
                  {canManage && (
                    <p className="mt-1 text-muted-foreground text-xs">
                      Agrega un nodo de entrada de imagen para empezar.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
          {draft.connections?.length ? (
            <section className="flex flex-wrap gap-2" aria-label="Conexiones del workflow">
              {draft.connections.map((edge) => {
                const selected = selectedConnection === edge;
                return (
                  <Button
                    key={`${edge.sourceNodeId}:${edge.sourcePort}:${edge.targetNodeId}:${edge.targetPort}`}
                    type="button"
                    size="sm"
                    variant={selected ? "secondary" : "outline"}
                    aria-pressed={selected}
                    onClick={() => onSelectConnection(edge)}
                  >
                    {edge.sourcePort} → {edge.targetPort}
                  </Button>
                );
              })}
            </section>
          ) : null}
          {selectedConnection && canManage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRemoveConnection(selectedConnection)}
            >
              Eliminar conexión
            </Button>
          )}
          {/* Deleting one node needs exactly one selected node. */}
          {selectedNodeIds.length === 1 && canManage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRequestDeleteNode(selectedNodeIds[0])}
            >
              Eliminar nodo
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function CanvasNavigation({
  draft,
  measured,
  savingPositions,
  editing,
}: {
  draft: WorkflowCanvasDraft;
  measured: MeasuredSizes;
  savingPositions: boolean;
  editing?: WorkflowCanvasEditControls;
}) {
  const { setViewport, zoomTo, setCenter } = useReactFlow();
  const viewport = useViewport();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const nodesInitialized = useNodesInitialized();
  const fittedRef = useRef(false);
  const size = { width, height };

  // When the draft opens, the view fits every node once they have been measured,
  // without enlarging a small draft past 100 % (Ajustar a la vista may reach 200 %).
  useEffect(() => {
    if (fittedRef.current || !width || !height) return;
    if (draft.nodes.length > 0 && !nodesInitialized) return;
    fittedRef.current = true;
    if (draft.nodes.length > 0)
      void setViewport(workflowCanvasFitViewport(draft, { width, height }, measured, 1));
  }, [draft, measured, nodesInitialized, width, height, setViewport]);

  return (
    <>
      <Panel position="bottom-left" className="!m-3">
        <WorkflowCanvasControls
          zoom={viewport.zoom}
          onZoomIn={() => void zoomTo(stepWorkflowCanvasZoom(viewport.zoom, 1))}
          onZoomOut={() => void zoomTo(stepWorkflowCanvasZoom(viewport.zoom, -1))}
          onFit={() => void setViewport(workflowCanvasFitViewport(draft, size, measured))}
          onReset={() => void zoomTo(1)}
          savingPositions={savingPositions}
          editing={editing}
        />
      </Panel>
      {draft.nodes.length > 0 && (
        <Panel position="bottom-right" className="!m-3">
          <WorkflowCanvasMinimap
            nodeIds={draft.nodes.map((node) => node.id)}
            boxes={workflowNodeBoxes(draft, measured)}
            viewport={viewport}
            size={size}
            onCenter={(point) => void setCenter(point.x, point.y, { zoom: viewport.zoom })}
            onPan={(dx, dy) =>
              void setViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy })
            }
          />
        </Panel>
      )}
    </>
  );
}
