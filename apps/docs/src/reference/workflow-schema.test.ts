import { describe, expect, it } from "vitest";
import {
  serverNodeFields,
  serverWorkflowStoreSource,
  validationRejections,
  validatorNodeFields,
  validatorSource,
} from "./workflow-schema";

describe("validatorNodeFields", () => {
  it("reads the fields of each node type from the validator's _nodeFields", () => {
    const source = `
class WorkflowDefinitionValidator {
  static const _nodeTypes = {'a'};

  /// The exact fields.
  static const _nodeFields = {
    'input.image': {'id', 'type', 'outputs'},
    'model.tflite': {
      'id',
      'type',
      'inputs',
    },
  };
  static const _connectionFields = {'sourceNodeId'};
}`;

    expect(validatorNodeFields(source)).toEqual({
      "input.image": ["id", "type", "outputs"],
      "model.tflite": ["id", "type", "inputs"],
    });
  });

  it("fails when the source has no _nodeFields", () => {
    expect(() => validatorNodeFields("class A {}")).toThrow(/_nodeFields/);
  });

  it("reads the four node types the SDK runs", () => {
    expect(Object.keys(validatorNodeFields(validatorSource))).toEqual([
      "input.image",
      "model.tflite",
      "condition",
      "output",
    ]);
  });
});

describe("serverNodeFields", () => {
  it("reads the fields of each member of the WorkflowNode union", () => {
    const source = `
export type Other = { id: string };
export type WorkflowNode =
  | { id: string; type: "input.image"; outputs: { imagen: "image" } }
  | {
      id: string;
      type: "output";
      name: string;
    };`;

    expect(serverNodeFields(source)).toEqual({
      "input.image": ["id", "type", "outputs"],
      output: ["id", "type", "name"],
    });
  });

  it("fails when the source has no WorkflowNode union", () => {
    expect(() => serverNodeFields("export type Other = { id: string };")).toThrow(/WorkflowNode/);
  });

  it("agrees with the validator on the published node types and fields", () => {
    const server = serverNodeFields(serverWorkflowStoreSource);
    const validator = validatorNodeFields(validatorSource);

    expect(Object.keys(server).sort()).toEqual(Object.keys(validator).sort());
    for (const [type, fields] of Object.entries(validator)) {
      expect(server[type]?.slice().sort(), type).toEqual(fields.slice().sort());
    }
  });
});

describe("validationRejections", () => {
  it("lists every WorkflowValidationStatus except valid, in order", () => {
    const source = `
/// The outcome.
enum WorkflowValidationStatus {
  /// Passes.
  valid,

  /// Bad fields.
  invalidSchema,

  /// A cycle.
  cycle,
}`;

    expect(validationRejections(source)).toEqual(["invalidSchema", "cycle"]);
  });

  it("fails when the source has no WorkflowValidationStatus", () => {
    expect(() => validationRejections("enum Other { a }")).toThrow(/WorkflowValidationStatus/);
  });
});
