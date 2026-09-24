import { describe, expect, it } from "vitest";

import type { WorkflowConnection, WorkflowDraft, WorkflowNode } from "./workflow-store";
import { validateWorkflowDraft } from "./workflow-validation";

const input: WorkflowNode = { id: "input", type: "input.image", outputs: { imagen: "image" } };
const classifier: WorkflowNode = {
  id: "classifier",
  type: "model.tflite",
  modelVersionId: "version-1",
  modelName: "Clasificador",
  version: "1.0.0",
  inputs: {
    image: { type: "image", width: 224, height: 224, channels: 3, normalization: "zero_to_one" },
  },
  outputs: { result: { type: "classification", labels: ["sana", "roya"] } },
};
const detector: WorkflowNode = {
  id: "detector",
  type: "model.tflite",
  modelVersionId: "version-2",
  modelName: "Detector",
  version: "2.0.0",
  inputs: {
    image: { type: "image", width: 320, height: 320, channels: 3, normalization: "none" },
  },
  outputs: { result: { type: "detection", labels: ["hoja"], scoreThreshold: 0.5 } },
};
const condition: WorkflowNode = {
  id: "condition",
  type: "condition",
  sourceNodeId: "classifier",
  label: "sana",
  operator: "gte",
  threshold: 0.8,
  branches: { true: "Verdadero", false: "Falso" },
};
const diagnosis: WorkflowNode = {
  id: "diagnosis",
  type: "output",
  name: "Diagnóstico",
  sourceNodeId: "classifier",
  sourcePort: "result",
  resultType: "classification",
};
const healthy: WorkflowNode = {
  id: "healthy",
  type: "output",
  name: "Hoja sana",
  sourceNodeId: "condition",
  sourcePort: "true",
  resultType: "boolean",
};
const inputToClassifier: WorkflowConnection = {
  sourceNodeId: "input",
  sourcePort: "imagen",
  targetNodeId: "classifier",
  targetPort: "image",
};

describe("validateWorkflowDraft", () => {
  it("confirms that a complete DAG with an input, connected nodes and a reachable output is publishable", () => {
    const draft: WorkflowDraft = {
      nodes: [input, classifier, condition, diagnosis, healthy],
      connections: [inputToClassifier],
    };

    expect(validateWorkflowDraft(draft)).toEqual({ publishable: true, errors: [] });
  });

  it("reports the node and port of a required input left unconnected and marks the draft unpublishable", () => {
    const draft: WorkflowDraft = {
      nodes: [input, classifier, diagnosis],
      connections: [],
    };

    const result = validateWorkflowDraft(draft);

    expect(result.publishable).toBe(false);
    expect(result.errors).toContainEqual({
      code: "requiredInput",
      nodeId: "classifier",
      nodeName: "Clasificador",
      port: "image",
      message: 'El nodo "Clasificador" necesita una imagen de entrada.',
    });
  });

  it("reports an output that cannot be reached from the image input", () => {
    const draft: WorkflowDraft = {
      nodes: [input, classifier, diagnosis],
      connections: [],
    };

    expect(validateWorkflowDraft(draft).errors).toContainEqual({
      code: "unreachableOutput",
      nodeId: "diagnosis",
      nodeName: "Diagnóstico",
      port: "source",
      message: 'La salida "Diagnóstico" no es alcanzable desde la entrada de imagen.',
    });
  });

  it("requires an image input and at least one output", () => {
    const result = validateWorkflowDraft({ nodes: [classifier] });

    expect(result.publishable).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        {
          code: "missingInput",
          nodeId: null,
          nodeName: null,
          port: null,
          message: "El workflow necesita un nodo de entrada de imagen.",
        },
        {
          code: "missingOutput",
          nodeId: null,
          nodeName: null,
          port: null,
          message: "El workflow necesita al menos un nodo de salida.",
        },
      ]),
    );
  });

  it("reports every node involved in a cycle", () => {
    const second: WorkflowNode = { ...classifier, id: "second", modelName: "Segundo" };
    const draft: WorkflowDraft = {
      nodes: [input, classifier, second, diagnosis],
      connections: [
        inputToClassifier,
        {
          sourceNodeId: "classifier",
          sourcePort: "result",
          targetNodeId: "second",
          targetPort: "image",
        },
        {
          sourceNodeId: "second",
          sourcePort: "result",
          targetNodeId: "classifier",
          targetPort: "image",
        },
      ],
    };

    const cycleErrors = validateWorkflowDraft(draft).errors.filter(
      (error) => error.code === "cycle",
    );

    expect(cycleErrors.map((error) => error.nodeId).sort()).toEqual(["classifier", "second"]);
    expect(cycleErrors).toContainEqual({
      code: "cycle",
      nodeId: "second",
      nodeName: "Segundo",
      port: null,
      message: 'El nodo "Segundo" forma parte de un ciclo.',
    });
  });

  it("does not report nodes downstream of a cycle as part of it", () => {
    const second: WorkflowNode = { ...classifier, id: "second", modelName: "Segundo" };
    const downstream: WorkflowNode = { ...diagnosis, id: "downstream", sourceNodeId: "second" };
    const draft: WorkflowDraft = {
      nodes: [input, classifier, second, downstream],
      connections: [
        {
          sourceNodeId: "classifier",
          sourcePort: "result",
          targetNodeId: "second",
          targetPort: "image",
        },
        {
          sourceNodeId: "second",
          sourcePort: "result",
          targetNodeId: "classifier",
          targetPort: "image",
        },
      ],
    };

    const cycleNodeIds = validateWorkflowDraft(draft)
      .errors.filter((error) => error.code === "cycle")
      .map((error) => error.nodeId);

    expect(cycleNodeIds).not.toContain("downstream");
  });

  it("reports a connection whose types are incompatible on the target port", () => {
    const draft: WorkflowDraft = {
      nodes: [input, classifier, detector, diagnosis],
      connections: [
        inputToClassifier,
        {
          sourceNodeId: "classifier",
          sourcePort: "result",
          targetNodeId: "detector",
          targetPort: "image",
        },
      ],
    };

    expect(validateWorkflowDraft(draft).errors).toContainEqual({
      code: "incompatibleType",
      nodeId: "detector",
      nodeName: "Detector",
      port: "image",
      message: 'El nodo "Detector" recibe un tipo incompatible en este puerto.',
    });
  });

  it("reports outputs and conditions whose source result type does not match", () => {
    const wrongOutput: WorkflowNode = {
      ...diagnosis,
      id: "wrong-output",
      name: "Detecciones",
      resultType: "detection",
    };
    const wrongCondition: WorkflowNode = {
      ...condition,
      id: "wrong-condition",
      sourceNodeId: "detector",
    };
    const draft: WorkflowDraft = {
      nodes: [input, classifier, detector, wrongOutput, wrongCondition],
      connections: [inputToClassifier, { ...inputToClassifier, targetNodeId: "detector" }],
    };

    const errors = validateWorkflowDraft(draft).errors;

    expect(errors).toContainEqual({
      code: "incompatibleType",
      nodeId: "wrong-output",
      nodeName: "Detecciones",
      port: "source",
      message: 'El nodo "Detecciones" recibe un tipo incompatible en este puerto.',
    });
    expect(errors).toContainEqual({
      code: "incompatibleType",
      nodeId: "wrong-condition",
      nodeName: "Condición: sana",
      port: "source",
      message: 'El nodo "Condición: sana" recibe un tipo incompatible en este puerto.',
    });
  });

  it("reports sources that reference nodes missing from the draft", () => {
    const orphan: WorkflowNode = {
      ...diagnosis,
      id: "orphan",
      name: "Huérfana",
      sourceNodeId: "gone",
    };
    const draft: WorkflowDraft = {
      nodes: [input, classifier, diagnosis, orphan],
      connections: [
        inputToClassifier,
        { ...inputToClassifier, sourceNodeId: "deleted", targetNodeId: "classifier" },
        { ...inputToClassifier, sourceNodeId: "also-deleted", targetNodeId: "classifier" },
      ],
    };

    const errors = validateWorkflowDraft(draft).errors;

    expect(errors).toContainEqual({
      code: "missingSource",
      nodeId: "orphan",
      nodeName: "Huérfana",
      port: "source",
      message: 'El nodo "Huérfana" necesita un resultado de origen.',
    });
    expect(errors).toContainEqual({
      code: "missingSource",
      nodeId: "classifier",
      nodeName: "Clasificador",
      port: "image",
      message: 'El nodo "Clasificador" recibe una conexión desde un nodo que ya no existe.',
    });
    expect(errors.filter((error) => error.nodeId === "orphan")).toHaveLength(1);
    expect(errors.filter((error) => error.nodeId === "classifier")).toHaveLength(1);
  });

  it("reports a connection to a node missing from the draft on its source port", () => {
    const draft: WorkflowDraft = {
      nodes: [input, classifier, diagnosis],
      connections: [inputToClassifier, { ...inputToClassifier, targetNodeId: "deleted" }],
    };

    const result = validateWorkflowDraft(draft);

    expect(result.publishable).toBe(false);
    expect(result.errors).toEqual([
      {
        code: "missingTarget",
        nodeId: "input",
        nodeName: "Imagen de entrada",
        port: "imagen",
        message: 'El nodo "Imagen de entrada" tiene una conexión hacia un nodo que ya no existe.',
      },
    ]);
  });

  it("does not modify the draft", () => {
    const draft: WorkflowDraft = {
      nodes: [input, classifier, diagnosis],
      connections: [],
      layout: { input: { x: 10, y: 20 } },
    };
    const snapshot = structuredClone(draft);

    validateWorkflowDraft(draft);

    expect(draft).toEqual(snapshot);
  });
});
