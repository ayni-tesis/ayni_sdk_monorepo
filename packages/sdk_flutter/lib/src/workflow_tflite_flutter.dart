import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:tflite_flutter/tflite_flutter.dart';

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
  try {
    return await Isolate.run(
      () => _runModelInIsolate(modelPath, inputBytes, acceptedInputShapes),
    );
  } on FileSystemException {
    return (
      error: 'modelNotAvailable',
      outputs: const <WorkflowTensorOutput>[],
    );
  } catch (_) {
    return (error: 'runtimeError', outputs: const <WorkflowTensorOutput>[]);
  }
}

WorkflowInferenceResult _runModelInIsolate(
  String modelPath,
  Uint8List inputBytes,
  List<List<int>> acceptedInputShapes,
) {
  if (!File(modelPath).existsSync()) {
    return (
      error: 'modelNotAvailable',
      outputs: const <WorkflowTensorOutput>[],
    );
  }
  Interpreter? interpreter;
  try {
    interpreter = Interpreter.fromFile(File(modelPath));
    final inputs = interpreter.getInputTensors();
    if (inputs.length != 1 ||
        inputs.single.type != TensorType.float32 ||
        !acceptedInputShapes.any(
          (shape) => _sameShape(inputs.single.shape, shape),
        )) {
      return (
        error: 'unsupportedInputContract',
        outputs: const <WorkflowTensorOutput>[],
      );
    }

    final tensors = interpreter.getOutputTensors();
    if (tensors.any((tensor) => tensor.type != TensorType.float32)) {
      return (
        error: 'modelOutputInvalid',
        outputs: const <WorkflowTensorOutput>[],
      );
    }
    final rawOutputs = <int, Object>{};
    final floatViews = <int, Float32List>{};
    for (var i = 0; i < tensors.length; i++) {
      final bytes = Uint8List(tensors[i].numBytes());
      rawOutputs[i] = bytes;
      floatViews[i] = Float32List.view(
        bytes.buffer,
        bytes.offsetInBytes,
        bytes.lengthInBytes ~/ Float32List.bytesPerElement,
      );
    }
    interpreter.runForMultipleInputs([inputBytes], rawOutputs);
    return (
      error: null,
      outputs: [
        for (var i = 0; i < tensors.length; i++)
          (
            shape: List<int>.of(tensors[i].shape),
            values: Float32List.fromList(floatViews[i]!),
          ),
      ],
    );
  } finally {
    interpreter?.close();
  }
}

bool _sameShape(List<int> left, List<int> right) {
  if (left.length != right.length) return false;
  for (var i = 0; i < left.length; i++) {
    if (left[i] != right[i]) return false;
  }
  return true;
}
