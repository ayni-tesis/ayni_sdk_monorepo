"use client";

import { IconX } from "@tabler/icons-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CONDITION_OPERATOR_SYMBOLS,
  WORKFLOW_RESULT_TYPE_LABELS,
  type WorkflowCanvasDraft,
  type WorkflowCanvasNode,
  workflowNodeTitle,
} from "./workflow-canvas";

/** The editable settings of a condition or an output; their source stays as it is. */
export type WorkflowNodeChanges =
  | { type: "condition"; label: string; operator: "gte" | "gt" | "lte" | "lt"; threshold: number }
  | { type: "output"; name: string };

type ModelNode = Extract<WorkflowCanvasNode, { type: "model.tflite" }>;
type ConditionOperator = Extract<WorkflowCanvasNode, { type: "condition" }>["operator"];

const NORMALIZATION_LABELS: Record<string, string> = {
  none: "Sin normalización",
  zero_to_one: "0 a 1",
  minus_one_to_one: "-1 a 1",
};
const decimalFormat = new Intl.NumberFormat("es", { maximumFractionDigits: 20 });
const selectClassName =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50";

function modelInputSummary({ inputs: { image } }: ModelNode) {
  return `Imagen ${image.width} × ${image.height} · ${image.channels} canales · ${NORMALIZATION_LABELS[image.normalization] ?? image.normalization}`;
}

function modelOutputSummary({ outputs: { result } }: ModelNode) {
  return result.type === "classification"
    ? `Clasificación: ${result.labels.join(", ")}`
    : `Detección: ${result.labels.join(", ")} · umbral ${decimalFormat.format(result.scoreThreshold)}`;
}

/** The form's values, as typed, for the node types that have editable settings. */
function initialForm(node: WorkflowCanvasNode) {
  return {
    label: node.type === "condition" ? node.label : "",
    operator: node.type === "condition" ? node.operator : ("gte" as ConditionOperator),
    threshold: node.type === "condition" ? String(node.threshold) : "",
    name: node.type === "output" ? node.name : "",
  };
}

/** The changes the form holds, or `null` when they are invalid or the node has none to edit. */
function formChanges(
  node: WorkflowCanvasNode,
  form: ReturnType<typeof initialForm>,
): WorkflowNodeChanges | null {
  if (node.type === "condition") {
    const threshold = Number(form.threshold);
    if (!form.label || !form.threshold.trim() || !(threshold >= 0 && threshold <= 1)) return null;
    return { type: "condition", label: form.label, operator: form.operator, threshold };
  }
  if (node.type === "output") {
    const name = form.name.trim();
    return name ? { type: "output", name } : null;
  }
  return null;
}

function changesDiffer(node: WorkflowCanvasNode, changes: WorkflowNodeChanges | null) {
  if (!changes) return true;
  if (node.type === "condition" && changes.type === "condition")
    return (
      changes.label !== node.label ||
      changes.operator !== node.operator ||
      changes.threshold !== node.threshold
    );
  if (node.type === "output" && changes.type === "output") return changes.name !== node.name;
  return false;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export type WorkflowNodeDetailsPanelProps = {
  node: WorkflowCanvasNode;
  draft: WorkflowCanvasDraft;
  /** False for members and archived applications: the panel is read-only. */
  canManage: boolean;
  saving: boolean;
  onSave: (changes: WorkflowNodeChanges) => void;
  /** Cancelar and the close button; the caller confirms discarding unsaved changes. */
  onClose: () => void;
  /** Whether the form differs from the saved node. */
  onDirtyChange: (dirty: boolean) => void;
};

// Mount one panel per node (key it by node id) so the form starts from that node.
export function WorkflowNodeDetailsPanel({
  node,
  draft,
  canManage,
  saving,
  onSave,
  onClose,
  onDirtyChange,
}: WorkflowNodeDetailsPanelProps) {
  const [form, setForm] = useState(() => initialForm(node));
  const fieldId = useId();
  const editable = canManage && (node.type === "condition" || node.type === "output");
  const changes = formChanges(node, form);
  const dirty = editable && changesDiffer(node, changes);
  const disabled = !canManage || saving;

  // A closed panel, or one whose node was deleted, holds no changes.
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const source =
    node.type === "condition"
      ? draft.nodes.find(
          (item): item is ModelNode =>
            item.id === node.sourceNodeId && item.type === "model.tflite",
        )
      : undefined;
  const sourceLabels =
    source?.outputs.result.type === "classification" ? source.outputs.result.labels : [];
  // The saved label stays selectable even if the source no longer declares it.
  const labelOptions =
    node.type === "condition" && !sourceLabels.includes(node.label)
      ? [node.label, ...sourceLabels]
      : sourceLabels;

  return (
    <aside
      aria-label="Detalles del nodo"
      className="max-h-[720px] space-y-4 overflow-y-auto rounded-lg border bg-card p-3"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium text-sm">Detalles del nodo</h3>
          <p className="truncate text-muted-foreground text-xs">{workflowNodeTitle(node)}</p>
          {!canManage && (
            <span className="inline-block rounded border px-1.5 py-0.5 text-muted-foreground text-xs">
              Solo lectura
            </span>
          )}
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Cerrar detalles del nodo"
          disabled={saving}
          onClick={onClose}
        >
          <IconX aria-hidden className="size-4" />
        </Button>
      </header>

      {node.type === "model.tflite" && (
        <dl className="space-y-3">
          <Field label="Modelo">{node.modelName}</Field>
          <Field label="Versión">
            <span className="font-mono">{node.version}</span>
          </Field>
          <Field label="Entrada">{modelInputSummary(node)}</Field>
          <Field label="Salida">{modelOutputSummary(node)}</Field>
        </dl>
      )}

      {node.type === "input.image" && (
        <dl className="space-y-3">
          <Field label="Salida">imagen</Field>
        </dl>
      )}

      {(node.type === "condition" || node.type === "output") && (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (editable && dirty && changes && !saving) onSave(changes);
          }}
        >
          {node.type === "condition" ? (
            <>
              {source && (
                <dl>
                  <Field label="Resultado de origen">
                    {source.modelName} · <span className="font-mono">{source.version}</span>
                  </Field>
                </dl>
              )}
              <div className="space-y-1">
                <label htmlFor={`${fieldId}-label`} className="block text-sm">
                  Etiqueta
                </label>
                <select
                  id={`${fieldId}-label`}
                  className={selectClassName}
                  value={form.label}
                  disabled={disabled}
                  onChange={(event) => setForm({ ...form, label: event.target.value })}
                >
                  {labelOptions.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor={`${fieldId}-operator`} className="block text-sm">
                  Operador
                </label>
                <select
                  id={`${fieldId}-operator`}
                  className={selectClassName}
                  value={form.operator}
                  disabled={disabled}
                  onChange={(event) =>
                    setForm({ ...form, operator: event.target.value as ConditionOperator })
                  }
                >
                  {Object.entries(CONDITION_OPERATOR_SYMBOLS).map(([operator, symbol]) => (
                    <option key={operator} value={operator}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor={`${fieldId}-threshold`} className="block text-sm">
                  Umbral
                </label>
                <Input
                  id={`${fieldId}-threshold`}
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={form.threshold}
                  disabled={disabled}
                  onChange={(event) => setForm({ ...form, threshold: event.target.value })}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label htmlFor={`${fieldId}-name`} className="block text-sm">
                  Nombre de salida
                </label>
                <Input
                  id={`${fieldId}-name`}
                  value={form.name}
                  disabled={disabled}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <dl>
                <Field label="Tipo de resultado">
                  {WORKFLOW_RESULT_TYPE_LABELS[node.resultType]}
                </Field>
              </dl>
            </>
          )}
          {editable && (
            <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={saving || !dirty || !changes}>
                {saving ? "Guardando cambios…" : "Guardar cambios del nodo"}
              </Button>
            </div>
          )}
        </form>
      )}
    </aside>
  );
}
