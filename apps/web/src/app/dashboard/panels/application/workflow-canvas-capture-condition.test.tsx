// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowCanvas, type WorkflowCanvasDraft, workflowConditionRule } from "./workflow-canvas";
import { conditionOnBranch, workflowCaptureBranches } from "./workflow-capture-condition";

// US-074: a capture that hangs from a branch of a condition shows on the
// condition when it captures and which branch does.
const base: WorkflowCanvasDraft = {
  nodes: [
    { id: "image", type: "input.image", outputs: { imagen: "image" } },
    {
      id: "model",
      type: "model.tflite",
      modelVersionId: "model-version",
      modelName: "Clasificador",
      version: "1.0.0",
      inputs: {
        image: { type: "image", width: 224, height: 224, channels: 3, normalization: "none" },
      },
      outputs: { result: { type: "classification", labels: ["perro"] } },
    },
    {
      id: "condition",
      type: "condition",
      sourceNodeId: "model",
      label: "perro",
      operator: "gte",
      threshold: 0.8,
      branches: { true: "Verdadero", false: "Falso" },
    },
    {
      id: "capture",
      type: "dataset.capture",
      inputs: { imagen: "image", resultado: "inferenceResult" },
    },
  ],
  connections: [
    { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
    { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "capture", targetPort: "imagen" },
    {
      sourceNodeId: "model",
      sourcePort: "result",
      targetNodeId: "capture",
      targetPort: "resultado",
    },
  ],
  layout: {
    image: { x: 0, y: 0 },
    model: { x: 400, y: 0 },
    condition: { x: 800, y: 0 },
    capture: { x: 1200, y: 0 },
  },
};

const gated = (branch: "true" | "false"): WorkflowCanvasDraft => ({
  ...base,
  connections: [
    ...(base.connections ?? []),
    {
      sourceNodeId: "condition",
      sourcePort: branch,
      targetNodeId: "capture",
      targetPort: "condicion",
    },
  ],
});

function renderCanvas(draft: WorkflowCanvasDraft) {
  return render(
    <WorkflowCanvas
      draft={draft}
      canManage
      selectedConnection={null}
      connectionSource={null}
      cycleNodeIds={[]}
      savingPositions={false}
      arrangingNodes={false}
      selectedNodeIds={[]}
      onSelectSource={vi.fn()}
      onSelectNodes={vi.fn()}
      onRequestDeleteNode={vi.fn()}
      onSelectConnection={vi.fn()}
      onConnect={vi.fn()}
      onMoveNodes={vi.fn()}
      onArrangeNodes={vi.fn()}
      onDropPalette={vi.fn()}
      onRemoveConnection={vi.fn()}
    />,
  );
}

afterEach(cleanup);

const card = (id: string) => screen.getByTestId(`workflow-node-${id}`);
const portRow = (nodeId: string, port: string) =>
  card(nodeId).querySelector(`[data-port="${port}"]`) as HTMLElement;

describe("a condition a capture hangs from (US-074)", () => {
  it("shows when it captures and labels the branch that captures and the other", () => {
    renderCanvas(gated("true"));

    expect(within(card("condition")).getByText("Capturar solo cuando perro ≥ 0,8")).toBeTruthy();
    expect(within(portRow("condition", "true")).getByText("Capturar evidencia")).toBeTruthy();
    expect(within(portRow("condition", "false")).getByText("No capturar")).toBeTruthy();
    // Screen readers hear it too, in the name of the condition's select button.
    expect(
      screen.getByRole("button", {
        name: "Condición perro ≥ 0,8 Capturar solo cuando perro ≥ 0,8",
      }),
    ).toBeTruthy();
  });

  it("states the rule of the false branch when the capture hangs from it", () => {
    renderCanvas(gated("false"));

    // The condition card keeps its own rule.
    expect(within(card("condition")).getByText("perro ≥ 0,8")).toBeTruthy();
    expect(within(card("condition")).getByText("Capturar solo cuando perro < 0,8")).toBeTruthy();
    expect(within(portRow("condition", "false")).getByText("Capturar evidencia")).toBeTruthy();
    expect(within(portRow("condition", "true")).getByText("No capturar")).toBeTruthy();
  });

  it("says nothing about capturing on a condition no capture hangs from", () => {
    renderCanvas(base);

    expect(within(card("condition")).queryByText(/Capturar solo cuando/)).toBeNull();
    expect(within(card("condition")).queryByText("No capturar")).toBeNull();
    expect(within(card("condition")).queryByText("Capturar evidencia")).toBeNull();
  });

  it("gives the capture a condición input to connect a branch to", () => {
    renderCanvas(base);

    expect(
      screen.getByRole("button", { name: "Conectar condición de Capturar evidencia" }),
    ).toBeTruthy();
  });
});

describe("conditionOnBranch", () => {
  it.each([
    ["gte", "perro < 0,8"],
    ["gt", "perro ≤ 0,8"],
    ["lte", "perro > 0,8"],
    ["lt", "perro ≥ 0,8"],
  ] as const)("reads %s on the false branch as its opposite", (operator, rule) => {
    const condition = base.nodes[2];
    if (condition?.type !== "condition") throw new Error("Expected the condition");
    expect(workflowConditionRule(conditionOnBranch({ ...condition, operator }, "false"))).toBe(
      rule,
    );
    expect(conditionOnBranch({ ...condition, operator }, "true").operator).toBe(operator);
  });

  it("lists only the branches that reach a capture's condición input", () => {
    expect(workflowCaptureBranches(base, "condition")).toEqual([]);
    expect(workflowCaptureBranches(gated("false"), "condition")).toEqual(["false"]);
    // A branch into another input does not decide a capture.
    expect(
      workflowCaptureBranches(
        {
          ...base,
          connections: [
            {
              sourceNodeId: "condition",
              sourcePort: "true",
              targetNodeId: "model",
              targetPort: "condicion",
            },
          ],
        },
        "condition",
      ),
    ).toEqual([]);
  });
});
