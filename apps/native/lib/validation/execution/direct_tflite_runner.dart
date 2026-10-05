import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:tflite_flutter/tflite_flutter.dart';

import '../data/validation_model_repository.dart';
import '../models/experiment_plan.dart';
import '../models/validation_run_record.dart';
import 'validation_condition_runner.dart';
import 'validation_image_preprocessor.dart';
import 'validation_output_normalizer.dart';

abstract interface class ValidationTfliteEngine {
  Future<List<ValidationTensor>> run({
    required File modelFile,
    required Uint8List imageBytes,
    required ValidationInputContract inputContract,
  });
}

class TfliteCpuInferenceEngine implements ValidationTfliteEngine {
  const TfliteCpuInferenceEngine();

  @override
  Future<List<ValidationTensor>> run({
    required File modelFile,
    required Uint8List imageBytes,
    required ValidationInputContract inputContract,
  }) => Isolate.run(
    () => _runTfliteCpu(
      modelFile.path,
      imageBytes,
      inputContract.width,
      inputContract.height,
      inputContract.channels,
      inputContract.normalization,
    ),
  );
}

class DirectTfliteRunner implements ValidationConditionRunner {
  DirectTfliteRunner({
    required ValidationResourceProfile profile,
    required ValidationModelRepository modelRepository,
    ValidationTfliteEngine inferenceEngine = const TfliteCpuInferenceEngine(),
    ValidationOutputNormalizer outputNormalizer =
        const ValidationOutputNormalizer(),
  }) : _profile = profile,
       _modelRepository = modelRepository,
       _inferenceEngine = inferenceEngine,
       _outputNormalizer = outputNormalizer;

  final ValidationResourceProfile _profile;
  final ValidationModelRepository _modelRepository;
  final ValidationTfliteEngine _inferenceEngine;
  final ValidationOutputNormalizer _outputNormalizer;
  VerifiedModelArtifact? _artifact;

  @override
  ValidationCondition get condition => ValidationCondition.control;

  String get backend => 'CPU';

  @override
  Future<void> prepare() async {
    if (!_profile.isConfigured) {
      throw const ValidationExecutionException(
        'resourcesNotConfigured',
        'Configura las versiones publicadas del perfil antes de preparar.',
      );
    }
    final artifact = await _modelRepository.prepare(_profile);
    if (artifact.modelVersionId != _profile.controlModelVersionId ||
        artifact.sha256 != _profile.controlModelSha256 ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(artifact.sha256) ||
        !await artifact.file.exists() ||
        !modelContractMatchesValidationProfile(artifact.contract, _profile)) {
      throw const ValidationExecutionException(
        'modelDoesNotMatchProfile',
        'El modelo descargado no coincide con el perfil de validación.',
      );
    }
    _artifact = artifact;
  }

  @override
  Future<ConditionRunResult> runCase(ValidationRunRequest request) async {
    final artifact = _artifact;
    if (artifact == null) {
      throw const ValidationExecutionException(
        'runnerNotPrepared',
        'Prepara los recursos antes de ejecutar el lote.',
      );
    }
    try {
      validateRequestDataset(request, _profile);
      if (sha256.convert(request.inputBytes).toString() !=
          request.inputSha256) {
        throw const ValidationExecutionException(
          'inputHashMismatch',
          'La imagen del lote no coincide con su SHA-256 verificado.',
        );
      }
    } on ValidationExecutionException catch (error) {
      return ConditionRunResult.failure(
        durationMicros: 0,
        modelVersionId: artifact.modelVersionId,
        modelSha256: artifact.sha256,
        errorCode: error.code,
        errorMessage: error.message,
      );
    }
    final stopwatch = Stopwatch()..start();
    try {
      final tensors = await _inferenceEngine.run(
        modelFile: artifact.file,
        imageBytes: request.inputBytes,
        inputContract: _profile.inputContract,
      );
      final output = _outputNormalizer.normalizeDirect(
        tensors: tensors,
        contracts: _profile.outputContract,
      );
      stopwatch.stop();
      return ConditionRunResult.success(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: artifact.modelVersionId,
        modelSha256: artifact.sha256,
        normalizedOutput: output,
      );
    } on ValidationExecutionException catch (error) {
      stopwatch.stop();
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: artifact.modelVersionId,
        modelSha256: artifact.sha256,
        errorCode: error.code,
        errorMessage: error.message,
      );
    } on ValidationOutputException catch (error) {
      stopwatch.stop();
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: artifact.modelVersionId,
        modelSha256: artifact.sha256,
        errorCode: error.code,
        errorMessage:
            'La salida del modelo no coincide con el contrato publicado.',
      );
    } on Object {
      stopwatch.stop();
      return ConditionRunResult.failure(
        durationMicros: stopwatch.elapsedMicroseconds,
        modelVersionId: artifact.modelVersionId,
        modelSha256: artifact.sha256,
        errorCode: 'inferenceFailed',
        errorMessage: 'No se pudo ejecutar el modelo local.',
      );
    }
  }

  @override
  Future<void> close() async {}

  @override
  Future<void> cancelActive() async {}
}

List<ValidationTensor> _runTfliteCpu(
  String modelPath,
  Uint8List imageBytes,
  int width,
  int height,
  int channels,
  String normalization,
) {
  final input = prepareValidationImageTensor(
    imageBytes,
    ValidationInputContract(
      width: width,
      height: height,
      channels: channels,
      normalization: normalization,
    ),
  );
  final inputBytes = input.buffer.asUint8List(
    input.offsetInBytes,
    input.lengthInBytes,
  );
  Interpreter? interpreter;
  try {
    // Like ayni_sdk 0.2.0, this creates the default CPU interpreter without delegates.
    interpreter = Interpreter.fromFile(File(modelPath));
    final inputs = interpreter.getInputTensors();
    final acceptedShapes = [
      [1, height, width, channels],
      [height, width, channels],
    ];
    if (inputs.length != 1 ||
        inputs.single.type != TensorType.float32 ||
        !acceptedShapes.any(
          (shape) => _sameShape(inputs.single.shape, shape),
        )) {
      throw const ValidationExecutionException(
        'unsupportedInputContract',
        'El tensor de entrada del modelo no coincide con el contrato publicado.',
      );
    }
    final outputTensors = interpreter.getOutputTensors();
    if (outputTensors.any((tensor) => tensor.type != TensorType.float32)) {
      throw const ValidationExecutionException(
        'unsupportedOutputType',
        'El modelo publica un tipo de salida que no admite la validación.',
      );
    }
    final outputs = <int, Object>{};
    final views = <int, Float32List>{};
    for (var index = 0; index < outputTensors.length; index++) {
      final bytes = Uint8List(outputTensors[index].numBytes());
      outputs[index] = bytes;
      views[index] = Float32List.view(
        bytes.buffer,
        bytes.offsetInBytes,
        bytes.lengthInBytes ~/ Float32List.bytesPerElement,
      );
    }
    interpreter.runForMultipleInputs([inputBytes], outputs);
    return [
      for (var index = 0; index < outputTensors.length; index++)
        ValidationTensor(
          shape: List<int>.of(outputTensors[index].shape),
          values: List<double>.of(views[index]!),
        ),
    ];
  } finally {
    interpreter?.close();
  }
}

bool _sameShape(List<int> left, List<int> right) =>
    left.length == right.length &&
    List.generate(
      left.length,
      (index) => left[index] == right[index],
    ).every((same) => same);
