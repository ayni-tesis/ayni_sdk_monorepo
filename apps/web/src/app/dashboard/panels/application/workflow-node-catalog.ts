import { workflowOutputPortType } from "@ayni/api/workflow-graph";
import type {
  WorkflowCanvasDraft,
  WorkflowCanvasNode,
  WorkflowPaletteNode,
} from "./workflow-canvas";

export const IMAGE_INPUT_EXISTS_MESSAGE = "Este workflow ya tiene una entrada de imagen.";

export type WorkflowModelVersionContract = {
  input: { type: "image"; width: number; height: number; channels: number; normalization: string };
  output:
    | { type: "classification"; labels: string[] }
    | { type: "detection"; labels: string[]; scoreThreshold: number };
};

/** A model of the workflow's application with its versions. */
export type WorkflowModelOption = {
  id: string;
  name: string;
  versions: { id: string; version: string; contract: WorkflowModelVersionContract | null }[];
};

export type WorkflowNodeCatalogCategory = "input" | "models" | "logic" | "output";

/** One type the Agregar nodo panel offers. */
export type WorkflowNodeCatalogItem = {
  key: string;
  category: WorkflowNodeCatalogCategory;
  /** The node type, such as `Modelo`; the same as `name` except for models. */
  typeName: string;
  name: string;
  /** A model's version, shown next to its name. */
  version?: string;
  description: string;
  /** Why the type cannot be added now; the panel shows it disabled. */
  disabledReason?: string;
  /** The node added as soon as the item is chosen, for types without settings. */
  node?: WorkflowPaletteNode;
  /** The form the panel shows first, for types with settings. */
  configure?: "condition" | "output";
};

type ModelNode = Extract<WorkflowCanvasNode, { type: "model.tflite" }>;
type ConditionNode = Extract<WorkflowCanvasNode, { type: "condition" }>;
type OutputNode = Extract<WorkflowCanvasNode, { type: "output" }>;

/** The output port a node is added after (US-128); it becomes the new node's source. */
export type WorkflowNodeOrigin = { sourceNodeId: string; sourcePort: string };

/** A node to add, as the server creates it; the canvas decides its position. */
export type WorkflowNewNode =
  | WorkflowPaletteNode
  // A model added after the image output is saved together with its connection.
  | (Extract<WorkflowPaletteNode, { type: "model.tflite" }> & WorkflowNodeOrigin)
  | Pick<ConditionNode, "type" | "sourceNodeId" | "label" | "operator" | "threshold">
  | Pick<OutputNode, "type" | "name" | "sourceNodeId" | "sourcePort" | "resultType">;

/** A result an output can take: a model's result or one branch of a condition. */
export type WorkflowOutputSource = {
  id: string;
  port: "result" | "true" | "false";
  type: "classification" | "detection" | "boolean";
  label: string;
};

const MODEL_DESCRIPTIONS = {
  classification: "Clasifica la imagen con un modelo TensorFlow Lite.",
  detection: "Detecta objetos en la imagen con un modelo TensorFlow Lite.",
} as const;
export const CONDITION_SOURCE_MISSING_MESSAGE =
  "Agrega primero al lienzo una versión contratada de un modelo de clasificación.";
const OUTPUT_SOURCE_MISSING_MESSAGE = "Agrega primero al lienzo un modelo o una condición.";

/** The classification models on the canvas, which a condition can read. */
export function workflowConditionSources(draft: WorkflowCanvasDraft): ModelNode[] {
  return draft.nodes.filter(
    (node): node is ModelNode =>
      node.type === "model.tflite" && node.outputs.result.type === "classification",
  );
}

export function workflowOutputSources(draft: WorkflowCanvasDraft): WorkflowOutputSource[] {
  return draft.nodes.flatMap((node): WorkflowOutputSource[] => {
    if (node.type === "model.tflite")
      return [
        {
          id: node.id,
          port: "result",
          type: node.outputs.result.type,
          label: `${node.modelName} · ${node.version} · ${node.outputs.result.type}`,
        },
      ];
    if (node.type === "condition")
      return [
        {
          id: node.id,
          port: "true",
          type: "boolean",
          label: `Condición: ${node.label} · Verdadero`,
        },
        { id: node.id, port: "false", type: "boolean", label: `Condición: ${node.label} · Falso` },
      ];
    return [];
  });
}

/**
 * The types Agregar nodo offers. After an output port (`origin`), only the types
 * that port can feed, with the DAG's rules: models after the image, conditions
 * and outputs after a classification result, and outputs after a detection
 * result or a condition branch.
 */
export function workflowNodeCatalog(
  draft: WorkflowCanvasDraft,
  models: WorkflowModelOption[],
  origin?: WorkflowNodeOrigin,
): WorkflowNodeCatalogItem[] {
  const catalog = fullWorkflowNodeCatalog(draft, models);
  if (!origin) return catalog;
  const source = draft.nodes.find((node) => node.id === origin.sourceNodeId);
  const type = workflowOutputPortType(source, origin.sourcePort);
  const accepted: WorkflowNodeCatalogCategory[] =
    type === "image"
      ? ["models"]
      : type === "classification"
        ? ["logic", "output"]
        : type === "detection" || type === "boolean"
          ? ["output"]
          : [];
  // The port itself is the source, so nothing is missing from the canvas.
  return catalog
    .filter((item) => accepted.includes(item.category))
    .map((item) => ({ ...item, disabledReason: undefined }));
}

function fullWorkflowNodeCatalog(
  draft: WorkflowCanvasDraft,
  models: WorkflowModelOption[],
): WorkflowNodeCatalogItem[] {
  return [
    {
      key: "input.image",
      category: "input",
      typeName: "Entrada de imagen",
      name: "Entrada de imagen",
      description: "Recibe la imagen que procesa el workflow.",
      disabledReason: draft.nodes.some((node) => node.type === "input.image")
        ? IMAGE_INPUT_EXISTS_MESSAGE
        : undefined,
      node: { type: "input.image" },
    },
    // Versions without a contract have no ports, so they never reach the list.
    ...models.flatMap((model) =>
      model.versions.flatMap(({ id, version, contract }): WorkflowNodeCatalogItem[] =>
        contract
          ? [
              {
                key: `model:${id}`,
                category: "models",
                typeName: "Modelo",
                name: model.name,
                version,
                description: MODEL_DESCRIPTIONS[contract.output.type],
                node: { type: "model.tflite", modelVersionId: id },
              },
            ]
          : [],
      ),
    ),
    {
      key: "condition",
      category: "logic",
      typeName: "Condición",
      name: "Condición",
      description: "Divide el flujo según el puntaje de una etiqueta.",
      disabledReason:
        workflowConditionSources(draft).length === 0 ? CONDITION_SOURCE_MISSING_MESSAGE : undefined,
      configure: "condition",
    },
    {
      key: "output",
      category: "output",
      typeName: "Salida",
      name: "Salida",
      description: "Devuelve un resultado del workflow a la aplicación.",
      disabledReason:
        workflowOutputSources(draft).length === 0 ? OUTPUT_SOURCE_MISSING_MESSAGE : undefined,
      configure: "output",
    },
  ];
}

/** Lowercase and without accents, so `Condición` and `condicion` read the same. */
function searchable(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** The items whose type name, model name, or description contain the query. */
export function searchWorkflowNodeCatalog(
  items: WorkflowNodeCatalogItem[],
  query: string,
): WorkflowNodeCatalogItem[] {
  const words = searchable(query.trim());
  if (!words) return items;
  return items.filter((item) =>
    [item.typeName, item.name, item.description].some((text) => searchable(text).includes(words)),
  );
}
