// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Application } from "../../types";
import { stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";
import { WorkflowDetailView } from "./workflow-detail-view";

const { client, toastMock } = vi.hoisted(() => ({
  client: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/http-client", () => ({ httpClient: client }));
vi.mock("sonner", () => ({ toast: toastMock }));

stubWorkflowCanvasLayout();

const application: Application = {
  id: "app-1",
  organizationId: "org-1",
  name: "Cámara",
  status: "active",
};
const model = (
  id: string,
  modelName: string,
  result:
    | { type: "classification"; labels: string[] }
    | { type: "detection"; labels: string[]; scoreThreshold: number },
) => ({
  id,
  type: "model.tflite",
  modelVersionId: `${id}-version`,
  modelName,
  version: "1.0.0",
  inputs: {
    image: { type: "image", width: 224, height: 224, channels: 3, normalization: "none" },
  },
  outputs: { result },
});
const condition = {
  id: "condition",
  type: "condition",
  sourceNodeId: "model-a",
  label: "perro",
  operator: "gte",
  threshold: 0.8,
  branches: { true: "Verdadero", false: "Falso" },
};
const output = {
  id: "output",
  type: "output",
  name: "Clase",
  sourceNodeId: "model-a",
  sourcePort: "result",
  resultType: "classification",
};
const draft = {
  nodes: [
    model("model-a", "Perros", { type: "classification", labels: ["perro"] }),
    model("model-b", "Mascotas", { type: "classification", labels: ["gato", "perro"] }),
    model("model-c", "Gatos", { type: "classification", labels: ["gato"] }),
    model("detector", "Detector", { type: "detection", labels: ["perro"], scoreThreshold: 0.5 }),
    condition,
    output,
  ],
  connections: [],
  layout: {
    "model-a": { x: 0, y: 0 },
    "model-b": { x: 0, y: 300 },
    "model-c": { x: 0, y: 600 },
    detector: { x: 0, y: 900 },
    condition: { x: 500, y: 0 },
    output: { x: 500, y: 300 },
  },
};
const detail = {
  workflow: {
    id: "workflow-1",
    applicationId: "app-1",
    name: "Mascotas",
    status: "draft",
    createdAt: "2026-09-21T15:00:00.000Z",
    updatedAt: "2026-09-21T16:00:00.000Z",
  },
  draft,
  draftRevision: 4,
  versions: [],
};
const detailUrl = "/applications/app-1/workflows/workflow-1";
const connectionsUrl = `${detailUrl}/connections`;
const reassignment = {
  sourceNodeId: "model-b",
  sourcePort: "result",
  targetNodeId: "condition",
  targetPort: "source",
};
const reassignedDraft = {
  ...draft,
  nodes: draft.nodes.map((node) =>
    node.id === "condition" ? { ...condition, sourceNodeId: "model-b" } : node,
  ),
};

async function renderDetail() {
  client.get.mockImplementation(async (url: string) =>
    url === detailUrl ? { data: detail } : { data: { models: [] } },
  );
  render(
    <TooltipProvider>
      <WorkflowDetailView application={application} workflowId="workflow-1" canManage />
    </TooltipProvider>,
  );
  await screen.findByTestId("workflow-node-condition");
}

const edgePath = (sourceNodeId: string, sourcePort: string, targetNodeId: string) =>
  document.querySelector(
    `.react-flow__edge[data-id="${sourceNodeId}:${sourcePort}:${targetNodeId}:source"] .react-flow__edge-path`,
  ) as SVGPathElement | null;
const inNode = (nodeId: string, name: string) =>
  within(screen.getByTestId(`workflow-node-${nodeId}`)).getByRole("button", { name });

/** Picks an output with Salida, then the Origen of a node with Conectar. */
function connectOrigin(sourceNodeId: string, sourcePortLabel: string, target: string) {
  fireEvent.click(inNode(sourceNodeId, `Salida ${sourcePortLabel}`));
  fireEvent.click(screen.getByRole("button", { name: `Conectar origen de ${target}` }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  client.get.mockImplementation(async () => ({ data: { models: [] } }));
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("US-131: reassigning the Origen of a condition or an output", () => {
  it("replaces the condition's source, drawing the new edge dotted while it saves", async () => {
    const saving = deferred<{ data: { draft: typeof reassignedDraft; draftRevision: number } }>();
    client.post.mockReturnValueOnce(saving.promise);
    await renderDetail();
    expect(edgePath("model-a", "result", "condition")).not.toBeNull();

    connectOrigin("model-b", "Resultado", "Condición: perro");

    expect(client.post).toHaveBeenCalledExactlyOnceWith(connectionsUrl, {
      ...reassignment,
      draftRevision: 4,
    });
    // The new edge replaces the old one at once, dotted until it is saved.
    expect(edgePath("model-a", "result", "condition")).toBeNull();
    expect(edgePath("model-b", "result", "condition")?.style.strokeDasharray).toBe("1 6");

    saving.resolve({ data: { draft: reassignedDraft, draftRevision: 5 } });

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Conexión actualizada."));
    expect(edgePath("model-b", "result", "condition")?.style.strokeDasharray).toBe("5 5");
    expect(edgePath("model-a", "result", "condition")).toBeNull();
  });

  it.each([
    [
      "a condition to a model without its label",
      "model-c",
      "Condición: perro",
      "Esta condición no es compatible con la salida seleccionada.",
    ],
    [
      "a classification output to a detection result",
      "detector",
      "Salida: Clase",
      "El resultado seleccionado no es compatible con la salida.",
    ],
  ])(
    "rejects reassigning %s without a request and keeps the previous source",
    async (_case, sourceNodeId, target, message) => {
      await renderDetail();

      connectOrigin(sourceNodeId, "Resultado", target);

      expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(message);
      expect(client.post).not.toHaveBeenCalled();
      expect(
        edgePath(sourceNodeId, "result", target.startsWith("Condición") ? "condition" : "output"),
      ).toBeNull();
      expect(edgePath("model-a", "result", "condition")).not.toBeNull();
      expect(edgePath("model-a", "result", "output")).not.toBeNull();
    },
  );

  it("puts the previous source back when the server refuses the new one", async () => {
    client.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          message: "Esta condición no es compatible con la salida seleccionada.",
          code: "incompatibleSource",
        },
      },
    });
    await renderDetail();

    connectOrigin("model-b", "Resultado", "Condición: perro");

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Esta condición no es compatible con la salida seleccionada.",
      ),
    );
    expect(edgePath("model-a", "result", "condition")).not.toBeNull();
    expect(edgePath("model-b", "result", "condition")).toBeNull();
  });

  it("shows No pudimos actualizar la conexión. and restores the edge on any other failure", async () => {
    client.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { message: "Internal Server Error" } },
    });
    await renderDetail();

    connectOrigin("model-b", "Resultado", "Condición: perro");

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("No pudimos actualizar la conexión."),
    );
    expect(edgePath("model-a", "result", "condition")).not.toBeNull();
    expect(edgePath("model-b", "result", "condition")).toBeNull();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("shows the cycle rule of US-033 and its nodes when the server finds a cycle", async () => {
    client.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          message: "Esta conexión crearía un ciclo. Los workflows deben ser acíclicos.",
          code: "workflowCycle",
          nodeIds: ["model-b", "condition"],
        },
      },
    });
    await renderDetail();

    connectOrigin("model-b", "Resultado", "Condición: perro");

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Esta conexión crearía un ciclo. Los workflows deben ser acíclicos.",
      ),
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "Esta conexión crearía un ciclo. Los workflows deben ser acíclicos.",
    );
    expect(edgePath("model-a", "result", "condition")).not.toBeNull();
    expect(edgePath("model-b", "result", "condition")).toBeNull();
  });

  it("restores the edge and offers Recargar borrador when someone else changed the draft", async () => {
    client.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          message: "Otra persona modificó este borrador. Recarga para ver los cambios.",
          code: "draftConflict",
        },
      },
    });
    await renderDetail();

    connectOrigin("model-b", "Resultado", "Condición: perro");

    expect(await screen.findByTestId("workflow-draft-conflict")).toBeTruthy();
    expect(edgePath("model-a", "result", "condition")).not.toBeNull();
    expect(edgePath("model-b", "result", "condition")).toBeNull();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
