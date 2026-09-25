// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowCanvas, type WorkflowCanvasDraft } from "./workflow-canvas";
import { canvasViewport, stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";

stubWorkflowCanvasLayout();

// The image feeds the model, but the model sits far away, so the draft opens
// zoomed out to 48 %.
const scattered: WorkflowCanvasDraft = {
  nodes: [
    { id: "image", type: "input.image", outputs: { imagen: "image" } },
    {
      id: "model",
      type: "model.tflite",
      modelVersionId: "model-version",
      modelName: "Clasificador",
      version: "1.0.0",
      inputs: {
        image: {
          type: "image",
          width: 224,
          height: 224,
          channels: 3,
          normalization: "zero_to_one",
        },
      },
      outputs: { result: { type: "classification", labels: ["hoja"] } },
    },
  ],
  connections: [
    { sourceNodeId: "image", sourcePort: "imagen", targetNodeId: "model", targetPort: "image" },
  ],
  layout: { image: { x: 0, y: 0 }, model: { x: 1600, y: 700 } },
};
// Levels are 48 px apart plus one pixel that absorbs rounding.
const arranged = { image: { x: 48, y: 48 }, model: { x: 48 + 292 + 49, y: 48 } };

const onArrangeNodes = vi.fn<(positions: unknown) => Promise<boolean>>();

function renderCanvas({
  draft = scattered,
  canManage = true,
  arrangingNodes = false,
}: {
  draft?: WorkflowCanvasDraft;
  canManage?: boolean;
  arrangingNodes?: boolean;
} = {}) {
  return render(
    <WorkflowCanvas
      draft={draft}
      canManage={canManage}
      selectedConnection={null}
      connectionSource={null}
      cycleNodeIds={[]}
      savingPositions={false}
      arrangingNodes={arrangingNodes}
      palette={null}
      selectedNodeIds={[]}
      onSelectSource={vi.fn()}
      onSelectNodes={vi.fn()}
      onRequestDeleteNode={vi.fn()}
      onSelectConnection={vi.fn()}
      onConnect={vi.fn()}
      onMoveNodes={vi.fn()}
      onArrangeNodes={onArrangeNodes}
      onDropPalette={vi.fn()}
      onRemoveConnection={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const arrangeButton = () =>
  screen.getByRole("button", { name: "Ordenar nodos" }) as HTMLButtonElement;
const canvas = () => screen.getByRole("region", { name: "Lienzo del workflow" });

describe("arranging workflow nodes", () => {
  it("saves a new position for every node, then fits the view to them without passing 100 %", async () => {
    onArrangeNodes.mockResolvedValueOnce(true);
    renderCanvas();
    expect(canvasViewport().zoom).toBeLessThan(0.5);

    await act(async () => fireEvent.click(arrangeButton()));

    expect(onArrangeNodes).toHaveBeenCalledExactlyOnceWith(arranged);
    // Bounds 48..681 × 48..236 fit at 143 %, capped at 100 % and centered in 1000 × 600.
    expect(canvasViewport()).toEqual({ x: 500 - (48 + 633 / 2), y: 300 - (48 + 188 / 2), zoom: 1 });
  });

  it("keeps the view when the positions cannot be saved", async () => {
    onArrangeNodes.mockResolvedValueOnce(false);
    renderCanvas();
    const before = canvasViewport();

    await act(async () => fireEvent.click(arrangeButton()));

    expect(onArrangeNodes).toHaveBeenCalledTimes(1);
    expect(canvasViewport()).toEqual(before);
  });

  it("arranges the nodes with Shift + Alt + T", async () => {
    onArrangeNodes.mockResolvedValueOnce(true);
    renderCanvas();

    expect(arrangeButton().getAttribute("aria-keyshortcuts")).toBe("Shift+Alt+T");
    await act(async () =>
      fireEvent.keyDown(canvas(), { key: "T", code: "KeyT", shiftKey: true, altKey: true }),
    );

    expect(onArrangeNodes).toHaveBeenCalledExactlyOnceWith(arranged);
  });

  it("shows Ordenando nodos… and blocks a second arrangement while saving", () => {
    renderCanvas({ arrangingNodes: true });

    const controls = screen.getByRole("group", { name: "Controles del lienzo" });
    expect(within(controls).getByText("Ordenando nodos…")).toBeTruthy();
    expect(arrangeButton().disabled).toBe(true);
    fireEvent.keyDown(canvas(), { key: "T", code: "KeyT", shiftKey: true, altKey: true });
    expect(onArrangeNodes).not.toHaveBeenCalled();
  });

  it("disables Ordenar nodos with its reason when the draft has no nodes", () => {
    renderCanvas({ draft: { nodes: [] } });

    expect(arrangeButton().disabled).toBe(true);
    expect(arrangeButton().title).toBe("No hay nodos para ordenar.");
    fireEvent.keyDown(canvas(), { key: "T", code: "KeyT", shiftKey: true, altKey: true });
    expect(onArrangeNodes).not.toHaveBeenCalled();
  });

  it("offers members neither the button nor the shortcut", () => {
    renderCanvas({ canManage: false });

    expect(screen.queryByRole("button", { name: "Ordenar nodos" })).toBeNull();
    fireEvent.keyDown(canvas(), { key: "T", code: "KeyT", shiftKey: true, altKey: true });
    expect(onArrangeNodes).not.toHaveBeenCalled();
  });
});
