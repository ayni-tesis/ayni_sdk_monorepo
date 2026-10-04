import type { WorkflowCanvasDraft, WorkflowCanvasNode } from "./workflow-canvas";

// A dataset capture may hang from a branch of a condition on the result it
// captures, on its `condicion` input (US-074). These read that link off the
// draft so the editor can say when the capture happens.

type ConditionNode = Extract<WorkflowCanvasNode, { type: "condition" }>;
export type WorkflowConditionBranch = "true" | "false";

export const CAPTURE_ONLY_WHEN_LABEL = "Capturar solo cuando";
/** How a branch of a condition a capture hangs from reads on the canvas. */
export const CAPTURE_BRANCH_LABELS = {
  capture: "Capturar evidencia",
  skip: "No capturar",
} as const;

const BRANCHES: readonly WorkflowConditionBranch[] = ["true", "false"];
const NEGATED_OPERATORS = { gte: "lt", gt: "lte", lte: "gt", lt: "gte" } as const;

function captureGates(draft: WorkflowCanvasDraft) {
  return (draft.connections ?? []).filter(
    (edge) =>
      edge.targetPort === "condicion" &&
      draft.nodes.some((node) => node.id === edge.targetNodeId && node.type === "dataset.capture"),
  );
}

/** The branches of the condition that some capture hangs from, `true` first. */
export function workflowCaptureBranches(
  draft: WorkflowCanvasDraft,
  conditionId: string,
): WorkflowConditionBranch[] {
  const gates = captureGates(draft).filter((edge) => edge.sourceNodeId === conditionId);
  return BRANCHES.filter((branch) => gates.some((edge) => edge.sourcePort === branch));
}

/** The condition and the branch a capture hangs from, if it hangs from one. */
export function workflowCaptureCondition(
  draft: WorkflowCanvasDraft,
  captureId: string,
): { condition: ConditionNode; branch: WorkflowConditionBranch } | undefined {
  const gate = captureGates(draft).find((edge) => edge.targetNodeId === captureId);
  const condition = draft.nodes.find((node) => node.id === gate?.sourceNodeId);
  const branch = BRANCHES.find((item) => item === gate?.sourcePort);
  return condition?.type === "condition" && branch ? { condition, branch } : undefined;
}

/**
 * The condition as it holds on `branch`: the `false` branch of `perro ≥ 0,8`
 * is taken when `perro < 0,8`.
 */
export function conditionOnBranch(
  condition: ConditionNode,
  branch: WorkflowConditionBranch,
): ConditionNode {
  return branch === "true"
    ? condition
    : { ...condition, operator: NEGATED_OPERATORS[condition.operator] };
}
