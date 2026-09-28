// Example of the Dart API reference (US-143). The `///` comments of
// `AyniSdk.run` show the `ejecutar` region, and `test/doc_examples_test.dart`
// fails if they drift from it, so `dart analyze` checks the snippet.
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
  } on WorkflowError catch (error) {
    return ['No se pudo ejecutar el workflow: ${error.category.name}'];
  }
  // #endregion ejecutar
}
