"use client";

import "@xyflow/react/dist/style.css";

import { IconGripVertical } from "@tabler/icons-react";
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
import { WorkflowCanvasControls, WorkflowCanvasMinimap } from "./workflow-canvas-navigation";
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

type ConnectionSource = { sourceNodeId: string; sourcePort: string } | null;
type CanvasEdge = WorkflowCanvasConnection;
type MeasuredSizes = Record<string, Partial<Dimensions> | undefined>;
type WorkflowFlowNodeData = {
  node: WorkflowCanvasNode;
  canManage: boolean;
  cycle: boolean;
  selected: boolean;
  /** The move handle has picked the node up for keyboard movement. */
  moving: boolean;
  connectionSource: ConnectionSource;
  onSelectSource: (source: Exclude<ConnectionSource, null>) => void;
  onSelectNode: (nodeId: string) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
  onMoveKeyDown: (nodeId: string, event: KeyboardEvent<HTMLButtonElement>) => void;
  onMoveBlur: (nodeId: string) => void;
};
type WorkflowFlowNode = Node<WorkflowFlowNodeData, "workflow">;

const NODE_WIDTH = 292;
const NODE_HEIGHT = 188;
const NODE_GAP_X = 344;
const NODE_GAP_Y = 244;
const KEYBOARD_MOVE_STEP = 16;
// The server accepts node coordinates between 0 and 100 000.
const NODE_EXTENT: [[number, number], [number, number]] = [
  [0, 0],
  [100_000, 100_000],
];
const KEYBOARD_MOVE_DELTAS: Record<string, XYPosition> = {
  ArrowLeft: { x: -KEYBOARD_MOVE_STEP, y: 0 },
  ArrowRight: { x: KEYBOARD_MOVE_STEP, y: 0 },
  ArrowUp: { x: 0, y: -KEYBOARD_MOVE_STEP },
  ArrowDown: { x: 0, y: KEYBOARD_MOVE_STEP },
};

/** Rounds a board position and keeps the whole node inside the server's bounds. */
function savablePosition(position: XYPosition): WorkflowCanvasPosition {
  return {
    x: Math.min(NODE_EXTENT[1][0] - NODE_WIDTH, Math.max(0, Math.round(position.x))),
    y: Math.min(NODE_EXTENT[1][1] - NODE_HEIGHT, Math.max(0, Math.round(position.y))),
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

function WorkflowNodeCard({ data }: NodeProps<WorkflowFlowNode>) {
  const { node, canManage, cycle, connectionSource, selected, moving } = data;
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
      className={`w-[292px] rounded-lg border bg-card p-3 text-card-foreground shadow-sm ${cycle ? "border-destructive ring-2 ring-destructive" : ""}`}
    >
      <header className="mb-3 flex min-h-8 items-center gap-2 border-b pb-2">
        <button
          type="button"
          disabled={!canManage}
          aria-label={`Mover ${nodeTitle}`}
          aria-pressed={moving}
          title={
            canManage ? "Arrastra para mover este nodo, o pulsa Enter y usa las flechas" : undefined
          }
          onKeyDown={(event) => data.onMoveKeyDown(node.id, event)}
          onBlur={() => data.onMoveBlur(node.id)}
          className="workflow-node-drag-handle inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          <IconGripVertical className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`min-w-0 flex-1 truncate text-left font-medium text-sm ${selected ? "text-primary" : ""}`}
          aria-pressed={selected}
          disabled={!canManage}
          onClick={() => data.onSelectNode(node.id)}
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
            className="rounded border px-2 py-1 text-xs aria-pressed:border-primary aria-pressed:bg-primary/10"
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
              className="flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  savingPosition: boolean;
  palette: ReactNode;
  onSelectSource: (source: Exclude<ConnectionSource, null>) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onRequestDeleteNode: (nodeId: string) => void;
  onSelectConnection: (connection: WorkflowCanvasConnection) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
  onMoveNode: (nodeId: string, position: WorkflowCanvasPosition) => void;
  onDropPalette: (nodeType: WorkflowCanvasNodeType, position: WorkflowCanvasPosition) => void;
  onRemoveConnection: (connection: WorkflowCanvasConnection) => void;
};

function WorkflowCanvasFlow({
  draft,
  canManage: canManageDraft,
  selectedConnection,
  connectionSource,
  cycleNodeIds,
  savingPosition,
  palette,
  onSelectSource,
  selectedNodeId,
  onSelectNode,
  onRequestDeleteNode,
  onSelectConnection,
  onConnect,
  onMoveNode,
  onDropPalette,
  onRemoveConnection,
}: WorkflowCanvasProps) {
  const canManage = canManageDraft && !savingPosition;
  const { screenToFlowPosition } = useReactFlow();
  // React Flow reports measured sizes and in-progress drag positions through
  // `onNodesChange`; the saved positions still come only from the draft.
  const [measured, setMeasured] = useState<MeasuredSizes>({});
  const [dragged, setDragged] = useState<Record<string, XYPosition>>({});
  const [keyboardMoveId, setKeyboardMoveId] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const clearDragged = (nodeId: string) => setDragged(({ [nodeId]: _cleared, ...rest }) => rest);

  // Enter or Space picks the node up, the arrows move it one 16 px step, and
  // Enter or Space drops it with a single save; Escape or leaving cancels.
  function moveWithKeyboard(nodeId: string, event: KeyboardEvent<HTMLButtonElement>) {
    const index = draft.nodes.findIndex((node) => node.id === nodeId);
    if (!canManage || index < 0) return;
    const saved = workflowNodePosition(draft, draft.nodes[index], index);
    const current = dragged[nodeId] ?? saved;
    const moving = keyboardMoveId === nodeId;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!moving) {
        setKeyboardMoveId(nodeId);
        return;
      }
      setKeyboardMoveId(null);
      clearDragged(nodeId);
      if (current.x !== saved.x || current.y !== saved.y)
        onMoveNode(nodeId, savablePosition(current));
      return;
    }
    if (!moving) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setKeyboardMoveId(null);
      clearDragged(nodeId);
      return;
    }
    const delta = KEYBOARD_MOVE_DELTAS[event.key];
    if (!delta) return;
    event.preventDefault();
    setDragged((positions) => ({
      ...positions,
      [nodeId]: savablePosition({ x: current.x + delta.x, y: current.y + delta.y }),
    }));
  }

  function cancelKeyboardMove(nodeId: string) {
    if (keyboardMoveId !== nodeId) return;
    setKeyboardMoveId(null);
    clearDragged(nodeId);
  }

  const nodeIds = new Set(draft.nodes.map((node) => node.id));
  const nodes: WorkflowFlowNode[] = draft.nodes.map((node, index) => ({
    id: node.id,
    type: "workflow",
    position: dragged[node.id] ?? workflowNodePosition(draft, node, index),
    measured: measured[node.id],
    initialWidth: NODE_WIDTH,
    initialHeight: NODE_HEIGHT,
    dragHandle: ".workflow-node-drag-handle",
    data: {
      node,
      canManage,
      cycle: cycleNodeIds.includes(node.id),
      selected: selectedNodeId === node.id,
      moving: keyboardMoveId === node.id,
      connectionSource,
      onSelectSource,
      onSelectNode,
      onConnect,
      onMoveKeyDown: moveWithKeyboard,
      onMoveBlur: cancelKeyboardMove,
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
      style: { stroke: "var(--muted-foreground)", strokeWidth: 2, strokeDasharray: "5 5" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
    }));

  // Only sizes and in-progress drags matter here; selection and removal are off.
  function handleNodesChange(changes: NodeChange<WorkflowFlowNode>[]) {
    for (const change of changes) {
      if (change.type === "dimensions" && change.dimensions) {
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
          <section
            data-testid="workflow-canvas"
            aria-label="Lienzo del workflow"
            className={`relative h-[720px] overflow-hidden rounded-lg border bg-background ${dropActive ? "ring-2 ring-primary/60 ring-inset" : ""}`}
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
              const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
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
              onNodeDragStop={(_, node) => {
                clearDragged(node.id);
                onMoveNode(node.id, savablePosition(node.position));
              }}
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
              elementsSelectable={false}
              deleteKeyCode={null}
              selectionKeyCode={null}
              multiSelectionKeyCode={null}
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
              <CanvasNavigation draft={draft} measured={measured} />
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
          {selectedNodeId && canManage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onRequestDeleteNode(selectedNodeId)}
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
}: {
  draft: WorkflowCanvasDraft;
  measured: MeasuredSizes;
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
