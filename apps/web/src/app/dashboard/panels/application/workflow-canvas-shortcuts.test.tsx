// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkflowCanvas,
  type WorkflowCanvasConnection,
  type WorkflowCanvasDraft,
} from "./workflow-canvas";
import { stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";

stubWorkflowCanvasLayout();

const condition = (id: string) =>
  ({
    id,
    type: "condition",
    sourceNodeId: "model",
    label: id,
    operator: "gte",
    threshold: 0.5,
    branches: { true: "Verdadero", false: "Falso" },
  }) as const;

// The image input, a node right of it and one far away: at 100 % they do not all fit.
const draft: WorkflowCanvasDraft = {
  nodes: [
    { id: "image", type: "input.image", outputs: { imagen: "image" } },
    condition("a"),
    condition("b"),
  ],
  layout: { image: { x: 0, y: 0 }, a: { x: 400, y: 0 }, b: { x: 1600, y: 700 } },
};

const imageToA: WorkflowCanvasConnection = {
  sourceNodeId: "image",
  sourcePort: "imagen",
  targetNodeId: "a",
  targetPort: "source",
};
const draftWithConnection: WorkflowCanvasDraft = { ...draft, connections: [imageToA] };

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
  onCloseNodeDetails: vi.fn(),
  onToggleAddNode: vi.fn(),
};

function Canvas({
  canManage = true,
  canvasDraft = draft,
  initialSelection = [] as string[],
  initialConnection = null as WorkflowCanvasConnection | null,
  connectionSource = null as { sourceNodeId: string; sourcePort: string } | null,
  detailsOpen = false,
  addNodeOpen = false,
}) {
  const [selectedNodeIds, setSelectedNodeIds] = useState(initialSelection);
  const [selectedConnection, setSelectedConnection] = useState(initialConnection);
  return (
    <WorkflowCanvas
      draft={canvasDraft}
      canManage={canManage}
      selectedConnection={selectedConnection}
      connectionSource={connectionSource}
      cycleNodeIds={[]}
      savingPositions={false}
      arrangingNodes={false}
      {...handlers}
      selectedNodeIds={selectedNodeIds}
      onSelectNodes={(nodeIds) => {
        handlers.onSelectNodes(nodeIds);
        setSelectedNodeIds(nodeIds);
      }}
      onSelectConnection={(connection) => {
        handlers.onSelectConnection(connection);
        setSelectedConnection(connection);
      }}
      details={
        detailsOpen ? (
          <aside aria-label="Detalles del nodo">
            <label>
              Etiqueta
              <input defaultValue="perro" />
            </label>
          </aside>
        ) : null
      }
      addNode={
        canManage
          ? { open: addNodeOpen, onToggle: handlers.onToggleAddNode, panel: () => null }
          : undefined
      }
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const canvas = () => screen.getByRole("region", { name: "Lienzo del workflow" });
const press = (key: string, options: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(canvas(), { key, ...options });
const zoomLevel = () => screen.getByRole("button", { name: /^Restablecer zoom/ }).textContent;
const isSelected = (nodeId: string) =>
  within(screen.getByTestId(`workflow-node-${nodeId}`))
    .getAllByRole("button")[0]
    .getAttribute("aria-pressed") === "true";

describe("workflow canvas keyboard shortcuts", () => {
  it("fits the view, selects a node with the arrows and opens its details with Enter", () => {
    render(<Canvas />);
    fireEvent.click(screen.getByRole("button", { name: /^Restablecer zoom/ }));
    expect(zoomLevel()).toBe("100 %");

    press("1");
    const fitted = zoomLevel();
    fireEvent.click(screen.getByRole("button", { name: /^Restablecer zoom/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ajustar a la vista" }));
    expect(fitted).toBe(zoomLevel());
    expect(fitted).not.toBe("100 %");

    // With nothing selected, the arrows start at the image input.
    press("ArrowRight");
    expect(isSelected("image")).toBe(true);
    press("ArrowRight");
    expect(isSelected("a")).toBe(true);
    expect(isSelected("image")).toBe(false);
    press("Enter");

    expect(handlers.onOpenNodeDetails).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("resets the zoom with 0 and zooms in and out with + and -", () => {
    render(<Canvas />);
    fireEvent.click(screen.getByRole("button", { name: "Ajustar a la vista" }));

    press("0");
    expect(zoomLevel()).toBe("100 %");
    press("+", { shiftKey: true });
    expect(zoomLevel()).toBe("125 %");
    press("-");
    press("-");
    expect(zoomLevel()).toBe("75 %");
  });

  it("keeps the selection when there is no node in that direction", () => {
    render(<Canvas initialSelection={["image"]} />);

    press("ArrowLeft");

    expect(isSelected("image")).toBe(true);
    expect(handlers.onSelectNodes).not.toHaveBeenCalled();
  });

  it("selects every node with Ctrl + A", () => {
    render(<Canvas />);

    press("a", { ctrlKey: true });

    expect(handlers.onSelectNodes).toHaveBeenCalledExactlyOnceWith(["image", "a", "b"]);
  });

  it("uses Cmd instead of Ctrl on macOS", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    render(<Canvas />);

    press("a", { ctrlKey: true });
    expect(handlers.onSelectNodes).not.toHaveBeenCalled();
    press("a", { metaKey: true });

    expect(handlers.onSelectNodes).toHaveBeenCalledExactlyOnceWith(["image", "a", "b"]);
  });

  it.each(["Delete", "Backspace"])("asks to delete the one selected node with %s", (key) => {
    render(<Canvas initialSelection={["a"]} />);

    press(key);

    expect(handlers.onRequestDeleteNode).toHaveBeenCalledExactlyOnceWith("a");
    expect(handlers.onRemoveConnection).not.toHaveBeenCalled();
  });

  it.each(["Delete", "Backspace"])("deletes the selected connection with %s", (key) => {
    render(<Canvas canvasDraft={draftWithConnection} initialConnection={imageToA} />);

    press(key);

    expect(handlers.onRemoveConnection).toHaveBeenCalledExactlyOnceWith(imageToA);
    expect(handlers.onRequestDeleteNode).not.toHaveBeenCalled();
  });

  it("deletes nothing with several nodes selected", () => {
    render(<Canvas initialSelection={["image", "a"]} />);

    press("Delete");

    expect(handlers.onRequestDeleteNode).not.toHaveBeenCalled();
  });

  it("closes the panels and clears the selection with Esc", () => {
    render(
      <Canvas
        canvasDraft={draftWithConnection}
        initialSelection={["a"]}
        initialConnection={imageToA}
        detailsOpen
        addNodeOpen
      />,
    );

    press("Escape");

    expect(handlers.onCloseNodeDetails).toHaveBeenCalledOnce();
    expect(handlers.onToggleAddNode).toHaveBeenCalledOnce();
    expect(handlers.onSelectNodes).toHaveBeenCalledExactlyOnceWith([]);
    expect(handlers.onSelectConnection).toHaveBeenCalledExactlyOnceWith(null);
    expect(isSelected("a")).toBe(false);
  });

  it("leaves Esc to cancel a connection in progress", () => {
    render(
      <Canvas
        initialSelection={["a"]}
        connectionSource={{ sourceNodeId: "image", sourcePort: "imagen" }}
      />,
    );

    press("Escape");

    expect(handlers.onSelectSource).toHaveBeenCalledExactlyOnceWith(null);
    expect(handlers.onSelectNodes).not.toHaveBeenCalled();
  });

  it("does not delete the node while a field of Detalles del nodo is being edited", () => {
    render(<Canvas initialSelection={["a"]} detailsOpen />);
    const field = screen.getByRole("textbox", { name: "Etiqueta" }) as HTMLInputElement;
    field.focus();

    fireEvent.keyDown(field, { key: "Backspace" });

    expect(handlers.onRequestDeleteNode).not.toHaveBeenCalled();
  });

  it("lists each shortcut with its visible equivalent with ?", async () => {
    render(<Canvas />);

    press("?", { shiftKey: true });
    const dialog = screen.getByRole("dialog", { name: "Atajos de teclado" });
    const rows = within(dialog).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toContain(
      "Ctrl + ASelecciona todos los nodosSeleccionar todo",
    );
    expect(within(dialog).getByText("Doble clic sobre el nodo")).toBeTruthy();

    // Inside the dialog the canvas shortcuts do nothing.
    fireEvent.keyDown(within(dialog).getAllByRole("button")[0], { key: "a", ctrlKey: true });
    expect(handlers.onSelectNodes).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Atajos de teclado" })).toBeNull(),
    );
  });

  it("opens the same list with the Atajos de teclado button of the canvas bar", () => {
    render(<Canvas />);

    fireEvent.click(screen.getByRole("button", { name: "Atajos de teclado" }));

    const dialog = screen.getByRole("dialog", { name: "Atajos de teclado" });
    expect(within(dialog).getByText("Ordenar nodos")).toBeTruthy();
    expect(within(dialog).getByText("Eliminar nodo o Eliminar conexión")).toBeTruthy();
  });

  describe("for a member without edit permission", () => {
    it("neither offers to delete a selected node nor selects nodes", () => {
      render(<Canvas canManage={false} initialSelection={["a"]} />);

      press("Delete");
      press("a", { ctrlKey: true });
      press("ArrowRight");
      press("Tab");

      expect(handlers.onRequestDeleteNode).not.toHaveBeenCalled();
      expect(handlers.onSelectNodes).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps the navigation shortcuts and lists only those", () => {
      render(<Canvas canManage={false} />);
      fireEvent.click(screen.getByRole("button", { name: "Ajustar a la vista" }));

      press("0");
      expect(zoomLevel()).toBe("100 %");

      fireEvent.click(screen.getByRole("button", { name: "Atajos de teclado" }));
      const dialog = screen.getByRole("dialog", { name: "Atajos de teclado" });
      expect(within(dialog).getByText("Ajustar a la vista")).toBeTruthy();
      expect(within(dialog).queryByText("Seleccionar todo")).toBeNull();
      expect(within(dialog).queryByText("Eliminar nodo o Eliminar conexión")).toBeNull();
    });
  });
});
