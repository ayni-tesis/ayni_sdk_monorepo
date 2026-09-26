"use client";

import { workflowOutputPortType } from "@ayni/api/workflow-graph";
import { IconArrowLeft, IconRefresh, IconX } from "@tabler/icons-react";
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CONDITION_OPERATOR_SYMBOLS,
  setWorkflowPaletteDragData,
  type WorkflowCanvasDraft,
  workflowNodeTitle,
} from "./workflow-canvas";
import { WORKFLOW_PORT_LABELS } from "./workflow-canvas-ports";
import {
  CONDITION_SOURCE_MISSING_MESSAGE,
  searchWorkflowNodeCatalog,
  type WorkflowModelOption,
  type WorkflowNewNode,
  type WorkflowNodeCatalogCategory,
  type WorkflowNodeCatalogItem,
  type WorkflowNodeOrigin,
  workflowConditionSources,
  workflowNodeCatalog,
  workflowOutputSources,
} from "./workflow-node-catalog";

type ConditionOperator = Extract<WorkflowNewNode, { type: "condition" }>["operator"];

const CATEGORIES: { id: WorkflowNodeCatalogCategory; title: string }[] = [
  { id: "input", title: "Entrada" },
  { id: "models", title: "Modelos" },
  { id: "logic", title: "Lógica" },
  { id: "output", title: "Salida" },
];
const OUTPUT_SOURCE_REQUIRED_MESSAGE = "Selecciona un tipo de resultado para la salida.";
const NO_COMPATIBLE_NODES_MESSAGE = "No hay nodos compatibles con esta salida.";
const selectClassName =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50";
// The search field and every item, in order, for the arrow keys.
const FOCUSABLE_ITEMS = "[data-add-node-item]";

export type WorkflowAddNodePanelProps = {
  draft: WorkflowCanvasDraft;
  /** The models of the workflow's application with their versions. */
  models: WorkflowModelOption[];
  modelsLoading: boolean;
  modelsError: string;
  onRetryModels: () => void;
  /** True while a node is being added or positions save or arrange: nothing can be added. */
  busy: boolean;
  /** The output the node is added after (US-128): only compatible types, with it as their source. */
  origin?: WorkflowNodeOrigin;
  onAdd: (node: WorkflowNewNode) => void;
  onClose: () => void;
};

export function WorkflowAddNodePanel({
  draft,
  models,
  modelsLoading,
  modelsError,
  onRetryModels,
  busy,
  origin,
  onAdd,
  onClose,
}: WorkflowAddNodePanelProps) {
  const [query, setQuery] = useState("");
  // A condition or an output asks for its settings before it is added.
  const [form, setForm] = useState<"condition" | "output" | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();

  const catalog = workflowNodeCatalog(draft, models, origin);
  const found = searchWorkflowNodeCatalog(catalog, query);
  const searching = query.trim() !== "";
  const originNode = origin && draft.nodes.find((node) => node.id === origin.sourceNodeId);
  // Models load separately; they matter everywhere except after a port that cannot feed them.
  const offersModels = !origin || workflowOutputPortType(originNode, origin.sourcePort) === "image";
  const noneCompatible =
    origin && catalog.length === 0 && !(offersModels && (modelsLoading || modelsError));

  function choose(item: WorkflowNodeCatalogItem) {
    if (item.disabledReason || busy) return;
    // A model added after the image is connected to it as it is saved.
    if (item.node)
      onAdd(origin && item.node.type === "model.tflite" ? { ...item.node, ...origin } : item.node);
    else if (item.configure) setForm(item.configure);
  }

  // Escape closes the panel; the arrows move between the search field and the items.
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_ITEMS) ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    items[Math.min(items.length - 1, Math.max(0, next))]?.focus();
  }

  return (
    <aside
      ref={panelRef}
      aria-labelledby={titleId}
      className="max-h-[720px] space-y-3 overflow-y-auto rounded-lg border bg-card p-3"
      onKeyDown={handleKeyDown}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 id={titleId} className="font-medium text-sm">
          Agregar nodo
        </h3>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Cerrar Agregar nodo"
          onClick={onClose}
        >
          <IconX aria-hidden className="size-4" />
        </Button>
      </header>
      {origin && (
        <p className="text-muted-foreground text-xs">
          Después de {WORKFLOW_PORT_LABELS[origin.sourcePort] ?? origin.sourcePort}
          {originNode ? ` de ${workflowNodeTitle(originNode)}` : ""}
        </p>
      )}

      {form === "condition" ? (
        <ConditionForm
          draft={draft}
          busy={busy}
          origin={origin}
          onAdd={onAdd}
          onBack={() => setForm(null)}
        />
      ) : form === "output" ? (
        <OutputForm
          draft={draft}
          busy={busy}
          origin={origin}
          onAdd={onAdd}
          onBack={() => setForm(null)}
        />
      ) : noneCompatible ? (
        <p role="status" className="text-muted-foreground text-sm">
          {NO_COMPATIBLE_NODES_MESSAGE}
        </p>
      ) : (
        <>
          <Input
            type="search"
            aria-label="Buscar nodos"
            placeholder="Buscar nodos…"
            autoFocus
            data-add-node-item
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {searching && found.length === 0 && !modelsLoading ? (
            <p role="status" className="text-muted-foreground text-sm">
              No hay nodos que coincidan con &quot;{query.trim()}&quot;.
            </p>
          ) : (
            CATEGORIES.map((category) => {
              const items = found.filter((item) => item.category === category.id);
              const modelState =
                category.id === "models" && offersModels ? (
                  <ModelState
                    models={models}
                    loading={modelsLoading}
                    error={modelsError}
                    searching={searching}
                    listed={items.length > 0}
                    onRetry={onRetryModels}
                  />
                ) : null;
              if (items.length === 0 && (!modelState || searching)) return null;
              return (
                <CatalogCategory key={category.id} title={category.title}>
                  {items.map((item) => (
                    <CatalogItem
                      key={item.key}
                      item={item}
                      busy={busy}
                      // Dropped elsewhere, a node would lose its connection to the port.
                      draggable={!origin}
                      onChoose={choose}
                    />
                  ))}
                  {modelState}
                </CatalogCategory>
              );
            })
          )}
        </>
      )}
    </aside>
  );
}

function CatalogCategory({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="space-y-2 border-t pt-3">
      <h4 id={titleId} className="font-medium text-muted-foreground text-xs uppercase">
        {title}
      </h4>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}

// Disabled items stay focusable, so the keyboard reaches them and reads their reason.
function CatalogItem({
  item,
  busy,
  draggable,
  onChoose,
}: {
  item: WorkflowNodeCatalogItem;
  busy: boolean;
  draggable: boolean;
  onChoose: (item: WorkflowNodeCatalogItem) => void;
}) {
  const id = useId();
  const disabled = Boolean(item.disabledReason) || busy;
  // Only types without settings can be dragged onto the canvas.
  const paletteNode = disabled || !draggable ? undefined : item.node;
  return (
    <li>
      <button
        type="button"
        data-add-node-item
        aria-labelledby={`${id}-name`}
        aria-describedby={
          item.disabledReason ? `${id}-description ${id}-reason` : `${id}-description`
        }
        aria-disabled={disabled}
        draggable={Boolean(paletteNode)}
        className={`flex w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${disabled ? "cursor-not-allowed opacity-60" : paletteNode ? "cursor-grab hover:bg-muted active:cursor-grabbing" : "hover:bg-muted"}`}
        onDragStart={(event) => {
          if (paletteNode) setWorkflowPaletteDragData(event.dataTransfer, paletteNode);
          else event.preventDefault();
        }}
        onClick={() => onChoose(item)}
      >
        <span id={`${id}-name`} className="font-medium text-sm">
          {item.name}
          {item.version && (
            <>
              {" · "}
              <span className="font-mono">{item.version}</span>
            </>
          )}
        </span>
        <span id={`${id}-description`} className="text-muted-foreground text-xs">
          {item.description}
        </span>
        {item.disabledReason && (
          <span id={`${id}-reason`} className="text-xs">
            {item.disabledReason}
          </span>
        )}
      </button>
    </li>
  );
}

/** Loading, errors, and why no model version is listed, below the Modelos items. */
function ModelState({
  models,
  loading,
  error,
  searching,
  listed,
  onRetry,
}: {
  models: WorkflowModelOption[];
  loading: boolean;
  error: string;
  searching: boolean;
  listed: boolean;
  onRetry: () => void;
}) {
  const contracted = models.some((model) => model.versions.some((version) => version.contract));
  const uncontracted = models.some((model) => model.versions.some((version) => !version.contract));
  if (loading)
    return (
      <li role="status" className="text-muted-foreground text-xs">
        Cargando modelos…
      </li>
    );
  return (
    <>
      {error && (
        <li role="alert" className="space-y-2">
          <p className="text-destructive text-xs">{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <IconRefresh className="mr-1 size-4" />
            Reintentar
          </Button>
        </li>
      )}
      {!error && !searching && models.length === 0 && (
        <li className="text-muted-foreground text-xs">No hay modelos registrados</li>
      )}
      {!error && !searching && models.length > 0 && !contracted && (
        <li className="space-y-1 text-muted-foreground text-xs">
          <p>No hay versiones con contrato</p>
          <p>Registra una versión y configura su contrato para usar ese modelo en el workflow.</p>
        </li>
      )}
      {!searching && listed && uncontracted && (
        <li className="text-muted-foreground text-xs">
          Las versiones sin contrato no se pueden agregar al workflow.
        </li>
      )}
    </>
  );
}

function FormHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 border-t pt-3">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Volver a los nodos"
        onClick={onBack}
      >
        <IconArrowLeft aria-hidden className="size-4" />
      </Button>
      <h4 className="font-medium text-sm">{title}</h4>
    </div>
  );
}

type FormProps = {
  draft: WorkflowCanvasDraft;
  busy: boolean;
  /** The output port the node is added after; it fixes the node's source. */
  origin?: WorkflowNodeOrigin;
  onAdd: (node: WorkflowNewNode) => void;
  onBack: () => void;
};

// The same fields and rules as the condition form before US-127.
function ConditionForm({ draft, busy, origin, onAdd, onBack }: FormProps) {
  const fieldId = useId();
  const sources = workflowConditionSources(draft);
  const [sourceId, setSourceId] = useState(origin?.sourceNodeId ?? "");
  const [label, setLabel] = useState("");
  const [operator, setOperator] = useState<ConditionOperator>("gte");
  const [threshold, setThreshold] = useState("0.5");
  // A source deleted from the canvas meanwhile is no longer selected.
  const source = sources.find((node) => node.id === sourceId);
  const labels = source?.outputs.result.labels ?? [];
  const selectedLabel = labels.includes(label) ? label : "";
  const value = Number(threshold);
  const valid =
    source &&
    selectedLabel &&
    threshold.trim() &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;

  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || busy || !source) return;
        onAdd({
          type: "condition",
          sourceNodeId: source.id,
          label: selectedLabel,
          operator,
          threshold: value,
        });
      }}
    >
      <FormHeader title="Condición" onBack={onBack} />
      <label htmlFor={`${fieldId}-source`} className="block text-sm">
        Resultado de origen
      </label>
      <select
        id={`${fieldId}-source`}
        // biome-ignore lint/a11y/noAutofocus: choosing Condición opens this form; its first field takes the focus.
        autoFocus
        className={selectClassName}
        value={source ? sourceId : ""}
        disabled={sources.length === 0 || Boolean(origin)}
        onChange={(event) => {
          setSourceId(event.target.value);
          setLabel("");
        }}
      >
        <option value="">Selecciona una clasificación</option>
        {sources.map((node) => (
          <option key={node.id} value={node.id}>
            {node.modelName} · {node.version}
          </option>
        ))}
      </select>
      {sources.length === 0 && (
        <p role="status" className="text-muted-foreground text-xs">
          {CONDITION_SOURCE_MISSING_MESSAGE}
        </p>
      )}
      <label htmlFor={`${fieldId}-label`} className="block text-sm">
        Etiqueta
      </label>
      <select
        id={`${fieldId}-label`}
        // biome-ignore lint/a11y/noAutofocus: after a port the source is set, so the label comes first.
        autoFocus={Boolean(origin)}
        className={selectClassName}
        value={selectedLabel}
        disabled={!source}
        onChange={(event) => setLabel(event.target.value)}
      >
        <option value="">Selecciona una etiqueta</option>
        {labels.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <label htmlFor={`${fieldId}-operator`} className="block text-sm">
        Operador
      </label>
      <select
        id={`${fieldId}-operator`}
        className={selectClassName}
        value={operator}
        onChange={(event) => setOperator(event.target.value as ConditionOperator)}
      >
        {Object.entries(CONDITION_OPERATOR_SYMBOLS).map(([id, symbol]) => (
          <option key={id} value={id}>
            {symbol}
          </option>
        ))}
      </select>
      <label htmlFor={`${fieldId}-threshold`} className="block text-sm">
        Umbral
      </label>
      <Input
        id={`${fieldId}-threshold`}
        type="number"
        min="0"
        max="1"
        step="0.01"
        value={threshold}
        onChange={(event) => setThreshold(event.target.value)}
      />
      <Button type="submit" size="sm" className="w-full" disabled={busy || !valid}>
        Agregar condición
      </Button>
    </form>
  );
}

// The same fields and rules as the output form before US-127.
function OutputForm({ draft, busy, origin, onAdd, onBack }: FormProps) {
  const fieldId = useId();
  const sources = workflowOutputSources(draft);
  const [name, setName] = useState("");
  // After a port, the result type follows from it.
  const [sourceKey, setSourceKey] = useState(
    origin ? `${origin.sourceNodeId}:${origin.sourcePort}` : "",
  );
  const [sourceError, setSourceError] = useState("");
  const source = sources.find((option) => `${option.id}:${option.port}` === sourceKey);

  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || busy) return;
        if (!source) {
          setSourceError(OUTPUT_SOURCE_REQUIRED_MESSAGE);
          return;
        }
        onAdd({
          type: "output",
          name: name.trim(),
          sourceNodeId: source.id,
          sourcePort: source.port,
          resultType: source.type,
        });
      }}
    >
      <FormHeader title="Salida" onBack={onBack} />
      <label htmlFor={`${fieldId}-name`} className="block text-sm">
        Nombre de salida
      </label>
      <Input
        id={`${fieldId}-name`}
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label htmlFor={`${fieldId}-source`} className="block text-sm">
        Tipo de resultado
      </label>
      <select
        id={`${fieldId}-source`}
        className={selectClassName}
        value={source ? sourceKey : ""}
        disabled={Boolean(origin)}
        aria-invalid={Boolean(sourceError)}
        aria-describedby={sourceError ? `${fieldId}-source-error` : undefined}
        onChange={(event) => {
          setSourceKey(event.target.value);
          if (sourceError) setSourceError("");
        }}
      >
        <option value="">Selecciona un tipo de resultado</option>
        {sources.map((option) => (
          <option key={`${option.id}:${option.port}`} value={`${option.id}:${option.port}`}>
            {option.label}
          </option>
        ))}
      </select>
      {sourceError && (
        <p id={`${fieldId}-source-error`} className="text-destructive text-sm" role="alert">
          {sourceError}
        </p>
      )}
      <Button type="submit" size="sm" className="w-full" disabled={busy || !name.trim()}>
        Agregar salida
      </Button>
    </form>
  );
}
