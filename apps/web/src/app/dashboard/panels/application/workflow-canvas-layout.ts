import dagre from "@dagrejs/dagre";
import type {
  WorkflowCanvasConnection,
  WorkflowCanvasNode,
  WorkflowCanvasPositions,
} from "./workflow-canvas";
import { workflowNodePorts } from "./workflow-canvas-ports";
import type { WorkflowCanvasSize } from "./workflow-canvas-viewport";

/** Minimum space between the cards of two consecutive levels. */
export const WORKFLOW_LAYOUT_LEVEL_GAP = 48;
/** Minimum space between two cards of the same level. */
export const WORKFLOW_LAYOUT_NODE_GAP = 24;
const ORIGIN = 48;
// Dagre may place cards at fractions of a pixel; one extra pixel of separation
// keeps the minimum gaps once positions are rounded to whole pixels.
const ROUNDING_SLACK = 1;

/**
 * Arranges the draft left to right by DAG level, starting at the image input,
 * using each card's measured size. The nodes the image input does not reach go
 * in a row below. Positions depend only on the nodes, their connections and
 * sizes, never on where the nodes are now, so arranging twice changes nothing.
 */
export function arrangeWorkflowNodes(
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasConnection[],
  sizes: Record<string, WorkflowCanvasSize>,
): WorkflowCanvasPositions {
  const nodeIds = new Set(nodes.map((node) => node.id));
  // Connections to or from a missing node are validation errors; they are left out.
  const known = edges.filter(
    (edge) =>
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId) &&
      edge.sourceNodeId !== edge.targetNodeId,
  );
  const imageInput = nodes.find((node) => node.type === "input.image");
  const reached = new Set(imageInput ? [imageInput.id] : []);
  // A Set's iteration also visits the nodes added while it runs, so this walks
  // everything reachable.
  for (const nodeId of reached)
    for (const edge of known) if (edge.sourceNodeId === nodeId) reached.add(edge.targetNodeId);
  const within = (group: (nodeId: string) => boolean) => ({
    nodes: nodes.filter((node) => group(node.id)),
    edges: known.filter((edge) => group(edge.sourceNodeId) && group(edge.targetNodeId)),
  });

  const main = within((nodeId) => reached.has(nodeId));
  const positions = arrangeMainFlow(main.nodes, main.edges, sizes);
  let rowTop = ORIGIN;
  for (const node of main.nodes)
    rowTop = Math.max(
      rowTop,
      positions[node.id].y + Math.ceil(sizes[node.id].height) + WORKFLOW_LAYOUT_LEVEL_GAP,
    );
  const rest = within((nodeId) => !reached.has(nodeId));
  let x = ORIGIN;
  for (const node of dependencyOrder(rest.nodes, rest.edges)) {
    positions[node.id] = { x, y: rowTop };
    x += Math.ceil(sizes[node.id].width) + WORKFLOW_LAYOUT_LEVEL_GAP;
  }
  return positions;
}

/** Lays out the nodes the image input reaches with dagre (ADR 0001). */
function arrangeMainFlow(
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasConnection[],
  sizes: Record<string, WorkflowCanvasSize>,
): WorkflowCanvasPositions {
  if (nodes.length === 0) return {};
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    ranksep: WORKFLOW_LAYOUT_LEVEL_GAP + ROUNDING_SLACK,
    nodesep: WORKFLOW_LAYOUT_NODE_GAP + ROUNDING_SLACK,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  const draftIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const indexOf = (nodeId: string) => draftIndex.get(nodeId) ?? 0;
  const portIndex = (edge: WorkflowCanvasConnection) =>
    workflowNodePorts(nodes[indexOf(edge.sourceNodeId)]).outputs.findIndex(
      (port) => port.id === edge.sourcePort,
    );
  // Dagre keeps the order in which nodes and edges are added (its crossing
  // heuristic is off): each level follows the draft, and the children of an
  // output follow its port order, so Verdadero stays above Falso. Every input
  // takes a single connection, so this order has no crossings.
  const ordered = [...edges].sort(
    (a, b) =>
      indexOf(a.sourceNodeId) - indexOf(b.sourceNodeId) ||
      portIndex(a) - portIndex(b) ||
      indexOf(a.targetNodeId) - indexOf(b.targetNodeId),
  );
  for (const node of nodes) graph.setNode(node.id, { ...sizes[node.id] });
  for (const edge of ordered) graph.setEdge(edge.sourceNodeId, edge.targetNodeId);
  dagre.layout(graph, { disableOptimalOrderHeuristic: true });

  // Dagre gives card centers, with the top-left corner of the graph at 0, 0.
  const positions: WorkflowCanvasPositions = {};
  for (const node of nodes) {
    const { x, y } = graph.node(node.id);
    const { width, height } = sizes[node.id];
    positions[node.id] = {
      x: ORIGIN + Math.round(x - width / 2),
      y: ORIGIN + Math.round(y - height / 2),
    };
  }
  return positions;
}

/** Each node after the nodes it depends on; otherwise in draft order. */
function dependencyOrder(
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasConnection[],
): WorkflowCanvasNode[] {
  const placed = new Set<string>();
  const order: WorkflowCanvasNode[] = [];
  while (order.length < nodes.length) {
    const pending = nodes.filter((node) => !placed.has(node.id));
    // A cycle, which the server rejects, falls back to the draft order.
    const next =
      pending.find((node) =>
        edges.every((edge) => edge.targetNodeId !== node.id || placed.has(edge.sourceNodeId)),
      ) ?? pending[0];
    placed.add(next.id);
    order.push(next);
  }
  return order;
}
