import 'dart:io';
import 'dart:typed_data';

typedef WorkflowTensorOutput = ({List<int> shape, Float32List values});
typedef WorkflowInferenceResult = ({
  String? error,
  List<WorkflowTensorOutput> outputs,
});

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
