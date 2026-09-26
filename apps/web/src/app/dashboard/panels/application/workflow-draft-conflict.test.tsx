// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Application } from "../../types";
import { canvasViewport, stubWorkflowCanvasLayout } from "./workflow-canvas-test-utils";
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
const imageNode = { id: "image-node", type: "input.image", outputs: { imagen: "image" } };
const modelNode = {
  id: "model-node",
  type: "model.tflite",
  modelVersionId: "version-1",
  modelName: "Clasificador",
  version: "1.0.0",
  inputs: {
    image: { type: "image", width: 224, height: 224, channels: 3, normalization: "none" },
  },
  outputs: { result: { type: "classification", labels: ["perro"] } },
};
const imageToModel = {
  sourceNodeId: "image-node",
  sourcePort: "imagen",
  targetNodeId: "model-node",
  targetPort: "image",
};
const draft = {
  nodes: [imageNode, modelNode],
  connections: [],
  layout: { "image-node": { x: 48, y: 48 }, "model-node": { x: 400, y: 48 } },
};
const detail = (draftRevision: number, changes: Partial<typeof draft> = {}) => ({
  workflow: {
    id: "workflow-1",
    applicationId: "app-1",
    name: "Diagnóstico de hoja de café",
    status: "draft",
    createdAt: "2026-09-21T15:00:00.000Z",
    updatedAt: "2026-09-21T16:00:00.000Z",
  },
  draft: { ...draft, ...changes },
  draftRevision,
  versions: [],
});
const detailUrl = "/applications/app-1/workflows/workflow-1";
const layoutUrl = `${detailUrl}/layout`;
const connectionsUrl = `${detailUrl}/connections`;
const conflict = {
  isAxiosError: true,
  response: {
    status: 409,
    data: {
      message: "Otra persona modificó este borrador. Recarga para ver los cambios.",
      code: "draftConflict",
    },
  },
};

function serve(...details: ReturnType<typeof detail>[]) {
  for (const item of details)
    client.get.mockImplementationOnce(async (url: string) => {
      expect(url).toBe(detailUrl);
      return { data: item };
    });
}

async function renderDetail() {
  render(
    <TooltipProvider>
      <WorkflowDetailView application={application} workflowId="workflow-1" canManage />
    </TooltipProvider>,
  );
  await screen.findByTestId("workflow-node-model-node");
}

const canvas = () => screen.getByRole("region", { name: "Lienzo del workflow" });
const nodePosition = (id: string) =>
  (document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement).style.transform;
const inNode = (nodeId: string, name: string) =>
  within(screen.getByTestId(`workflow-node-${nodeId}`)).getByRole("button", { name });
const conflictNotice = () => screen.queryByTestId("workflow-draft-conflict");

function moveEveryNodeRight() {
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar todo" }));
  fireEvent.keyDown(canvas(), { key: "Shift", shiftKey: true });
  fireEvent.keyDown(canvas(), { key: "ArrowRight", shiftKey: true });
  fireEvent.keyUp(canvas(), { key: "Shift" });
}

function connectImageToModel() {
  fireEvent.click(inNode("image-node", "Salida imagen"));
  fireEvent.click(inNode("model-node", "Conectar entrada de imagen de Clasificador · 1.0.0"));
}

beforeEach(() => {
  // Model options for Agregar nodo.
  client.get.mockImplementation(async () => ({ data: { models: [] } }));
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("US-130: editing a draft someone else changed", () => {
  it("bases every change on the revision the previous one left", async () => {
    serve(detail(7));
    client.patch.mockResolvedValueOnce({ data: { positions: {}, draftRevision: 8 } });
    client.post.mockResolvedValueOnce({
      data: { draft: { ...draft, connections: [imageToModel] }, draftRevision: 9 },
    });
    await renderDetail();

    moveEveryNodeRight();
    // The canvas takes no other change while positions are saving.
    await waitFor(() => expect(screen.queryByText("Guardando posiciones…")).toBeNull());
    connectImageToModel();

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Conexión creada."));
    expect(client.patch).toHaveBeenCalledWith(layoutUrl, {
      positions: { "image-node": { x: 64, y: 48 }, "model-node": { x: 416, y: 48 } },
      draftRevision: 7,
    });
    expect(client.post).toHaveBeenCalledWith(connectionsUrl, { ...imageToModel, draftRevision: 8 });
  });

  it("sends a change only once the previous one is saved, so the editor never conflicts with itself", async () => {
    serve(detail(7));
    let finishConnection: (value: unknown) => void = () => {};
    client.post.mockReturnValueOnce(
      new Promise((resolve) => {
        finishConnection = resolve;
      }),
    );
    client.patch.mockResolvedValueOnce({ data: { positions: {}, draftRevision: 9 } });
    await renderDetail();

    connectImageToModel();
    moveEveryNodeRight();
    await act(async () => {});
    expect(client.post).toHaveBeenCalledWith(connectionsUrl, { ...imageToModel, draftRevision: 7 });
    expect(client.patch).not.toHaveBeenCalled();

    await act(async () =>
      finishConnection({
        data: { draft: { ...draft, connections: [imageToModel] }, draftRevision: 8 },
      }),
    );

    await waitFor(() =>
      expect(client.patch).toHaveBeenCalledWith(layoutUrl, {
        positions: { "image-node": { x: 64, y: 48 }, "model-node": { x: 416, y: 48 } },
        draftRevision: 8,
      }),
    );
  });

  it("returns moved nodes to their place and says someone else changed the draft", async () => {
    serve(detail(7));
    client.patch.mockRejectedValueOnce(conflict);
    await renderDetail();

    moveEveryNodeRight();

    await waitFor(() =>
      expect(conflictNotice()?.textContent).toContain(
        "Otra persona modificó este borrador. Recarga para ver los cambios.",
      ),
    );
    expect(nodePosition("image-node")).toBe("translate(48px,48px)");
    expect(nodePosition("model-node")).toBe("translate(400px,48px)");
    expect(
      within(conflictNotice() as HTMLElement).getByRole("button", { name: "Recargar borrador" }),
    ).toBeTruthy();
    // The generic save failure does not show: nothing failed on this side.
    expect(toastMock.error).not.toHaveBeenCalled();
    // The draft is reloaded only when asked to.
    expect(client.get.mock.calls.filter(([url]) => url === detailUrl)).toHaveLength(1);
  });

  it("rejects a connection made on the old view, then reloads the saved draft keeping the view", async () => {
    // Someone else moved the model after this draft was loaded.
    const saved = detail(8, {
      layout: { "image-node": { x: 48, y: 48 }, "model-node": { x: 720, y: 240 } },
    });
    serve(detail(7));
    client.post.mockRejectedValueOnce(conflict);
    await renderDetail();
    const view = canvasViewport();

    connectImageToModel();

    await waitFor(() => expect(conflictNotice()).not.toBeNull());
    expect(client.post).toHaveBeenCalledWith(connectionsUrl, { ...imageToModel, draftRevision: 7 });
    expect(document.querySelector(".react-flow__edge")).toBeNull();
    expect(toastMock.error).not.toHaveBeenCalled();

    let finishReload: (value: unknown) => void = () => {};
    client.get.mockReturnValueOnce(
      new Promise((resolve) => {
        finishReload = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Recargar borrador" }));
    expect(within(conflictNotice() as HTMLElement).getByText("Cargando workflow…")).toBeTruthy();

    await act(async () => finishReload({ data: saved }));

    await waitFor(() => expect(conflictNotice()).toBeNull());
    expect(client.get).toHaveBeenLastCalledWith(detailUrl, { signal: expect.any(AbortSignal) });
    expect(nodePosition("model-node")).toBe("translate(720px,240px)");
    expect(canvasViewport()).toEqual(view);

    // The next change is based on the reloaded revision.
    client.post.mockResolvedValueOnce({
      data: { draft: { ...saved.draft, connections: [imageToModel] }, draftRevision: 9 },
    });
    connectImageToModel();
    await waitFor(() =>
      expect(client.post).toHaveBeenLastCalledWith(connectionsUrl, {
        ...imageToModel,
        draftRevision: 8,
      }),
    );
  });

  it("keeps the notice with the load error when the reload fails", async () => {
    serve(detail(7));
    client.post.mockRejectedValueOnce(conflict);
    await renderDetail();
    connectImageToModel();
    await waitFor(() => expect(conflictNotice()).not.toBeNull());

    client.get.mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Recargar borrador" }));

    await waitFor(() =>
      expect(conflictNotice()?.textContent).toContain(
        "No pudimos cargar el workflow. Inténtalo nuevamente.",
      ),
    );
    expect(screen.getByTestId("workflow-node-model-node")).toBeTruthy();
    expect(
      within(conflictNotice() as HTMLElement).getByRole("button", { name: "Recargar borrador" }),
    ).toBeTruthy();
  });

  it("shows the notice when a node cannot be deleted because the draft changed", async () => {
    serve(detail(7));
    client.delete.mockRejectedValueOnce(conflict);
    await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Modelo Clasificador · 1.0.0" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar nodo" }));
    const confirmation = await screen.findByRole("dialog", {
      name: '¿Eliminar "Clasificador · 1.0.0"?',
    });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Eliminar nodo" }));

    await waitFor(() => expect(conflictNotice()).not.toBeNull());
    expect(client.delete).toHaveBeenCalledWith(`${detailUrl}/nodes/model-node`, {
      data: { draftRevision: 7 },
    });
    expect(screen.getByTestId("workflow-node-model-node")).toBeTruthy();
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});
