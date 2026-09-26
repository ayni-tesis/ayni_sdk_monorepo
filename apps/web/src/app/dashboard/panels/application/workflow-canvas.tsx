"use client";

import "@xyflow/react/dist/style.css";

import {
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconCpu,
  IconFlag,
  IconGitBranch,
  IconPhoto,
} from "@tabler/icons-react";
import {
  Background,
  BaseEdge,
  type Connection,
  type Dimensions,
  type Edge,
  type EdgeChange,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Handle,
  MarkerType,
  type Node,
  type NodeChange,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useConnection,
  useNodesInitialized,
  useReactFlow,
  useStore,
  useStoreApi,
  useViewport,
  type XYPosition,
} from "@xyflow/react";
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { arrangeWorkflowNodes } from "./workflow-canvas-layout";
import {
  WorkflowCanvasControls,
  type WorkflowCanvasEditControls,
  WorkflowCanvasMinimap,
} from "./workflow-canvas-navigation";
import { workflowNodePorts, workflowPortCompatibility } from "./workflow-canvas-ports";
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
  draft: WorkflowCanvasDraft;
  canManage: boolean;
  canSelect: boolean;
  cycle: boolean;
  /** The messages of the node's errors in the last validation of this draft. */
  errors: string[];
  /** The output picked with its Salida button. */
  connectionSource: ConnectionSource;
  /** The output a connection is being dragged from, or else the picked one. */
  pendingSource: ConnectionSource;
  onSelectSource: (source: Exclude<ConnectionSource, null>) => void;
  /** Selects only this node, or adds or removes it when `toggle` is set. */
  onSelectNode: (nodeId: string, toggle: boolean) => void;
  onOpenDetails: (nodeId: string) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
};
type WorkflowFlowNode = Node<WorkflowFlowNodeData, "workflow">;
type WorkflowFlowEdgeData = {
  connection: WorkflowCanvasConnection;
  /** The source of a condition or an output: it can be reassigned, not removed. */
  required: boolean;
  /** Offers Eliminar conexión once the edge is selected. */
  canManage: boolean;
  /** False while positions save. */
  canRemove: boolean;
  hovered: boolean;
  onRemove: (connection: WorkflowCanvasConnection) => void;
};
type WorkflowFlowEdge = Edge<WorkflowFlowEdgeData, "workflow">;

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
export const WORKFLOW_REQUIRED_CONNECTION_MESSAGE =
  "Esta conexión es obligatoria. Reasígnala arrastrándola a otro nodo.";
const EDGE_COLOR = "var(--muted-foreground)";
const SELECTED_EDGE_COLOR = "var(--color-cyan-500, #06b6d4)";

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

/** The card's size on screen, or its initial size until React Flow measures it. */
function workflowNodeSize(nodeId: string, measured: MeasuredSizes): WorkflowCanvasSize {
  return {
    width: measured[nodeId]?.width || NODE_WIDTH,
    height: measured[nodeId]?.height || NODE_HEIGHT,
  };
}

function workflowNodeBoxes(
  draft: WorkflowCanvasDraft,
  measured: MeasuredSizes = {},
): WorkflowCanvasBox[] {
  return draft.nodes.map((node, index) => ({
    ...workflowNodePosition(draft, node, index),
    ...workflowNodeSize(node.id, measured),
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

function toCanvasConnection(
  connection: Pick<Connection, "source" | "target"> & {
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
): WorkflowCanvasConnection {
  return {
    sourceNodeId: connection.source,
    sourcePort: connection.sourceHandle ?? "",
    targetNodeId: connection.target,
    targetPort: connection.targetHandle ?? "",
  };
}

export function workflowNodeTitle(node: WorkflowCanvasNode): string {
  return node.type === "input.image"
    ? "Imagen de entrada"
    : node.type === "model.tflite"
      ? `${node.modelName} · ${node.version}`
      : node.type === "condition"
        ? `Condición: ${node.label}`
        : `Salida: ${node.name}`;
}

// Each type has its own icon as well as its name, so it is never told apart by color alone.
const WORKFLOW_NODE_TYPES: Record<
  WorkflowCanvasNodeType,
  { label: string; Icon: typeof IconPhoto }
> = {
  "input.image": { label: "Imagen de entrada", Icon: IconPhoto },
  "model.tflite": { label: "Modelo", Icon: IconCpu },
  condition: { label: "Condición", Icon: IconGitBranch },
  output: { label: "Salida", Icon: IconFlag },
};
export const CONDITION_OPERATOR_SYMBOLS = { gte: "≥", gt: ">", lte: "≤", lt: "<" } as const;
export const WORKFLOW_RESULT_TYPE_LABELS = {
  classification: "Clasificación",
  detection: "Detección",
  boolean: "Booleano",
} as const;
// Every decimal of the threshold, with a decimal comma: 0.8 reads 0,8.
const thresholdFormat = new Intl.NumberFormat("es", { maximumFractionDigits: 20 });

/** The condition's rule as it reads on its card, for example `perro ≥ 0,8`. */
export function workflowConditionRule(
  node: Extract<WorkflowCanvasNode, { type: "condition" }>,
): string {
  return `${node.label} ${CONDITION_OPERATOR_SYMBOLS[node.operator]} ${thresholdFormat.format(node.threshold)}`;
}

const connectionKey = (edge: WorkflowCanvasConnection) =>
  `${edge.sourceNodeId}:${edge.sourcePort}:${edge.targetNodeId}:${edge.targetPort}`;

export function sameWorkflowConnection(
  a: WorkflowCanvasConnection,
  b: WorkflowCanvasConnection,
): boolean {
  return connectionKey(a) === connectionKey(b);
}

/** Only connections between ports can be removed; condition and output sources cannot. */
function removableConnection(draft: WorkflowCanvasDraft, connection: WorkflowCanvasConnection) {
  return (draft.connections ?? []).some((edge) => sameWorkflowConnection(edge, connection));
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
const edgeTypes = { workflow: WorkflowEdge };

/** How a port answers the connection in progress; the port it starts from has none. */
function portState(
  data: WorkflowFlowNodeData,
  portId: string,
  direction: "input" | "output",
): "compatible" | "incompatible" | undefined {
  const { draft, node, pendingSource } = data;
  if (!pendingSource) return undefined;
  if (direction === "output")
    return pendingSource.sourceNodeId === node.id && pendingSource.sourcePort === portId
      ? undefined
      : "incompatible";
  return workflowPortCompatibility(draft, {
    ...pendingSource,
    targetNodeId: node.id,
    targetPort: portId,
  }) === "compatible"
    ? "compatible"
    : "incompatible";
}

// Compatibility shows as a cyan ring or dimming, and always as a text label too.
function PortRow({
  portId,
  state,
  align,
  children,
}: {
  portId: string;
  state: "compatible" | "incompatible" | undefined;
  align: "start" | "end";
  children: ReactNode;
}) {
  return (
    <div
      data-port={portId}
      data-port-state={state}
      className={`relative flex items-center gap-2 rounded ${align === "end" ? "flex-row-reverse" : ""} ${state === "compatible" ? "ring-2 ring-cyan-500" : state === "incompatible" ? "opacity-50" : ""}`}
    >
      {children}
      {state && (
        <span
          className={`flex shrink-0 items-center gap-1 text-xs ${state === "compatible" ? "text-cyan-700 dark:text-cyan-400" : "text-muted-foreground"}`}
        >
          {state === "compatible" ? (
            <IconCheck aria-hidden className="size-3" />
          ) : (
            <IconBan aria-hidden className="size-3" />
          )}
          {state === "compatible" ? "Compatible" : "No compatible"}
        </span>
      )}
    </div>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

// The validation errors of one node: an alert icon and their number, whose
// messages show while the pointer rests on it or it has the focus.
function NodeErrorIndicator({ messages }: { messages: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={`${messages.length} ${messages.length === 1 ? "error" : "errores"} de validación`}
        className="nodrag flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-destructive text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconAlertTriangle aria-hidden className="size-4" />
        {messages.length}
      </TooltipTrigger>
      <TooltipContent side="top">
        <ul className="space-y-1">
          {messages.map((message, index) => (
            // One node may repeat a message for two of its ports.
            // biome-ignore lint/suspicious/noArrayIndexKey: messages are not unique and never reorder.
            <li key={index}>{message}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

// Any part of the card drags the node; its buttons carry `nodrag` and its ports
// start connections instead.
function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const { node, canManage, canSelect, cycle, errors, connectionSource } = data;
  const nodeTitle = workflowNodeTitle(node);
  const ports = workflowNodePorts(node);
  const { label: typeLabel, Icon: TypeIcon } = WORKFLOW_NODE_TYPES[node.type];
  const typeId = useId();
  const summaryId = useId();
  // Names use the normal font; versions use the monospaced one.
  const summary =
    node.type === "model.tflite" ? (
      <p id={summaryId} className="truncate">
        <span>{node.modelName}</span> · <span className="font-mono">{node.version}</span>
      </p>
    ) : node.type === "condition" ? (
      <p id={summaryId} className="truncate">
        {workflowConditionRule(node)}
      </p>
    ) : node.type === "output" ? (
      <>
        <p id={summaryId} className="truncate">
          {node.name}
        </p>
        <p className="text-muted-foreground text-xs">
          Tipo de resultado: {WORKFLOW_RESULT_TYPE_LABELS[node.resultType]}
        </p>
      </>
    ) : null;

  return (
    <article
      data-testid={`workflow-node-${node.id}`}
      // A selected node is told apart by a thicker border as well as its color;
      // a cycle error keeps its red border and ring, and a validation error its red border.
      className={`w-[292px] rounded-lg bg-card p-3 text-card-foreground shadow-sm ${selected ? "border-2" : "border"} ${cycle ? "border-destructive ring-2 ring-destructive" : errors.length > 0 ? "border-destructive" : selected ? "border-cyan-500" : ""}`}
    >
      <header className="mb-2 flex min-h-8 items-center gap-2 border-b pb-2">
        {/* Named after the type and the summary, which tell the node apart. */}
        <button
          type="button"
          className={`nodrag flex min-w-0 flex-1 items-center gap-2 text-left font-medium text-sm ${selected ? "text-cyan-700 dark:text-cyan-400" : ""}`}
          aria-labelledby={summary ? `${typeId} ${summaryId}` : typeId}
          aria-pressed={selected}
          disabled={!canSelect}
          title={canSelect ? "Ctrl o Cmd + clic agrega o quita el nodo de la selección" : undefined}
          onClick={(event) => {
            // The card would otherwise select the node a second time.
            event.stopPropagation();
            data.onSelectNode(node.id, event.ctrlKey || event.metaKey);
          }}
          onKeyDown={(event) => {
            // Enter selects the node first, like a click; once it is selected,
            // Enter opens its details.
            if (event.key !== "Enter" || !selected) return;
            event.preventDefault();
            event.stopPropagation();
            data.onOpenDetails(node.id);
          }}
        >
          <TypeIcon aria-hidden className="size-4 shrink-0" />
          <span id={typeId} className="truncate">
            {typeLabel}
          </span>
        </button>
        {errors.length > 0 && <NodeErrorIndicator messages={errors} />}
      </header>

      {summary && <div className="mb-3 space-y-0.5 text-sm">{summary}</div>}

      {/* Each Handle sits inside the relative row of its port, so edges and
          drag-to-connect start and end next to the port they belong to. Only
          outputs start a connection and only inputs end one. Each port also has
          a button for connecting without dragging: Salida picks the output,
          then Conectar picks the input. */}
      <div className="space-y-2 text-xs">
        {ports.inputs.map((port) => (
          <PortRow
            key={port.id}
            portId={port.id}
            state={portState(data, port.id, "input")}
            align="start"
          >
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              isConnectable={canManage}
              isConnectableStart={false}
              isConnectableEnd={canManage}
            />
            <button
              type="button"
              disabled={!canManage}
              aria-label={`Conectar ${lowerFirst(port.label)} de ${nodeTitle}`}
              aria-disabled={!canManage || !connectionSource}
              className="nodrag flex min-w-0 flex-1 items-center justify-between gap-2 rounded border px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                if (connectionSource)
                  data.onConnect({
                    ...connectionSource,
                    targetNodeId: node.id,
                    targetPort: port.id,
                  });
              }}
            >
              <span>{port.label}</span>
            </button>
          </PortRow>
        ))}
        {ports.outputs.map((port) => (
          <PortRow
            key={port.id}
            portId={port.id}
            state={portState(data, port.id, "output")}
            align="end"
          >
            <button
              type="button"
              disabled={!canManage}
              aria-pressed={
                connectionSource?.sourceNodeId === node.id &&
                connectionSource.sourcePort === port.id
              }
              aria-label={`Salida ${port.label}`}
              title="Selecciónala y luego elige una entrada, o arrastra desde su punto hasta una entrada compatible"
              className="nodrag rounded border px-2 py-1 aria-pressed:border-primary aria-pressed:bg-primary/10"
              onClick={() => data.onSelectSource({ sourceNodeId: node.id, sourcePort: port.id })}
            >
              {port.label}
            </button>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              isConnectable={canManage}
              isConnectableStart={canManage}
              isConnectableEnd={false}
            />
          </PortRow>
        ))}
      </div>
    </article>
  );
}

// An edge thickens under the pointer; once selected it turns cyan and thicker,
// solid instead of dashed, and shows Eliminar conexión at its midpoint.
function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<WorkflowFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const helpId = `workflow-edge-help-${id}`;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? SELECTED_EDGE_COLOR : EDGE_COLOR,
          strokeWidth: selected ? 4 : data?.hovered ? 3 : 2,
          strokeDasharray: selected ? undefined : "5 5",
        }}
      />
      {selected && data?.canManage && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute flex max-w-56 flex-col items-center gap-1 text-center"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-background"
              disabled={data.required || !data.canRemove}
              aria-describedby={data.required ? helpId : undefined}
              onClick={() => data.onRemove(data.connection)}
            >
              Eliminar conexión
            </Button>
            {data.required && (
              <p
                id={helpId}
                className="rounded bg-background/90 px-2 py-1 text-muted-foreground text-xs"
              >
                {WORKFLOW_REQUIRED_CONNECTION_MESSAGE}
              </p>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <TooltipProvider>
        <WorkflowCanvasFlow {...props} />
      </TooltipProvider>
    </ReactFlowProvider>
  );
}

type WorkflowCanvasProps = {
  draft: WorkflowCanvasDraft;
  canManage: boolean;
  selectedConnection: WorkflowCanvasConnection | null;
  connectionSource: ConnectionSource;
  cycleNodeIds: string[];
  /** The messages of each node's errors in the last validation of this draft, by node id. */
  nodeErrors?: Record<string, string[]>;
  savingPositions: boolean;
  /** True while Ordenar nodos saves the new positions. */
  arrangingNodes: boolean;
  palette: ReactNode;
  /** The Detalles del nodo panel, shown right of the canvas. */
  details?: ReactNode;
  /** Opens Detalles del nodo, on a double click or Enter with one node selected. */
  onOpenNodeDetails?: (nodeId: string) => void;
  /** Picks the output to connect from; `null` when Escape cancels it. */
  onSelectSource: (source: ConnectionSource) => void;
  /** The selected nodes, in draft order. */
  selectedNodeIds: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onRequestDeleteNode: (nodeId: string) => void;
  /** Selects the clicked edge; `null` when a click elsewhere clears it. */
  onSelectConnection: (connection: WorkflowCanvasConnection | null) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
  /** Saves every moved node in one operation. */
  onMoveNodes: (positions: WorkflowCanvasPositions) => void;
  /** Saves the arranged position of every node in one operation; resolves whether it was saved. */
  onArrangeNodes: (positions: WorkflowCanvasPositions) => Promise<boolean>;
  onDropPalette: (nodeType: WorkflowCanvasNodeType, position: WorkflowCanvasPosition) => void;
  onRemoveConnection: (connection: WorkflowCanvasConnection) => void;
};

function WorkflowCanvasFlow({
  draft,
  canManage: canManageDraft,
  selectedConnection,
  connectionSource,
  cycleNodeIds,
  nodeErrors,
  savingPositions,
  arrangingNodes,
  palette,
  details,
  onOpenNodeDetails,
  onSelectSource,
  selectedNodeIds,
  onSelectNodes,
  onRequestDeleteNode,
  onSelectConnection,
  onConnect,
  onMoveNodes,
  onArrangeNodes,
  onDropPalette,
  onRemoveConnection,
}: WorkflowCanvasProps) {
  const canManage = canManageDraft && !savingPositions && !arrangingNodes;
  const { screenToFlowPosition, setViewport } = useReactFlow();
  const store = useStoreApi<WorkflowFlowNode>();
  // The output a connection is being dragged from.
  const draggedSource = useConnection<WorkflowFlowNode, ConnectionSource>((connection) =>
    connection.inProgress
      ? {
          sourceNodeId: connection.fromHandle.nodeId,
          sourcePort: connection.fromHandle.id ?? "",
        }
      : null,
  );
  // Escape cancels the drag, but React Flow may still report the drop afterwards.
  const connectionCancelledRef = useRef(false);
  // React Flow reports measured sizes and in-progress drag positions through
  // `onNodesChange`; the saved positions still come only from the draft.
  const [measured, setMeasured] = useState<MeasuredSizes>({});
  const [dragged, setDragged] = useState<Record<string, XYPosition>>({});
  // Positions reached with Shift + arrows, saved together once Shift is released.
  const [keyboardMoved, setKeyboardMoved] = useState<Record<string, XYPosition>>({});
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  // React Flow may report several selection changes before the next render.
  const selectionRef = useRef(selectedNodeIds);
  selectionRef.current = selectedNodeIds;

  // Escape cancels the connection being dragged, or else the output picked with Salida.
  const connecting = draggedSource !== null || connectionSource !== null;
  useEffect(() => {
    if (!connecting) return;
    function cancelOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      const { connection, cancelConnection } = store.getState();
      if (connection.inProgress) {
        connectionCancelledRef.current = true;
        cancelConnection();
      } else onSelectSource(null);
    }
    document.addEventListener("keydown", cancelOnEscape);
    return () => document.removeEventListener("keydown", cancelOnEscape);
  }, [connecting, store, onSelectSource]);

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

  function openNodeDetails(nodeId: string) {
    onOpenNodeDetails?.(nodeId);
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

  /** Arranges every node with the size it has on screen, then fits the view to them once saved. */
  async function arrangeNodes() {
    if (!canManage || draft.nodes.length === 0) return;
    const sizes = Object.fromEntries(
      draft.nodes.map((node) => [node.id, workflowNodeSize(node.id, measured)]),
    );
    const positions = arrangeWorkflowNodes(draft.nodes, workflowCanvasEdges(draft), sizes);
    if (!(await onArrangeNodes(positions))) return;
    const { width, height } = store.getState();
    // Like the fit when the draft opens, a small draft is not enlarged past 100 %.
    void setViewport(
      workflowCanvasFitViewport({ ...draft, layout: positions }, { width, height }, measured, 1),
    );
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
    selectable: canManageDraft,
    selected: selectedNodeIds.includes(node.id),
    data: {
      node,
      draft,
      canManage,
      canSelect: canManageDraft,
      cycle: cycleNodeIds.includes(node.id),
      errors: nodeErrors?.[node.id] ?? [],
      connectionSource,
      pendingSource: canManage ? (draggedSource ?? connectionSource) : null,
      onSelectSource,
      onSelectNode: selectNode,
      onOpenDetails: openNodeDetails,
      onConnect,
    },
  }));
  const edges: WorkflowFlowEdge[] = workflowCanvasEdges(draft)
    .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
    .map((edge) => {
      const selected = selectedConnection
        ? sameWorkflowConnection(edge, selectedConnection)
        : false;
      return {
        id: connectionKey(edge),
        type: "workflow",
        source: edge.sourceNodeId,
        sourceHandle: edge.sourcePort,
        target: edge.targetNodeId,
        targetHandle: edge.targetPort,
        selected,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: selected ? SELECTED_EDGE_COLOR : EDGE_COLOR,
        },
        data: {
          connection: edge,
          required: !removableConnection(draft, edge),
          canManage: canManageDraft,
          canRemove: canManage,
          hovered: hoveredEdgeId === connectionKey(edge),
          onRemove: onRemoveConnection,
        },
      };
    });
  const removableSelection =
    canManage && selectedConnection && removableConnection(draft, selectedConnection)
      ? selectedConnection
      : null;

  // Only selection matters here: edges change through the draft. Selecting one
  // edge may arrive in the same batch as unselecting the previous one, in either
  // order, so a selected edge wins and only the edge shown as selected clears it.
  function handleEdgesChange(changes: EdgeChange<WorkflowFlowEdge>[]) {
    let selection: WorkflowCanvasConnection | null | undefined;
    for (const change of changes) {
      if (change.type !== "select") continue;
      const edge = edges.find((item) => item.id === change.id);
      if (!edge?.data) continue;
      if (change.selected) selection = edge.data.connection;
      else if (selection === undefined && edge.selected) selection = null;
    }
    if (selection !== undefined) onSelectConnection(selection);
  }

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
        className={`grid gap-4 ${
          palette && details
            ? "lg:grid-cols-[17rem_minmax(0,1fr)_20rem]"
            : palette
              ? "lg:grid-cols-[17rem_minmax(0,1fr)]"
              : details
                ? "lg:grid-cols-[minmax(0,1fr)_20rem]"
                : "grid-cols-1"
        }`}
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
            onKeyDown={(event) => {
              // Shift + Alt + T is Ordenar nodos; the key code is used because Alt
              // changes the typed character on some keyboards.
              if (event.shiftKey && event.altKey && event.code === "KeyT") {
                event.preventDefault();
                if (canManageDraft) void arrangeNodes();
                return;
              }
              // Enter on the canvas itself opens the details of the one selected node.
              if (
                event.key === "Enter" &&
                event.target === event.currentTarget &&
                selectedNodeIds.length === 1
              ) {
                event.preventDefault();
                openNodeDetails(selectedNodeIds[0]);
                return;
              }
              // Supr deletes the selected connection, without a dialog.
              if (event.key === "Delete" && removableSelection) {
                event.preventDefault();
                onRemoveConnection(removableSelection);
                return;
              }
              moveSelectionWithKeyboard(event);
            }}
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
            <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              // Members may open a node's details too, read-only.
              onNodeDoubleClick={(_, node) => openNodeDetails(node.id)}
              onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
              onEdgeMouseLeave={(_, edge) =>
                setHoveredEdgeId((current) => (current === edge.id ? null : current))
              }
              // Also called, with every dragged node, when the selection box is dragged.
              onNodeDragStop={(_, _node, moved) => saveDraggedNodes(moved)}
              // A drag connects only from an output to a compatible input; the
              // preview line and the port labels follow the same rules.
              isValidConnection={(connection) =>
                workflowPortCompatibility(draft, toCanvasConnection(connection)) === "compatible"
              }
              onConnectStart={() => {
                connectionCancelledRef.current = false;
              }}
              onConnect={(connection) => {
                if (!connectionCancelledRef.current) onConnect(toCanvasConnection(connection));
              }}
              // A drop on an incompatible port is reported too, so it can be
              // rejected with its reason. A drop on the background does nothing
              // until US-128 opens Agregar nodo there.
              onConnectEnd={(_, { isValid, fromHandle, toHandle }) => {
                if (connectionCancelledRef.current || isValid || !fromHandle || !toHandle) return;
                if (
                  toHandle.nodeId === fromHandle.nodeId &&
                  toHandle.id === fromHandle.id &&
                  toHandle.type === fromHandle.type
                )
                  return;
                onConnect({
                  sourceNodeId: fromHandle.nodeId,
                  sourcePort: fromHandle.id ?? "",
                  targetNodeId: toHandle.nodeId,
                  targetPort: toHandle.id ?? "",
                });
              }}
              // The Salida and Conectar buttons replace clicking the port dots.
              connectOnClick={false}
              nodeExtent={NODE_EXTENT}
              minZoom={WORKFLOW_CANVAS_MIN_ZOOM}
              maxZoom={WORKFLOW_CANVAS_MAX_ZOOM}
              nodesDraggable={canManage}
              nodesConnectable={canManage}
              nodesFocusable={false}
              edgesFocusable={false}
              // Shift + drag on the background draws a selection box; Ctrl or Cmd +
              // click adds or removes a node; a click on the background clears it.
              // Members may still select an edge to inspect it, but no node.
              elementsSelectable
              selectionKeyCode={canManageDraft ? "Shift" : null}
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
                arrangingNodes={arrangingNodes}
                editing={
                  canManageDraft
                    ? {
                        snapToGrid,
                        onToggleSnapToGrid: () => setSnapToGrid((current) => !current),
                        onSelectAll: () => changeSelection(draft.nodes.map((node) => node.id)),
                        hasNodes: draft.nodes.length > 0,
                        onArrangeNodes: () => void arrangeNodes(),
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
        {details}
      </div>
    </>
  );
}

function CanvasNavigation({
  draft,
  measured,
  savingPositions,
  arrangingNodes,
  editing,
}: {
  draft: WorkflowCanvasDraft;
  measured: MeasuredSizes;
  savingPositions: boolean;
  arrangingNodes: boolean;
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
          arrangingNodes={arrangingNodes}
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
