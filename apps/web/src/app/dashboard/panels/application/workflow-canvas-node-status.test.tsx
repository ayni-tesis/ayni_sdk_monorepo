// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowCanvas, type WorkflowCanvasDraft } from "./workflow-canvas";

const draft: WorkflowCanvasDraft = {
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
      id: "output",
      type: "output",
      name: "Diagnóstico",
      sourceNodeId: "model",
      sourcePort: "result",
      resultType: "classification",
    },
  ],
  connections: [],
  layout: {
    image: { x: 0, y: 0 },
    model: { x: 400, y: 0 },
    condition: { x: 800, y: 0 },
    output: { x: 800, y: 300 },
  },
};

const handlers = {
  onSelectSource: vi.fn(),
  onSelectNodes: vi.fn(),
  onRequestDeleteNode: vi.fn(),
  onSelectConnection: vi.fn(),
  onConnect: vi.fn(),
  onMoveNodes: vi.fn(),
  onArrangeNodes: vi.fn(),
  onDropPalette: vi.fn(),
  onRemoveConnection: vi.fn(),
};

function renderCanvas({
  canManage = true,
  nodeErrors,
}: {
  canManage?: boolean;
  nodeErrors?: Record<string, string[]>;
} = {}) {
  return render(
    <WorkflowCanvas
      draft={draft}
      canManage={canManage}
      selectedConnection={null}
      connectionSource={null}
      cycleNodeIds={[]}
      nodeErrors={nodeErrors}
      savingPositions={false}
      arrangingNodes={false}
      selectedNodeIds={[]}
      {...handlers}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const card = (id: string) => screen.getByTestId(`workflow-node-${id}`);
const cardHeader = (id: string) => card(id).querySelector("header") as HTMLElement;
const errorIndicator = (id: string) =>
  within(card(id)).queryByRole("button", { name: /de validación$/ });

describe("identifying the type of each workflow node", () => {
  it("names each node type with an icon and text, not only a color", () => {
    renderCanvas();

    const types = ["image", "model", "condition", "output"].map((id) => ({
      text: cardHeader(id).textContent,
      icon: cardHeader(id).querySelector("svg")?.getAttribute("class"),
    }));

    expect(types.map((type) => type.text)).toEqual([
      "Imagen de entrada",
      "Modelo",
      "Condición",
      "Salida",
    ]);
    // Every type has its own icon.
    expect(types.every((type) => type.icon)).toBe(true);
    expect(new Set(types.map((type) => type.icon)).size).toBe(4);
  });

  it("summarizes the model, the condition rule and the output below the type", () => {
    renderCanvas();

    const version = within(card("model")).getByText("1.0.0");
    expect(version.className).toContain("font-mono");
    expect(within(card("model")).getByText("Clasificador").className).not.toContain("font-mono");
    // The rule reads like the condition, with a decimal comma.
    expect(within(card("condition")).getByText("perro ≥ 0,8")).toBeTruthy();
    expect(within(card("output")).getByText("Diagnóstico")).toBeTruthy();
    expect(within(card("output")).getByText("Tipo de resultado: Clasificación")).toBeTruthy();
  });

  it("names each node's select button after its type and summary", () => {
    renderCanvas();

    expect(screen.getByRole("button", { name: "Imagen de entrada" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Modelo Clasificador · 1.0.0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Condición perro ≥ 0,8" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salida Diagnóstico" })).toBeTruthy();
  });

  it("shows the type and summary to members without edit permission too", () => {
    renderCanvas({ canManage: false });

    expect(cardHeader("model").textContent).toBe("Modelo");
    expect(within(card("model")).getByText("1.0.0")).toBeTruthy();
    expect(within(card("condition")).getByText("perro ≥ 0,8")).toBeTruthy();
  });
});

describe("showing validation errors on workflow nodes", () => {
  const modelErrors = [
    'El nodo "Clasificador" necesita una imagen de entrada.',
    'El nodo "Clasificador" forma parte de un ciclo.',
  ];

  it("marks a node with errors with a red border, an alert icon and the error count", () => {
    renderCanvas({ nodeErrors: { model: modelErrors } });

    const indicator = errorIndicator("model");
    expect(indicator?.getAttribute("aria-label")).toBe("2 errores de validación");
    expect(indicator?.textContent).toBe("2");
    expect(indicator?.querySelector("svg")).not.toBeNull();
    expect(card("model").className).toContain("border-destructive");

    expect(errorIndicator("image")).toBeNull();
    expect(card("image").className).not.toContain("border-destructive");
  });

  it("counts a single error in the singular", () => {
    renderCanvas({ nodeErrors: { model: modelErrors.slice(0, 1) } });

    expect(errorIndicator("model")?.getAttribute("aria-label")).toBe("1 error de validación");
  });

  it("reads the error messages when the indicator is focused", async () => {
    renderCanvas({ nodeErrors: { model: modelErrors } });

    act(() => (errorIndicator("model") as HTMLElement).focus());

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain(modelErrors[0]);
    expect(tooltip.textContent).toContain(modelErrors[1]);
    expect(errorIndicator("model")?.getAttribute("aria-describedby")).toBe(tooltip.id);
  });

  it("reads the error messages when the pointer rests on the indicator", async () => {
    renderCanvas({ nodeErrors: { model: modelErrors.slice(0, 1) } });

    fireEvent.pointerMove(errorIndicator("model") as HTMLElement);

    expect((await screen.findByRole("tooltip")).textContent).toContain(modelErrors[0]);
  });

  it("shows no error indicator without a validation result", () => {
    renderCanvas();

    for (const id of ["image", "model", "condition", "output"]) {
      expect(errorIndicator(id)).toBeNull();
      expect(card(id).className).not.toContain("border-destructive");
    }
  });
});
