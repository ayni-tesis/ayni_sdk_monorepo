import 'dart:convert';

import 'experiment_plan.dart';

enum ValidationCondition { control, treatment }

enum ValidationRunOutcome { success, error, cancelled }

class ValidationRunRecord {
  ValidationRunRecord({
    required this.pairRunId,
    required this.repetition,
    required this.condition,
    required this.phase,
    required this.scenarioId,
    required this.caseId,
    required this.datasetVersionId,
    required this.datasetPartition,
    required this.datasetSha256,
    required this.inputSha256,
    required this.modelVersionId,
    required this.modelSha256,
    required this.workflowVersionId,
    required this.workflowVersion,
    required this.backend,
    required this.durationMicros,
    required this.outcome,
    required Map<String, Object?> normalizedOutput,
    this.tracePersistenceFailed = false,
    this.errorCode,
    this.errorMessage,
    DateTime? recordedAtUtc,
  }) : normalizedOutput = _freezeJsonMap(normalizedOutput),
       recordedAtUtc = (recordedAtUtc ?? DateTime.now().toUtc()).toUtc() {
    _requiredString(pairRunId, 'pairRunId');
    _requiredString(scenarioId, 'scenarioId');
    _requiredString(caseId, 'caseId');
    _requiredString(datasetVersionId, 'datasetVersionId');
    _requiredString(datasetPartition, 'datasetPartition');
    _requiredString(modelVersionId, 'modelVersionId');
    if (repetition < 1) {
      throw const FormatException('repetition must be one-based.');
    }
    if (durationMicros < 0) {
      throw const FormatException('durationMicros cannot be negative.');
    }
    if (backend != 'CPU') {
      throw const FormatException(
        'Validation records must declare the CPU backend.',
      );
    }
    _requireDigest(datasetSha256, 'datasetSha256');
    _requireDigest(inputSha256, 'inputSha256');
    _requireDigest(modelSha256, 'modelSha256');
    if (condition == ValidationCondition.control &&
        (workflowVersionId != null || workflowVersion != null)) {
      throw const FormatException(
        'Control records cannot declare an SDK workflow.',
      );
    }
    if (condition == ValidationCondition.treatment &&
        (workflowVersionId == null ||
            workflowVersionId!.trim().isEmpty ||
            workflowVersion == null)) {
      throw const FormatException(
        'Treatment records require the exact SDK workflow version.',
      );
    }
    if (workflowVersion != null && !_validSemver(workflowVersion!)) {
      throw const FormatException('workflowVersion must be semantic version.');
    }
    if (outcome == ValidationRunOutcome.success &&
        (errorCode != null || errorMessage != null)) {
      throw const FormatException(
        'Successful records cannot contain error details.',
      );
    }
    if (outcome != ValidationRunOutcome.success &&
        (errorCode == null || errorCode!.trim().isEmpty)) {
      throw const FormatException('Failed records require a typed error code.');
    }
  }

  final String pairRunId;
  final int repetition;
  final ValidationCondition condition;
  final ValidationPhase phase;
  final String scenarioId;
  final String caseId;
  final String datasetVersionId;
  final String datasetPartition;
  final String datasetSha256;
  final String inputSha256;
  final String modelVersionId;
  final String modelSha256;
  final String? workflowVersionId;
  final String? workflowVersion;
  final String backend;
  final int durationMicros;
  final ValidationRunOutcome outcome;
  final Map<String, Object?> normalizedOutput;
  final bool tracePersistenceFailed;
  final String? errorCode;
  final String? errorMessage;
  final DateTime recordedAtUtc;

  Map<String, Object?> toJson() => {
    'pairRunId': pairRunId,
    'repetition': repetition,
    'condition': condition.name,
    'phase': phase.name,
    'scenarioId': scenarioId,
    'caseId': caseId,
    'datasetVersionId': datasetVersionId,
    'datasetPartition': datasetPartition,
    'datasetSha256': datasetSha256,
    'inputSha256': inputSha256,
    'modelVersionId': modelVersionId,
    'modelSha256': modelSha256,
    'workflowVersionId': workflowVersionId,
    'workflowVersion': workflowVersion,
    'backend': backend,
    'durationMicros': durationMicros,
    'outcome': outcome.name,
    'normalizedOutput': normalizedOutput,
    'tracePersistenceFailed': tracePersistenceFailed,
    'errorCode': errorCode,
    'errorMessage': errorMessage,
    'recordedAtUtc': recordedAtUtc.toIso8601String(),
  };

  factory ValidationRunRecord.fromJson(Map<String, Object?> json) {
    const keys = {
      'pairRunId',
      'repetition',
      'condition',
      'phase',
      'scenarioId',
      'caseId',
      'datasetVersionId',
      'datasetPartition',
      'datasetSha256',
      'inputSha256',
      'modelVersionId',
      'modelSha256',
      'workflowVersionId',
      'workflowVersion',
      'backend',
      'durationMicros',
      'outcome',
      'normalizedOutput',
      'tracePersistenceFailed',
      'errorCode',
      'errorMessage',
      'recordedAtUtc',
    };
    if (json.keys.toSet().difference(keys).isNotEmpty ||
        keys.difference(json.keys.toSet()).isNotEmpty) {
      throw const FormatException('Run record has missing or unknown fields.');
    }
    return ValidationRunRecord(
      pairRunId: _asString(json['pairRunId'], 'pairRunId'),
      repetition: _asInt(json['repetition'], 'repetition'),
      condition: _enumByName(
        ValidationCondition.values,
        json['condition'],
        'condition',
      ),
      phase: _enumByName(ValidationPhase.values, json['phase'], 'phase'),
      scenarioId: _asString(json['scenarioId'], 'scenarioId'),
      caseId: _asString(json['caseId'], 'caseId'),
      datasetVersionId: _asString(json['datasetVersionId'], 'datasetVersionId'),
      datasetPartition: _asString(json['datasetPartition'], 'datasetPartition'),
      datasetSha256: _asString(json['datasetSha256'], 'datasetSha256'),
      inputSha256: _asString(json['inputSha256'], 'inputSha256'),
      modelVersionId: _asString(json['modelVersionId'], 'modelVersionId'),
      modelSha256: _asString(json['modelSha256'], 'modelSha256'),
      workflowVersionId: _nullableString(
        json['workflowVersionId'],
        'workflowVersionId',
      ),
      workflowVersion: _nullableString(
        json['workflowVersion'],
        'workflowVersion',
      ),
      backend: _asString(json['backend'], 'backend'),
      durationMicros: _asInt(json['durationMicros'], 'durationMicros'),
      outcome: _enumByName(
        ValidationRunOutcome.values,
        json['outcome'],
        'outcome',
      ),
      normalizedOutput: _asObject(json['normalizedOutput'], 'normalizedOutput'),
      tracePersistenceFailed: _asBoolean(
        json['tracePersistenceFailed'],
        'tracePersistenceFailed',
      ),
      errorCode: _nullableString(json['errorCode'], 'errorCode'),
      errorMessage: _nullableString(json['errorMessage'], 'errorMessage'),
      recordedAtUtc: DateTime.parse(
        _asString(json['recordedAtUtc'], 'recordedAtUtc'),
      ),
    );
  }
}

Map<String, Object?> _freezeJsonMap(Map<String, Object?> value) {
  final decoded = jsonDecode(jsonEncode(value));
  final frozen = _deepFreeze(_asObject(decoded, 'normalizedOutput'));
  if (frozen is Map<String, Object?>) return frozen;
  throw const FormatException('normalizedOutput must be a JSON object.');
}

Object? _deepFreeze(Object? value) {
  if (value is Map) {
    return Map<String, Object?>.unmodifiable(
      value.map((key, item) => MapEntry(key.toString(), _deepFreeze(item))),
    );
  }
  if (value is List) return List<Object?>.unmodifiable(value.map(_deepFreeze));
  return value;
}

void _requiredString(String value, String name) {
  if (value.trim().isEmpty) throw FormatException('$name must be non-empty.');
}

void _requireDigest(String value, String name) {
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(value)) {
    throw FormatException('$name must be a lowercase SHA-256 digest.');
  }
}

bool _validSemver(String value) => RegExp(
  r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$',
).hasMatch(value);

String _asString(Object? value, String name) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$name must be a non-empty string.');
  }
  return value;
}

String? _nullableString(Object? value, String name) {
  if (value == null) return null;
  return _asString(value, name);
}

int _asInt(Object? value, String name) {
  if (value is! int) throw FormatException('$name must be an integer.');
  return value;
}

bool _asBoolean(Object? value, String name) {
  if (value is bool) return value;
  throw FormatException('$name must be a boolean.');
}

Map<String, Object?> _asObject(Object? value, String name) {
  if (value is! Map) throw FormatException('$name must be an object.');
  return value.map((key, item) => MapEntry(key.toString(), item));
}

T _enumByName<T extends Enum>(List<T> values, Object? name, String field) {
  if (name is! String) throw FormatException('$field must be a string.');
  for (final value in values) {
    if (value.name == name) return value;
  }
  throw FormatException('Unknown $field value.');
}
