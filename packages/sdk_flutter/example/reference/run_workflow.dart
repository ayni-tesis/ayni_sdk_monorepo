// Example of the Dart API reference (US-143) and of the README (US-090). The
// `///` comments of `AyniSdk.run` show the `ejecutar` region and the README's
// execution section shows `ejecutar-readme`; `dart test` runs
// `test/doc_examples_test.dart`, which fails when a snippet drifts from its
// region, while `dart analyze` checks that this file compiles.
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';

/// Runs workflow [workflowId] on [image] and describes each output.
Future<List<String>> describeOutputs(
  AyniSdk sdk,
  String workflowId,
  Uint8List image,
) async {
  // #region ejecutar
  try {
    final result = await sdk.run(workflowId, image);
    return [
      for (final MapEntry(key: name, value: value) in result.outputs.entries)
        switch (value) {
          ClassificationResult(:final label, :final confidence) =>
            '$name: $label ($confidence)',
          DetectionResult(:final detections) =>
            '$name: ${detections.length} objetos',
          BooleanResult(value: final passed) => '$name: $passed',
        },
    ];
  } on UnsupportedError catch (error) {
    return ['Plataforma no admitida: ${error.message}'];
  } on WorkflowError catch (error) {
    return ['No se pudo ejecutar el workflow: ${error.category.name}'];
  }
  // #endregion ejecutar
}

/// Prints the outputs of the locally installed [workflowId] version.
Future<void> printOutputs(String workflowId, Uint8List imageBytes) async {
  // #region ejecutar-readme
  final sdk = AyniSdk.instance;

  try {
    // Devuelve la última versión instalada del workflow, sin conexión
    final WorkflowResult result = await sdk.run(workflowId, imageBytes);

    // Salidas publicadas: Map<String, WorkflowValue>
    print(result.outputs);
  } on WorkflowError catch (error) {
    // error.category (WorkflowErrorCategory), error.nodeId, error.modelVersionId
    print('Error de ejecución: ${error.category}');
  }
  // #endregion ejecutar-readme
}
