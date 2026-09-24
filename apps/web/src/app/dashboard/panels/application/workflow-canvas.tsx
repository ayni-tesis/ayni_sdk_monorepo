"use client";

import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import { IconGripVertical } from "@tabler/icons-react";
import { type ReactNode, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";

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
type DragData = {
  kind: "canvas-node" | "palette-node" | "output-port";
  nodeId?: string;
  nodeType?: WorkflowCanvasNodeType;
  sourcePort?: string;
  position?: WorkflowCanvasPosition;
};
type DropData = { kind: "canvas" | "image-input-port"; nodeId?: string };
type CanvasEdge = WorkflowCanvasConnection;

const NODE_WIDTH = 292;
const NODE_HEIGHT = 188;
const NODE_GAP_X = 344;
const NODE_GAP_Y = 244;
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
  const draggable = useDraggable({
    id: `palette:${nodeType}`,
    type: "palette-node",
    data: { kind: "palette-node", nodeType } satisfies DragData,
    disabled,
  });
  return (
    <Button
      ref={draggable.ref}
      type="button"
      variant="outline"
      disabled={disabled}
      className={`w-full cursor-grab justify-start active:cursor-grabbing ${draggable.isDragging ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function WorkflowNodeCard({
  node,
  position,
  canManage,
  cycle,
  connectionSource,
  onSelectSource,
  selected,
  onSelectNode,
  onConnect,
}: {
  node: WorkflowCanvasNode;
  position: WorkflowCanvasPosition;
  canManage: boolean;
  cycle: boolean;
  connectionSource: ConnectionSource;
  onSelectSource: (source: Exclude<ConnectionSource, null>) => void;
  selected: boolean;
  onSelectNode: (nodeId: string) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
}) {
  const draggable = useDraggable({
    id: `node:${node.id}`,
    type: "canvas-node",
    data: { kind: "canvas-node", nodeId: node.id, position } satisfies DragData,
    disabled: !canManage,
  });
  const inputDrop = useDroppable({
    id: `input:${node.id}:image`,
    accept: "output-port",
    data: { kind: "image-input-port", nodeId: node.id } satisfies DropData,
    disabled: !canManage || node.type !== "model.tflite",
  });

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
      onConnect({ ...connectionSource, targetNodeId: node.id, targetPort: "image" });
  };

  return (
    <article
      ref={draggable.ref}
      data-testid={`workflow-node-${node.id}`}
      className={`absolute z-10 w-[292px] rounded-lg border bg-card p-3 shadow-sm ${cycle ? "border-destructive ring-2 ring-destructive" : ""} ${draggable.isDragging ? "z-20 opacity-80 shadow-lg" : ""}`}
      style={{ left: position.x, top: position.y }}
    >
      <header className="mb-3 flex min-h-8 items-center gap-2 border-b pb-2">
        <button
          ref={draggable.handleRef}
          type="button"
          disabled={!canManage}
          aria-label={`Mover ${nodeTitle}`}
          title={canManage ? "Arrastra para mover este nodo" : undefined}
          className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          <IconGripVertical className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`min-w-0 flex-1 truncate text-left font-medium text-sm ${selected ? "text-primary" : ""}`}
          aria-pressed={selected}
          disabled={!canManage}
          onClick={() => onSelectNode(node.id)}
        >
          {nodeTitle}
        </button>
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs uppercase tracking-wide">
          {node.type.replace(".", " · ")}
        </span>
      </header>

      {node.type === "input.image" && (
        <div className="flex items-center justify-between gap-2">
          <span className="rounded bg-muted px-2 py-1 text-xs">imagen: image</span>
          <OutputPort
            nodeId={node.id}
            port="imagen"
            canManage={canManage}
            selected={
              connectionSource?.sourceNodeId === node.id && connectionSource.sourcePort === "imagen"
            }
            onSelect={() => onSelectSource({ sourceNodeId: node.id, sourcePort: "imagen" })}
          />
        </div>
      )}

      {node.type === "model.tflite" && (
        <div className="space-y-3">
          <button
            ref={inputDrop.ref}
            type="button"
            disabled={!canManage}
            aria-label={`Conectar entrada de imagen de ${node.modelName} · ${node.version}`}
            aria-disabled={!canManage || !connectionSource}
            className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${inputDrop.isDropTarget ? "border-primary bg-primary/10" : ""}`}
            onClick={connectFromSelection}
          >
            <span>Entrada de imagen</span>
            <span className="text-muted-foreground">
              {node.inputs.image.width}×{node.inputs.image.height}
            </span>
          </button>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">Resultado del modelo</span>
            <span className="rounded bg-muted px-2 py-1 text-xs">{node.outputs.result.type}</span>
          </div>
        </div>
      )}

      {node.type === "condition" && (
        <div className="space-y-3 text-xs">
          <p>
            {node.operator} {node.threshold}
          </p>
          <div className="flex gap-2">
            <span className="rounded bg-muted px-2 py-1">{node.branches.true}</span>
            <span className="rounded bg-muted px-2 py-1">{node.branches.false}</span>
          </div>
        </div>
      )}

      {node.type === "output" && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Resultado recibido</span>
          <span className="rounded bg-muted px-2 py-1 text-xs">{node.resultType}</span>
        </div>
      )}
    </article>
  );
}

function OutputPort({
  nodeId,
  port,
  canManage,
  selected,
  onSelect,
}: {
  nodeId: string;
  port: string;
  canManage: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const draggable = useDraggable({
    id: `port:${nodeId}:${port}`,
    type: "output-port",
    data: { kind: "output-port", nodeId, sourcePort: port } satisfies DragData,
    disabled: !canManage,
  });
  return (
    <button
      ref={draggable.ref}
      type="button"
      disabled={!canManage}
      aria-pressed={selected}
      aria-label={`Salida ${port}`}
      title="Arrastra al puerto de entrada de un modelo o selecciónala para conectar"
      className={`cursor-grab rounded border px-2 py-1 text-xs aria-pressed:border-primary aria-pressed:bg-primary/10 ${draggable.isDragging ? "opacity-50" : ""}`}
      onClick={onSelect}
    >
      Salida {port}
    </button>
  );
}

export function WorkflowCanvas({
  draft,
  canManage,
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
}: {
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
}) {
  const boardRef = useRef<HTMLElement | null>(null);

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return;
        const source = event.operation.source;
        const target = event.operation.target;
        if (!source || !target) return;
        const sourceData = source.data as DragData;
        const targetData = target.data as DropData;

        if (sourceData.kind === "output-port" && targetData.kind === "image-input-port") {
          onConnect({
            sourceNodeId: sourceData.nodeId ?? "",
            sourcePort: sourceData.sourcePort ?? "",
            targetNodeId: targetData.nodeId ?? "",
            targetPort: "image",
          });
          return;
        }
        if (targetData.kind !== "canvas" || !boardRef.current) return;

        if (sourceData.kind === "canvas-node" && sourceData.nodeId && sourceData.position) {
          const delta = event.operation.position?.delta;
          if (!delta) return;
          onMoveNode(sourceData.nodeId, {
            x: Math.max(0, Math.round(sourceData.position.x + delta.x)),
            y: Math.max(0, Math.round(sourceData.position.y + delta.y)),
          });
          return;
        }
        if (sourceData.kind === "palette-node" && sourceData.nodeType) {
          const bounds = boardRef.current.getBoundingClientRect();
          const current = event.operation.position?.current;
          if (!current) return;
          onDropPalette(sourceData.nodeType, {
            x: Math.max(24, Math.round(current.x - bounds.left - NODE_WIDTH / 2)),
            y: Math.max(24, Math.round(current.y - bounds.top - 24)),
          });
        }
      }}
    >
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
        <CanvasBoard
          draft={draft}
          canManage={canManage && !savingPosition}
          cycleNodeIds={cycleNodeIds}
          selectedConnection={selectedConnection}
          connectionSource={connectionSource}
          selectedNodeId={selectedNodeId}
          boardRef={boardRef}
          onSelectSource={onSelectSource}
          onSelectNode={onSelectNode}
          onRequestDeleteNode={onRequestDeleteNode}
          onSelectConnection={onSelectConnection}
          onConnect={onConnect}
          onRemoveConnection={onRemoveConnection}
        />
      </div>
    </DragDropProvider>
  );
}

function CanvasBoard({
  draft,
  canManage,
  cycleNodeIds,
  selectedConnection,
  connectionSource,
  selectedNodeId,
  boardRef,
  onSelectSource,
  onSelectNode,
  onRequestDeleteNode,
  onSelectConnection,
  onConnect,
  onRemoveConnection,
}: {
  draft: WorkflowCanvasDraft;
  canManage: boolean;
  cycleNodeIds: string[];
  selectedConnection: WorkflowCanvasConnection | null;
  connectionSource: ConnectionSource;
  selectedNodeId: string | null;
  boardRef: React.RefObject<HTMLElement | null>;
  onSelectSource: (source: Exclude<ConnectionSource, null>) => void;
  onSelectNode: (nodeId: string) => void;
  onRequestDeleteNode: (nodeId: string) => void;
  onSelectConnection: (connection: WorkflowCanvasConnection) => void;
  onConnect: (connection: WorkflowCanvasConnection) => void;
  onRemoveConnection: (connection: WorkflowCanvasConnection) => void;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: "workflow-canvas",
    accept: ["canvas-node", "palette-node"],
    data: { kind: "canvas" } satisfies DropData,
    disabled: !canManage,
  });
  const setBoardRef = useCallback(
    (element: HTMLElement | null) => {
      boardRef.current = element;
      ref(element);
    },
    [boardRef, ref],
  );

  const positions = draft.nodes.map((node, index) => ({
    node,
    position: workflowNodePosition(draft, node, index),
  }));
  const boardWidth = Math.max(
    1180,
    ...positions.map(({ position }) => position.x + NODE_WIDTH + 48),
  );
  const boardHeight = Math.max(
    720,
    ...positions.map(({ position }) => position.y + NODE_HEIGHT + 48),
  );
  const positionById = new Map(positions.map(({ node, position }) => [node.id, position]));
  const edges = workflowCanvasEdges(draft);

  function edgePath(edge: CanvasEdge) {
    const source = positionById.get(edge.sourceNodeId);
    const target = positionById.get(edge.targetNodeId);
    if (!source || !target) return "";
    const startX = source.x + NODE_WIDTH;
    const startY =
      source.y + (edge.sourcePort === "true" ? 116 : edge.sourcePort === "false" ? 148 : 86);
    const endX = target.x;
    const endY = target.y + 86;
    const curve = Math.max(54, Math.abs(endX - startX) / 2);
    return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
  }

  return (
    <div className="min-w-0 space-y-2">
      <section className="overflow-auto rounded-lg border bg-background">
        <section
          ref={setBoardRef}
          data-testid="workflow-canvas"
          aria-label="Lienzo del workflow"
          className={`relative min-h-[720px] ${isDropTarget ? "ring-2 ring-primary/60 ring-inset" : ""}`}
          style={{
            width: boardWidth,
            height: boardHeight,
            backgroundImage:
              "radial-gradient(circle, color-mix(in srgb, var(--muted-foreground) 28%, transparent) 1px, transparent 1.5px)",
            backgroundSize: "22px 22px",
          }}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible"
            width={boardWidth}
            height={boardHeight}
          >
            <defs>
              <marker
                id="workflow-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="var(--muted-foreground)" />
              </marker>
            </defs>
            {edges.map((edge) => {
              return (
                <path
                  key={`${edge.sourceNodeId}:${edge.sourcePort}:${edge.targetNodeId}:${edge.targetPort}`}
                  d={edgePath(edge)}
                  fill="none"
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  markerEnd="url(#workflow-arrow)"
                />
              );
            })}
          </svg>

          {positions.map(({ node, position }) => (
            <WorkflowNodeCard
              key={node.id}
              node={node}
              position={position}
              canManage={canManage}
              cycle={cycleNodeIds.includes(node.id)}
              connectionSource={connectionSource}
              selected={selectedNodeId === node.id}
              onSelectSource={onSelectSource}
              onSelectNode={onSelectNode}
              onConnect={onConnect}
            />
          ))}

          {positions.length === 0 && (
            <div className="absolute top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="font-medium text-sm">Este borrador aún no tiene nodos.</p>
              {canManage && (
                <p className="mt-1 text-muted-foreground text-xs">
                  Arrastra un nodo desde la paleta o selecciónalo para empezar el flujo.
                </p>
              )}
            </div>
          )}
        </section>
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
  );
}
