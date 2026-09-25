// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  WorkflowCanvas,
  type WorkflowCanvasConnection,
  type WorkflowCanvasDraft,
} from "./workflow-canvas";
import { canvasMouse, stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";

stubWorkflowCanvasLayout();

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
  layout: { image: { x: 0, y: 0 }, model: { x: 400, y: 0 }, condition: { x: 800, y: 0 } },
};

const handlers = {
  onSelectSource: vi.fn(),
  onSelectNodes: vi.fn(),
  onRequestDeleteNode: vi.fn(),
  onSelectConnection: vi.fn(),
  onConnect: vi.fn(),
  onMoveNodes: vi.fn(),
  onDropPalette: vi.fn(),
  onRemoveConnection: vi.fn(),
};

function renderCanvas({
  canManage = true,
  connectionSource = null,
}: {
  canManage?: boolean;
  connectionSource?: { sourceNodeId: string; sourcePort: string } | null;
} = {}) {
  return render(
    <WorkflowCanvas
      draft={draft}
      canManage={canManage}
      selectedConnection={null}
      connectionSource={connectionSource}
      cycleNodeIds={[]}
      savingPositions={false}
      palette={null}
      selectedNodeIds={[]}
      {...handlers}
    />,
  );
}

// jsdom has no hit testing; React Flow asks which element is under the pointer
// to find the port a connection is dropped on.
let elementUnderPointer: Element | null = null;
beforeAll(() => {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => elementUnderPointer,
  });
});
afterAll(() => {
  Reflect.deleteProperty(document, "elementFromPoint");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  elementUnderPointer = null;
});

const card = (id: string) => screen.getByTestId(`workflow-node-${id}`);
const port = (nodeId: string, portId: string) =>
  document.querySelector(
    `.react-flow__handle[data-nodeid="${nodeId}"][data-handleid="${portId}"]`,
  ) as HTMLElement;
const portState = (nodeId: string, portId: string) =>
  card(nodeId).querySelector(`[data-port="${portId}"]`)?.getAttribute("data-port-state") ?? null;

/** Presses on an output port and moves past React Flow's 1 px threshold. */
function startConnection(nodeId: string, portId: string) {
  act(() => {
    canvasMouse("mouseDown", port(nodeId, portId), 10, 10);
    canvasMouse("mouseMove", document, 20, 10);
  });
}

/** Moves the pointer over `target` (or empty space) and releases it there. */
function dropConnectionOn(target: Element | null) {
  elementUnderPointer = target ?? document.querySelector(".react-flow__pane");
  act(() => {
    canvasMouse("mouseMove", document, 90_000, 90_000);
    canvasMouse("mouseUp", document, 90_000, 90_000);
  });
}

const connection = (
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort: string,
): WorkflowCanvasConnection => ({ sourceNodeId, sourcePort, targetNodeId, targetPort });

describe("connecting workflow ports by dragging", () => {
  it("shows every port with its label, inputs on the left and outputs on the right", () => {
    renderCanvas();

    expect(port("image", "imagen").classList.contains("react-flow__handle-right")).toBe(true);
    expect(port("model", "image").classList.contains("react-flow__handle-left")).toBe(true);
    expect(port("model", "result").classList.contains("react-flow__handle-right")).toBe(true);
    expect(port("condition", "source").classList.contains("react-flow__handle-left")).toBe(true);
    expect(within(card("image")).getByText("imagen")).toBeTruthy();
    expect(within(card("model")).getByText("Entrada de imagen")).toBeTruthy();
    expect(within(card("model")).getByText("Resultado")).toBeTruthy();
    expect(within(card("condition")).getByText("Origen")).toBeTruthy();
    expect(within(card("condition")).getByText("Verdadero")).toBeTruthy();
    expect(within(card("condition")).getByText("Falso")).toBeTruthy();
  });

  it("highlights compatible ports with a label while dragging and connects on drop", () => {
    renderCanvas();

    startConnection("image", "imagen");

    expect(document.querySelector(".react-flow__connection")).not.toBeNull();
    expect(portState("model", "image")).toBe("compatible");
    expect(within(card("model")).getByText("Compatible")).toBeTruthy();
    expect(portState("condition", "source")).toBe("incompatible");
    expect(portState("model", "result")).toBe("incompatible");
    expect(within(card("condition")).getAllByText("No compatible")).toHaveLength(3);
    // The port the connection starts from is neither.
    expect(portState("image", "imagen")).toBeNull();

    dropConnectionOn(port("model", "image"));

    expect(handlers.onConnect).toHaveBeenCalledExactlyOnceWith(
      connection("image", "imagen", "model", "image"),
    );
    expect(portState("model", "image")).toBeNull();
    expect(screen.queryByText("Compatible")).toBeNull();
  });

  it("reports a drop on an incompatible port so it can be rejected", () => {
    renderCanvas();

    startConnection("model", "result");
    dropConnectionOn(port("condition", "source"));

    expect(handlers.onConnect).toHaveBeenCalledExactlyOnceWith(
      connection("model", "result", "condition", "source"),
    );
  });

  it("does nothing when the connection is dropped on the background", () => {
    renderCanvas();

    startConnection("image", "imagen");
    dropConnectionOn(null);

    expect(handlers.onConnect).not.toHaveBeenCalled();
  });

  it("cancels the connection in progress with Escape", () => {
    renderCanvas();

    startConnection("image", "imagen");
    // Over a compatible port, so React Flow would otherwise connect on release.
    elementUnderPointer = port("model", "image");
    act(() => canvasMouse("mouseMove", document, 90_000, 90_000));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(portState("model", "image")).toBeNull();
    expect(document.querySelector(".react-flow__connection")).toBeNull();
    act(() => canvasMouse("mouseUp", document, 90_000, 90_000));
    expect(handlers.onConnect).not.toHaveBeenCalled();
  });

  it("does not start a connection for a member without administration permissions", () => {
    renderCanvas({ canManage: false });

    startConnection("image", "imagen");

    expect(document.querySelector(".react-flow__connection")).toBeNull();
    expect(portState("model", "image")).toBeNull();
    dropConnectionOn(port("model", "image"));
    expect(handlers.onConnect).not.toHaveBeenCalled();
  });
});

describe("connecting workflow ports without dragging", () => {
  it("offers Salida for every output and Conectar for every input", () => {
    renderCanvas();

    fireEvent.click(within(card("model")).getByRole("button", { name: "Salida Resultado" }));
    expect(handlers.onSelectSource).toHaveBeenCalledWith({
      sourceNodeId: "model",
      sourcePort: "result",
    });
    fireEvent.click(within(card("condition")).getByRole("button", { name: "Salida Verdadero" }));
    expect(handlers.onSelectSource).toHaveBeenLastCalledWith({
      sourceNodeId: "condition",
      sourcePort: "true",
    });
    expect(within(card("condition")).getByRole("button", { name: "Salida Falso" })).toBeTruthy();
    expect(within(card("image")).getByRole("button", { name: "Salida imagen" })).toBeTruthy();
  });

  it("highlights the ports compatible with the selected output and connects the chosen input", () => {
    renderCanvas({ connectionSource: { sourceNodeId: "image", sourcePort: "imagen" } });

    expect(portState("model", "image")).toBe("compatible");
    expect(portState("condition", "source")).toBe("incompatible");

    fireEvent.click(
      screen.getByRole("button", { name: "Conectar entrada de imagen de Clasificador · 1.0.0" }),
    );
    expect(handlers.onConnect).toHaveBeenCalledExactlyOnceWith(
      connection("image", "imagen", "model", "image"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Conectar origen de Condición: perro" }));
    expect(handlers.onConnect).toHaveBeenLastCalledWith(
      connection("image", "imagen", "condition", "source"),
    );
  });

  it("disables both alternatives for a member", () => {
    renderCanvas({ canManage: false });

    for (const name of ["Salida imagen", "Salida Resultado", "Salida Verdadero", "Salida Falso"])
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Conectar origen de Condición: perro",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
