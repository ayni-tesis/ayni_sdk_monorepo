// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowCanvasDraft, WorkflowCanvasNode } from "./workflow-canvas";
import { WorkflowNodeDetailsPanel } from "./workflow-node-details-panel";

const modelNode: Extract<WorkflowCanvasNode, { type: "model.tflite" }> = {
  id: "model",
  type: "model.tflite",
  modelVersionId: "model-version",
  modelName: "Clasificador de hojas",
  version: "1.2.0",
  inputs: {
    image: { type: "image", width: 224, height: 224, channels: 3, normalization: "zero_to_one" },
  },
  outputs: { result: { type: "classification", labels: ["roya", "sana"] } },
};
const conditionNode: Extract<WorkflowCanvasNode, { type: "condition" }> = {
  id: "condition",
  type: "condition",
  sourceNodeId: "model",
  label: "roya",
  operator: "gte",
  threshold: 0.5,
  branches: { true: "Verdadero", false: "Falso" },
};
const outputNode: Extract<WorkflowCanvasNode, { type: "output" }> = {
  id: "output",
  type: "output",
  name: "Con roya",
  sourceNodeId: "condition",
  sourcePort: "true",
  resultType: "boolean",
};
const draft: WorkflowCanvasDraft = { nodes: [modelNode, conditionNode, outputNode] };

function renderPanel({
  node = conditionNode,
  canManage = true,
  saving = false,
}: {
  node?: WorkflowCanvasNode;
  canManage?: boolean;
  saving?: boolean;
} = {}) {
  const handlers = { onSave: vi.fn(), onClose: vi.fn(), onDirtyChange: vi.fn() };
  render(
    <WorkflowNodeDetailsPanel
      node={node}
      draft={draft}
      canManage={canManage}
      saving={saving}
      {...handlers}
    />,
  );
  return { panel: screen.getByRole("complementary", { name: "Detalles del nodo" }), ...handlers };
}

describe("WorkflowNodeDetailsPanel", () => {
  afterEach(cleanup);

  it("edits a condition's label, operator, and threshold with the source's labels", () => {
    const { panel, onSave, onDirtyChange } = renderPanel();
    const save = within(panel).getByRole("button", { name: "Guardar cambios del nodo" });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(
      within(within(panel).getByLabelText("Etiqueta"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["roya", "sana"]);

    fireEvent.change(within(panel).getByLabelText("Umbral"), { target: { value: "0.8" } });
    fireEvent.change(within(panel).getByLabelText("Operador"), { target: { value: "lt" } });
    fireEvent.change(within(panel).getByLabelText("Etiqueta"), { target: { value: "sana" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(save);

    expect(onSave).toHaveBeenCalledWith({
      type: "condition",
      label: "sana",
      operator: "lt",
      threshold: 0.8,
    });
  });

  it("offers no save for a threshold outside 0 to 1 and reports an undone edit as clean", () => {
    const { panel, onDirtyChange } = renderPanel();
    const threshold = within(panel).getByLabelText("Umbral");
    const save = within(panel).getByRole("button", { name: "Guardar cambios del nodo" });

    fireEvent.change(threshold, { target: { value: "1.5" } });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.change(threshold, { target: { value: "0.5" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(save.hasAttribute("disabled")).toBe(true);
  });

  it("edits an output's name and saves it trimmed", () => {
    const { panel, onSave } = renderPanel({ node: outputNode });
    const name = within(panel).getByLabelText("Nombre de salida");
    const save = within(panel).getByRole("button", { name: "Guardar cambios del nodo" });

    fireEvent.change(name, { target: { value: "   " } });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.change(name, { target: { value: " Hoja enferma " } });
    fireEvent.click(save);

    expect(onSave).toHaveBeenCalledWith({ type: "output", name: "Hoja enferma" });
  });

  it("shows Guardando cambios… and locks the form while it saves", () => {
    const { panel } = renderPanel({ saving: true });

    expect(
      within(panel).getByRole("button", { name: "Guardando cambios…" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(within(panel).getByLabelText("Umbral").hasAttribute("disabled")).toBe(true);
    expect(within(panel).getByRole("button", { name: "Cancelar" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("shows a model's version and contract without letting them change", () => {
    const { panel } = renderPanel({ node: modelNode });

    expect(within(panel).getByText("Clasificador de hojas")).toBeTruthy();
    expect(within(panel).getByText("1.2.0")).toBeTruthy();
    expect(within(panel).getByText("Imagen 224 × 224 · 3 canales · 0 a 1")).toBeTruthy();
    expect(within(panel).getByText("Clasificación: roya, sana")).toBeTruthy();
    expect(within(panel).queryByRole("textbox")).toBeNull();
    expect(within(panel).queryByRole("combobox")).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Guardar cambios del nodo" })).toBeNull();
  });

  it("shows a member the configuration read-only, with nothing to save", () => {
    const { panel } = renderPanel({ canManage: false });

    expect(within(panel).getByText("Solo lectura")).toBeTruthy();
    expect(within(panel).getByLabelText("Umbral").hasAttribute("disabled")).toBe(true);
    expect(within(panel).getByLabelText("Etiqueta").hasAttribute("disabled")).toBe(true);
    expect(within(panel).queryByRole("button", { name: "Guardar cambios del nodo" })).toBeNull();
  });

  it("asks to close from Cancelar and from its close button", () => {
    const { panel, onClose } = renderPanel();

    fireEvent.click(within(panel).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar detalles del nodo" }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
