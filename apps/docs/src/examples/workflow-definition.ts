import source from "../../../../packages/sdk_flutter/example/workflow_definition.json?raw";

/**
 * The complete published workflow of `Referencia → Esquema de workflow`
 * (US-145). The SDK's `test/workflow_schema_example_test.dart` checks that it
 * passes `WorkflowDefinitionValidator`.
 */
export const workflowDefinition = source.trim();
