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
const contract = {
  image: { type: "image", width: 224, height: 224, channels: 3, normalization: "none" },
};
const model = (id: string, modelName: string) => ({
  id,
  type: "model.tflite",
  modelVersionId: `${id}-version`,
  modelName,
  version: "1.0.0",
  inputs: contract,
  outputs: { result: { type: "classification", labels: ["roya", "sana"] } },
});
const imageNode = { id: "image", type: "input.image", outputs: { imagen: "image" } };
const leafModel = model("model-a", "Hoja");
const fruitModel = model("model-b", "Fruto");
// Fed by the leaf model, so deleting that model deletes it too.
const condition = {
  id: "condition",
  type: "condition",
  sourceNodeId: "model-a",
  label: "roya",
  operator: "gte",
  threshold: 0.8,
  branches: { true: "Verdadero", false: "Falso" },
};
const toModel = (targetNodeId: string) => ({
  sourceNodeId: "image",
  sourcePort: "imagen",
  targetNodeId,
  targetPort: "image",
});
const draft = {
  nodes: [imageNode, leafModel, fruitModel, condition],
  connections: [toModel("model-a"), toModel("model-b")],
  layout: {
    image: { x: 48, y: 48 },
    "model-a": { x: 400, y: 48 },
    "model-b": { x: 400, y: 320 },
    condition: { x: 760, y: 48 },
  },
};
const detailUrl = "/applications/app-1/workflows/workflow-1";
const detail = {
  workflow: {
    id: "workflow-1",
    applicationId: "app-1",
    name: "Diagnóstico de café",
    status: "draft",
    createdAt: "2026-09-21T15:00:00.000Z",
    updatedAt: "2026-09-21T16:00:00.000Z",
  },
  draft,
  draftRevision: 4,
  versions: [],
};
const afterDeletion = {
  nodes: [imageNode],
  connections: [],
  layout: { image: { x: 48, y: 48 } },
};

async function renderDetail(canManage = true) {
  client.get.mockImplementation(async (url: string) =>
    url === detailUrl ? { data: detail } : { data: { models: [] } },
  );
  render(
    <TooltipProvider>
      <WorkflowDetailView application={application} workflowId="workflow-1" canManage={canManage} />
    </TooltipProvider>,
  );
  await screen.findByTestId("workflow-node-model-b");
}

const canvas = () => screen.getByRole("region", { name: "Lienzo del workflow" });
const selectModel = (name: string, ctrlKey = true) =>
  fireEvent.click(screen.getByRole("button", { name: `Modelo ${name} · 1.0.0` }), { ctrlKey });
const deleteNodesButton = () => screen.queryByRole("button", { name: "Eliminar nodos" });

function selectBothModels() {
  selectModel("Hoja", false);
  selectModel("Fruto");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("US-132: deleting several nodes at once", () => {
  it("counts the dependents in the dialog and deletes every node in one operation", async () => {
    let answer: (value: unknown) => void = () => {};
    client.delete.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await renderDetail();

    selectBothModels();
    fireEvent.click(deleteNodesButton() as HTMLElement);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("¿Eliminar 2 nodos?")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "También se eliminarán sus conexiones y las condiciones o salidas que dependen de ellos.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Además se eliminará 1 nodo dependiente: 3 nodos en total."),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar nodos" }));

    expect(await within(dialog).findByRole("button", { name: "Eliminando nodos…" })).toBeTruthy();
    expect(client.delete).toHaveBeenCalledExactlyOnceWith(`${detailUrl}/nodes`, {
      data: { nodeIds: ["model-a", "model-b"], draftRevision: 4 },
    });
    answer({ data: { draft: afterDeletion, draftRevision: 5 } });

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith("Nodos eliminados.");
      expect(screen.queryByTestId("workflow-node-model-a")).toBeNull();
      expect(screen.queryByTestId("workflow-node-model-b")).toBeNull();
      expect(screen.queryByTestId("workflow-node-condition")).toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("workflow-node-image")).toBeTruthy();
    expect(deleteNodesButton()).toBeNull();
  });

  it("leaves the canvas unchanged when the deletion fails", async () => {
    client.delete.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { message: "Internal Server Error" } },
    });
    await renderDetail();

    selectBothModels();
    fireEvent.click(deleteNodesButton() as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar nodos" }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("No pudimos eliminar los nodos."),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toastMock.success).not.toHaveBeenCalled();
    for (const nodeId of ["image", "model-a", "model-b", "condition"])
      expect(screen.getByTestId(`workflow-node-${nodeId}`)).toBeTruthy();
    // The selection stays, so the deletion can be tried again.
    await waitFor(() => expect(deleteNodesButton()).toBeTruthy());
  });

  it("shows the draft conflict notice when someone else changed the draft", async () => {
    client.delete.mockRejectedValueOnce({
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

    selectBothModels();
    fireEvent.click(deleteNodesButton() as HTMLElement);
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Eliminar nodos" }),
    );

    expect(await screen.findByTestId("workflow-draft-conflict")).toBeTruthy();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(screen.getByTestId("workflow-node-model-a")).toBeTruthy();
  });

  it("opens the same dialog with Supr and closes it with Cancelar", async () => {
    await renderDetail();

    selectBothModels();
    fireEvent.keyDown(canvas(), { key: "Delete" });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("¿Eliminar 2 nodos?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("says nothing about dependents when no other node depends on the selection", async () => {
    await renderDetail();

    // Everything but the leaf model and its condition: the image input and the fruit model.
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todo" }));
    fireEvent.click(screen.getByRole("button", { name: "Condición roya ≥ 0,8" }), {
      ctrlKey: true,
    });
    selectModel("Hoja");
    fireEvent.keyDown(canvas(), { key: "Delete" });

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("¿Eliminar 2 nodos?")).toBeTruthy();
    expect(within(dialog).queryByText(/dependiente/)).toBeNull();
  });

  it("keeps the single-node flow when only one node is selected", async () => {
    await renderDetail();

    selectModel("Fruto", false);

    expect(deleteNodesButton()).toBeNull();
    fireEvent.keyDown(canvas(), { key: "Delete" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/¿Eliminar "/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Eliminar nodo" })).toBeTruthy();
  });

  it("does not offer deleting nodes to members", async () => {
    await renderDetail(false);

    fireEvent.keyDown(canvas(), { key: "ArrowRight" });
    fireEvent.keyDown(canvas(), { key: "Delete" });

    expect(deleteNodesButton()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(client.delete).not.toHaveBeenCalled();
  });
});
