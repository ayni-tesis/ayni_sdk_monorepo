import 'dart:typed_data';

import '../models/experiment_plan.dart';
import '../models/validation_run_record.dart';

class ValidationRunRequest {
  ValidationRunRequest({
    required this.pairRunId,
    required this.repetition,
    required this.phase,
    required this.scenarioId,
    required this.caseId,
    required this.datasetId,
    required this.datasetVersionId,
    required this.datasetPartition,
    required this.datasetSha256,
    required Uint8List inputBytes,
    required this.inputSha256,
    required this.captureTrace,
  }) : inputBytes = Uint8List.fromList(inputBytes) {
    if (pairRunId.trim().isEmpty || repetition < 1) {
      throw const FormatException('Run identifiers must be valid.');
    }
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(datasetSha256) ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(inputSha256)) {
      throw const FormatException(
        'Run SHA-256 values must be lowercase digests.',
      );
    }
  }

  final String pairRunId;
  final int repetition;
  final ValidationPhase phase;
  final String scenarioId;
  final String caseId;
  final String datasetId;
  final String datasetVersionId;
  final String datasetPartition;
  final String datasetSha256;
  final Uint8List inputBytes;
  final String inputSha256;
  final bool captureTrace;
}

class ConditionRunResult {
  ConditionRunResult._({
    required this.outcome,
    required this.durationMicros,
    required this.modelVersionId,
    required this.modelSha256,
    required Map<String, Object?> normalizedOutput,
    required this.workflowVersionId,
    required this.workflowVersion,
    required this.errorCode,
    required this.errorMessage,
    required this.tracePersistenceFailed,
  }) : normalizedOutput = _freezeObjectMap(normalizedOutput);

  factory ConditionRunResult.success({
    required int durationMicros,
    required String modelVersionId,
    required String modelSha256,
    required Map<String, Object?> normalizedOutput,
    String? workflowVersionId,
    String? workflowVersion,
    bool tracePersistenceFailed = false,
  }) => ConditionRunResult._(
    outcome: ValidationRunOutcome.success,
    durationMicros: durationMicros,
    modelVersionId: modelVersionId,
    modelSha256: modelSha256,
    normalizedOutput: normalizedOutput,
    workflowVersionId: workflowVersionId,
    workflowVersion: workflowVersion,
    errorCode: null,
    errorMessage: null,
    tracePersistenceFailed: tracePersistenceFailed,
  );

  factory ConditionRunResult.failure({
    required int durationMicros,
    required String modelVersionId,
    required String modelSha256,
    required String errorCode,
    required String errorMessage,
    String? workflowVersionId,
    String? workflowVersion,
  }) => ConditionRunResult._(
    outcome: ValidationRunOutcome.error,
    durationMicros: durationMicros,
    modelVersionId: modelVersionId,
    modelSha256: modelSha256,
    normalizedOutput: const {},
    workflowVersionId: workflowVersionId,
    workflowVersion: workflowVersion,
    errorCode: errorCode,
    errorMessage: errorMessage,
    tracePersistenceFailed: false,
  );

  final ValidationRunOutcome outcome;
  final int durationMicros;
  final String modelVersionId;
  final String modelSha256;
  final Map<String, Object?> normalizedOutput;
  final String? workflowVersionId;
  final String? workflowVersion;
  final String? errorCode;
  final String? errorMessage;
  final bool tracePersistenceFailed;
}

abstract interface class ValidationConditionRunner {
  ValidationCondition get condition;

  Future<void> prepare();

  Future<ConditionRunResult> runCase(ValidationRunRequest request);

  Future<void> close();
}

class ValidationExecutionException implements Exception {
  const ValidationExecutionException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => 'ValidationExecutionException($code)';
}

void validateRequestDataset(
  ValidationRunRequest request,
  ValidationResourceProfile profile,
) {
  if (request.datasetVersionId != profile.datasetVersionId ||
      request.datasetPartition != profile.datasetPartition ||
      request.datasetSha256 != profile.datasetSha256) {
    throw const ValidationExecutionException(
      'datasetProfileMismatch',
      'El lote usa un dataset distinto del perfil verificado.',
    );
  }
}

Map<String, Object?> _freezeObjectMap(Map<String, Object?> source) =>
    Map.unmodifiable({
      for (final entry in source.entries) entry.key: _freezeObject(entry.value),
    });

Object? _freezeObject(Object? value) {
  if (value is Map<String, Object?>) return _freezeObjectMap(value);
  if (value is Map) {
    return _freezeObjectMap(
      value.map((key, nested) => MapEntry(key.toString(), nested)),
    );
  }
  if (value is List) return List.unmodifiable(value.map(_freezeObject));
  return value;
}
