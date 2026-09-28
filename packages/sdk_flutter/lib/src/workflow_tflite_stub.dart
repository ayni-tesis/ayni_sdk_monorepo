import 'dart:io';
import 'dart:typed_data';

/// One output tensor of a model: its [shape] and its values, flattened.
typedef WorkflowTensorOutput = ({List<int> shape, Float32List values});

/// The outputs of a model run, or the name of the error that stopped it
/// (a `WorkflowErrorCategory` name such as `modelNotAvailable`).
typedef WorkflowInferenceResult = ({
  String? error,
  List<WorkflowTensorOutput> outputs,
});

/// Stands in for the TensorFlow Lite runner outside Flutter, where models
/// cannot run: it reports `modelNotAvailable` when [modelPath] does not
/// exist and `runtimeError` otherwise.
Future<WorkflowInferenceResult> runModel({
  required String modelPath,
  required Uint8List inputBytes,
  required List<List<int>> acceptedInputShapes,
}) async {
  if (!await File(modelPath).exists()) {
    return (
      error: 'modelNotAvailable',
      outputs: const <WorkflowTensorOutput>[],
    );
  }
  return (error: 'runtimeError', outputs: const <WorkflowTensorOutput>[]);
}
