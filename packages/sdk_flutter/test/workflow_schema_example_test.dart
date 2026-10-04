// `Referencia` → `Esquema de workflow` shows `example/workflow_definition.json`
// as a complete published workflow (US-145). The SDK must accept it, so the
// page never documents a definition the SDK would reject (US-150).
import 'dart:convert';
import 'dart:io';

import '../lib/src/workflow_definition_validator.dart';

import 'package:test/test.dart';

void main() {
  final example = jsonDecode(
    File('example/workflow_definition.json').readAsStringSync(),
  );

  test('the documented workflow passes the SDK validation', () {
    final status = WorkflowDefinitionValidator().validate(
      definition: example,
      // The sync lists the model version the example's model node uses.
      declaredModelVersionIds: const {'c7e4b2a1-6d5f-4e3c-8b9a-1f2e3d4c5b6a'},
    );

    expect(status, WorkflowValidationStatus.valid);
  });

  test('a documented workflow with a renamed node type fails the check', () {
    // Proves the check above fails when the page shows a definition the SDK
    // rejects (US-150).
    final broken =
        jsonDecode(File('example/workflow_definition.json').readAsStringSync())
            as Map;
    ((broken['nodes'] as List).first as Map)['type'] = 'input.imagen';

    final status = WorkflowDefinitionValidator().validate(
      definition: broken,
      declaredModelVersionIds: const {'c7e4b2a1-6d5f-4e3c-8b9a-1f2e3d4c5b6a'},
    );

    expect(status, WorkflowValidationStatus.unknownNodeType);
  });

  test('the documented workflow uses every node type the SDK runs', () {
    final nodes = (example as Map)['nodes'] as List;

    expect(nodes.map((node) => (node as Map)['type']).toSet(), {
      'input.image',
      'model.tflite',
      'condition',
      'output',
      'dataset.capture',
    });
  });
}
