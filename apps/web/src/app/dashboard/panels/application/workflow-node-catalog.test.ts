import { describe, expect, it } from "vitest";
import type { WorkflowCanvasDraft, WorkflowCanvasNode } from "./workflow-canvas";
import {
  searchWorkflowNodeCatalog,
  type WorkflowModelVersionContract,
  workflowNodeCatalog,
} from "./workflow-node-catalog";

const image: WorkflowCanvasNode = {
  id: "image",
  type: "input.image",
  outputs: { imagen: "image" },
};

const empty: WorkflowCanvasDraft = { nodes: [] };
const imageContract = {
  type: "image",
  width: 224,
  height: 224,
  channels: 3,
  normalization: "zero_to_one",
} as const;
const classification: WorkflowModelVersionContract = {
  input: imageContract,
  output: { type: "classification", labels: ["sana", "roya"] },
};
const detection: WorkflowModelVersionContract = {
  input: imageContract,
  output: { type: "detection", labels: ["broca"], scoreThreshold: 0.5 },
};
const modelNode = (id: string, contract: WorkflowModelVersionContract): WorkflowCanvasNode => ({
  id,
  type: "model.tflite",
  modelVersionId: `${id}-version`,
  modelName: id,
  version: "1.0.0",
  inputs: { image: { ...imageContract } },
  outputs: { result: contract.output },
});

describe("workflowNodeCatalog", () => {
  it("offers the image input until the workflow has one", () => {
    const [available] = workflowNodeCatalog(empty, []).filter((item) => item.category === "input");
    expect(available).toMatchObject({ name: "Entrada de imagen", disabledReason: undefined });

    const [taken] = workflowNodeCatalog({ nodes: [image] }, []).filter(
      (item) => item.category === "input",
    );
    expect(taken.disabledReason).toBe("Este workflow ya tiene una entrada de imagen.");
  });

  it("lists only the model versions that have a contract, by model name and version", () => {
    const models = workflowNodeCatalog(empty, [
      {
        id: "leaf",
        name: "Clasificador de hojas",
        versions: [
          { id: "leaf-1", version: "1.0.0", contract: classification },
          { id: "leaf-2", version: "2.0.0", contract: null },
        ],
      },
      {
        id: "pests",
        name: "Detector de plagas",
        versions: [{ id: "pests-1", version: "0.1.0", contract: detection }],
      },
    ]).filter((item) => item.category === "models");

    expect(models).toMatchObject([
      {
        name: "Clasificador de hojas",
        version: "1.0.0",
        description: "Clasifica la imagen con un modelo TensorFlow Lite.",
        node: { type: "model.tflite", modelVersionId: "leaf-1" },
      },
      {
        name: "Detector de plagas",
        version: "0.1.0",
        description: "Detecta objetos en la imagen con un modelo TensorFlow Lite.",
        node: { type: "model.tflite", modelVersionId: "pests-1" },
      },
    ]);
  });

  it("asks for a source on the canvas before offering a condition or an output", () => {
    const configured = (draft: WorkflowCanvasDraft) =>
      workflowNodeCatalog(draft, []).filter(
        (item) => item.category === "logic" || item.category === "output",
      );

    expect(configured(empty)).toMatchObject([
      {
        name: "Condición",
        configure: "condition",
        disabledReason:
          "Agrega primero al lienzo una versión contratada de un modelo de clasificación.",
      },
      {
        name: "Salida",
        configure: "output",
        disabledReason: "Agrega primero al lienzo un modelo o una condición.",
      },
    ]);
    // A detection result feeds an output, never a condition.
    expect(
      configured({ nodes: [modelNode("detector", detection)] }).map((item) => item.disabledReason),
    ).toEqual([
      "Agrega primero al lienzo una versión contratada de un modelo de clasificación.",
      undefined,
    ]);
    expect(
      configured({ nodes: [modelNode("leaf", classification)] }).map((item) => item.disabledReason),
    ).toEqual([undefined, undefined]);
  });
});

describe("searchWorkflowNodeCatalog", () => {
  const catalog = workflowNodeCatalog(empty, [
    {
      id: "leaf",
      name: "Clasificador de hojas",
      versions: [{ id: "leaf-1", version: "1.0.0", contract: classification }],
    },
    {
      id: "pests",
      name: "Plagas",
      versions: [{ id: "pests-1", version: "0.1.0", contract: detection }],
    },
  ]);
  const found = (query: string) =>
    searchWorkflowNodeCatalog(catalog, query).map((item) => item.version ?? item.name);

  it("finds a model by its name, ignoring case and accents", () => {
    expect(found("HOJAS")).toEqual(["1.0.0"]);
    expect(found("plágas")).toEqual(["0.1.0"]);
  });

  it("finds every model by the type name and a type by its own name", () => {
    expect(found("modelo")).toEqual(["1.0.0", "0.1.0"]);
    expect(found("condicion")).toEqual(["Condición"]);
    expect(found("  salida ")).toEqual(["Salida"]);
  });

  it("finds a type by its description", () => {
    expect(found("detecta objetos")).toEqual(["0.1.0"]);
    expect(found("imagen que procesa")).toEqual(["Entrada de imagen"]);
  });

  it("keeps every type for an empty search and none for an unknown word", () => {
    expect(found("")).toHaveLength(catalog.length);
    expect(found("xyz")).toEqual([]);
  });
});
