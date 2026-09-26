// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowCanvas, type WorkflowCanvasDraft } from "./workflow-canvas";

const draft: WorkflowCanvasDraft = {
  nodes: [
    { id: "image", type: "input.image", outputs: { imagen: "image" } },
    {
      id: "output",
      type: "output",
      name: "Resultado",
      sourceNodeId: "image",
      sourcePort: "imagen",
      resultType: "classification",
    },
  ],
  layout: { image: { x: 0, y: 0 }, output: { x: 400, y: 0 } },
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
  onOpenNodeDetails: vi.fn(),
};

function renderCanvas({
  canManage = true,
  selectedNodeIds = [] as string[],
  details = null as React.ReactNode,
} = {}) {
  return render(
    <WorkflowCanvas
      draft={draft}
      canManage={canManage}
      selectedConnection={null}
      connectionSource={null}
      cycleNodeIds={[]}
      savingPositions={false}
      arrangingNodes={false}
      palette={null}
      details={details}
      selectedNodeIds={selectedNodeIds}
      {...handlers}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const canvas = () => screen.getByTestId("workflow-canvas");
const flowNode = (nodeId: string) =>
  document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement;

describe("opening a node's details", () => {
  it.each([
    ["an administrator", true],
    ["a member", false],
  ])("opens the details of a double-clicked node for %s", (_who, canManage) => {
    renderCanvas({ canManage });

    fireEvent.doubleClick(flowNode("output"));

    expect(handlers.onOpenNodeDetails).toHaveBeenCalledExactlyOnceWith("output");
  });

  it("opens the selected node's details with Enter while the canvas has the focus", () => {
    renderCanvas({ selectedNodeIds: ["output"] });

    fireEvent.keyDown(canvas(), { key: "Enter" });

    expect(handlers.onOpenNodeDetails).toHaveBeenCalledExactlyOnceWith("output");
  });

  it("opens the details with Enter on the header of the selected node", () => {
    renderCanvas({ selectedNodeIds: ["output"] });

    fireEvent.keyDown(
      within(screen.getByTestId("workflow-node-output")).getByRole("button", {
        name: "Salida Resultado",
      }),
      { key: "Enter" },
    );

    expect(handlers.onOpenNodeDetails).toHaveBeenCalledExactlyOnceWith("output");
  });

  it.each([
    ["no node", []],
    ["several nodes", ["image", "output"]],
  ])("ignores Enter with %s selected", (_case, selectedNodeIds) => {
    renderCanvas({ selectedNodeIds });

    fireEvent.keyDown(canvas(), { key: "Enter" });

    expect(handlers.onOpenNodeDetails).not.toHaveBeenCalled();
  });

  it("ignores Enter on a port button", () => {
    renderCanvas({ selectedNodeIds: ["image"] });

    fireEvent.keyDown(
      within(screen.getByTestId("workflow-node-image")).getByRole("button", {
        name: "Salida imagen",
      }),
      { key: "Enter" },
    );

    expect(handlers.onOpenNodeDetails).not.toHaveBeenCalled();
  });

  it("shows the details panel beside the canvas, which stays visible", () => {
    renderCanvas({ details: <aside aria-label="Detalles del nodo" /> });

    expect(screen.getByRole("complementary", { name: "Detalles del nodo" })).toBeTruthy();
    expect(canvas()).toBeTruthy();
  });
});
