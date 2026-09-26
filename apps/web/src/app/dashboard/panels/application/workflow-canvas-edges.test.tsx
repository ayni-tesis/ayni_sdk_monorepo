// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkflowCanvas,
  type WorkflowCanvasConnection,
  type WorkflowCanvasDraft,
} from "./workflow-canvas";
import { stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";

stubWorkflowCanvasLayout();

const imageToModel: WorkflowCanvasConnection = {
  sourceNodeId: "image",
  sourcePort: "imagen",
  targetNodeId: "model",
  targetPort: "image",
};
// The condition's source is part of the node itself, so it can only be reassigned.
const modelToCondition: WorkflowCanvasConnection = {
  sourceNodeId: "model",
  sourcePort: "result",
  targetNodeId: "condition",
  targetPort: "source",
};

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
      threshold: 0.5,
      branches: { true: "Verdadero", false: "Falso" },
    },
  ],
  connections: [imageToModel],
  layout: { image: { x: 0, y: 0 }, model: { x: 400, y: 0 }, condition: { x: 800, y: 0 } },
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
  selectedConnection = null,
}: {
  canManage?: boolean;
  selectedConnection?: WorkflowCanvasConnection | null;
} = {}) {
  return render(
    <WorkflowCanvas
      draft={draft}
      canManage={canManage}
      selectedConnection={selectedConnection}
      connectionSource={null}
      cycleNodeIds={[]}
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

const edgeId = (edge: WorkflowCanvasConnection) =>
  `${edge.sourceNodeId}:${edge.sourcePort}:${edge.targetNodeId}:${edge.targetPort}`;
const edge = (connection: WorkflowCanvasConnection) =>
  document.querySelector(`.react-flow__edge[data-id="${edgeId(connection)}"]`) as SVGGElement;
const edgePath = (connection: WorkflowCanvasConnection) =>
  edge(connection).querySelector(".react-flow__edge-path") as SVGPathElement;
const canvas = () => screen.getByTestId("workflow-canvas");

describe("selecting a connection on the canvas", () => {
  it("draws every connection and condition or output source as an edge", () => {
    renderCanvas();

    expect(edge(imageToModel)).not.toBeNull();
    expect(edge(modelToCondition)).not.toBeNull();
  });

  it("selects the clicked edge", () => {
    renderCanvas();

    fireEvent.click(edge(imageToModel));

    expect(handlers.onSelectConnection).toHaveBeenCalledExactlyOnceWith(imageToModel);
  });

  it("clears the selected edge when the background is clicked", () => {
    renderCanvas({ selectedConnection: imageToModel });

    fireEvent.click(document.querySelector(".react-flow__pane") as Element);

    expect(handlers.onSelectConnection).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("thickens an edge under the pointer", () => {
    renderCanvas();
    const width = () => Number(edgePath(imageToModel).style.strokeWidth);
    const resting = width();

    // The pointer meets the wide, invisible path React Flow draws for hit testing.
    const hitArea = edge(imageToModel).querySelector(".react-flow__edge-interaction") as Element;
    fireEvent.mouseEnter(hitArea);
    expect(width()).toBeGreaterThan(resting);

    fireEvent.mouseLeave(hitArea);
    expect(width()).toBe(resting);
  });

  it("tells the selected edge apart by color and by thickness", () => {
    renderCanvas({ selectedConnection: imageToModel });
    const selected = edgePath(imageToModel).style;
    const other = edgePath(modelToCondition).style;

    expect(edge(imageToModel).classList.contains("selected")).toBe(true);
    expect(selected.stroke).toContain("cyan");
    expect(other.stroke).not.toContain("cyan");
    expect(Number(selected.strokeWidth)).toBeGreaterThan(Number(other.strokeWidth));
  });

  it("no longer lists the connections below the canvas", () => {
    renderCanvas();

    expect(screen.queryByRole("region", { name: "Conexiones del workflow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "imagen → image" })).toBeNull();
  });
});

describe("deleting the selected connection", () => {
  it("offers Eliminar conexión only once an edge is selected", () => {
    renderCanvas();

    expect(screen.queryByRole("button", { name: "Eliminar conexión" })).toBeNull();
  });

  it("deletes a connection between ports with its button", () => {
    renderCanvas({ selectedConnection: imageToModel });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar conexión" }));

    expect(handlers.onRemoveConnection).toHaveBeenCalledExactlyOnceWith(imageToModel);
  });

  it("deletes it with the Supr key", () => {
    renderCanvas({ selectedConnection: imageToModel });

    fireEvent.keyDown(canvas(), { key: "Delete" });

    expect(handlers.onRemoveConnection).toHaveBeenCalledExactlyOnceWith(imageToModel);
  });

  it("disables the button for a required source and explains how to reassign it", () => {
    renderCanvas({ selectedConnection: modelToCondition });

    const button = screen.getByRole("button", {
      name: "Eliminar conexión",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Esta conexión es obligatoria. Reasígnala arrastrándola a otro nodo.");

    fireEvent.keyDown(canvas(), { key: "Delete" });
    expect(handlers.onRemoveConnection).not.toHaveBeenCalled();
  });

  it("lets a member select an edge to inspect it but not delete it", () => {
    const { rerender } = renderCanvas({ canManage: false });

    fireEvent.click(edge(imageToModel));
    expect(handlers.onSelectConnection).toHaveBeenCalledExactlyOnceWith(imageToModel);

    rerender(
      <WorkflowCanvas
        draft={draft}
        canManage={false}
        selectedConnection={imageToModel}
        connectionSource={null}
        cycleNodeIds={[]}
        savingPositions={false}
        arrangingNodes={false}
        selectedNodeIds={[]}
        {...handlers}
      />,
    );
    expect(edge(imageToModel).classList.contains("selected")).toBe(true);
    expect(screen.queryByRole("button", { name: "Eliminar conexión" })).toBeNull();
    fireEvent.keyDown(canvas(), { key: "Delete" });
    expect(handlers.onRemoveConnection).not.toHaveBeenCalled();
  });
});
