import '../immutable_json.dart';

import 'experiment_plan.dart';
import 'validation_run_metadata.dart';

enum ValidationCondition { control, treatment }

enum ValidationRunOutcome { success, error, cancelled }

class ValidationRunModelArtifact {
  const ValidationRunModelArtifact({
    required this.nodeId,
    required this.modelVersionId,
    required this.sha256,
  });

  final String nodeId;
  final String modelVersionId;
  final String sha256;

  Map<String, Object?> toJson() => {
    'nodeId': nodeId,
    'modelVersionId': modelVersionId,
    'sha256': sha256,
  };

  factory ValidationRunModelArtifact.fromJson(Map<String, Object?> json) {
    const fields = {'nodeId', 'modelVersionId', 'sha256'};
    if (json.keys.toSet().difference(fields).isNotEmpty ||
        fields.difference(json.keys.toSet()).isNotEmpty) {
      throw const FormatException(
        'Model artifact has missing or unknown fields.',
      );
    }
    final artifact = ValidationRunModelArtifact(
      nodeId: _asString(json['nodeId'], 'modelArtifacts.nodeId'),
      modelVersionId: _asString(
        json['modelVersionId'],
        'modelArtifacts.modelVersionId',
      ),
      sha256: _asString(json['sha256'], 'modelArtifacts.sha256'),
    );
    _requireDigest(artifact.sha256, 'modelArtifacts.sha256');
    return artifact;
  }

  @override
  bool operator ==(Object other) =>
      other is ValidationRunModelArtifact &&
      other.nodeId == nodeId &&
      other.modelVersionId == modelVersionId &&
      other.sha256 == sha256;

  @override
  int get hashCode => Object.hash(nodeId, modelVersionId, sha256);
}

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
    List<ValidationRunModelArtifact> modelArtifacts = const [],
    required this.workflowVersionId,
    required this.workflowVersion,
    required this.backend,
    required this.metadata,
    required this.durationMicros,
    required this.outcome,
    required Map<String, Object?> normalizedOutput,
    required this.traceCaptureEnabled,
    this.tracePersistenceFailed = false,
    this.errorCode,
    this.errorMessage,
    DateTime? recordedAtUtc,
  }) : modelArtifacts = List.unmodifiable(modelArtifacts),
       normalizedOutput = freezeJsonMap(normalizedOutput),
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
    if (modelArtifacts.map((artifact) => artifact.nodeId).toSet().length !=
        modelArtifacts.length) {
      throw const FormatException('Model artifact node ids must be unique.');
    }
    for (final artifact in modelArtifacts) {
      _requiredString(artifact.nodeId, 'modelArtifacts.nodeId');
      _requiredString(artifact.modelVersionId, 'modelArtifacts.modelVersionId');
      _requireDigest(artifact.sha256, 'modelArtifacts.sha256');
    }
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
  final List<ValidationRunModelArtifact> modelArtifacts;
  final String? workflowVersionId;
  final String? workflowVersion;
  final String backend;
  final ValidationRunMetadata metadata;
  final int durationMicros;
  final ValidationRunOutcome outcome;
  final Map<String, Object?> normalizedOutput;
  final bool tracePersistenceFailed;
  final bool traceCaptureEnabled;
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
    'modelArtifacts': [
      for (final artifact in modelArtifacts) artifact.toJson(),
    ],
    'workflowVersionId': workflowVersionId,
    'workflowVersion': workflowVersion,
    'backend': backend,
    'metadata': metadata.toJson(),
    'durationMicros': durationMicros,
    'outcome': outcome.name,
    'normalizedOutput': normalizedOutput,
    'tracePersistenceFailed': tracePersistenceFailed,
    'traceCaptureEnabled': traceCaptureEnabled,
    'errorCode': errorCode,
    'errorMessage': errorMessage,
    'recordedAtUtc': recordedAtUtc.toIso8601String(),
  };

  factory ValidationRunRecord.fromJson(Map<String, Object?> json) {
    const legacyKeys = {
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
      'metadata',
      'durationMicros',
      'outcome',
      'normalizedOutput',
      'tracePersistenceFailed',
      'traceCaptureEnabled',
      'errorCode',
      'errorMessage',
      'recordedAtUtc',
    };
    const keys = {...legacyKeys, 'modelArtifacts'};
    final actualKeys = json.keys.toSet();
    final isLegacy =
        actualKeys.length == legacyKeys.length &&
        legacyKeys.containsAll(actualKeys);
    final isCurrent =
        actualKeys.length == keys.length && keys.containsAll(actualKeys);
    if (!isLegacy && !isCurrent) {
      throw const FormatException('Run record has missing or unknown fields.');
    }
    final modelArtifacts = json.containsKey('modelArtifacts')
        ? _modelArtifacts(json['modelArtifacts'])
        : const <ValidationRunModelArtifact>[];
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
      modelArtifacts: modelArtifacts,
      workflowVersionId: _nullableString(
        json['workflowVersionId'],
        'workflowVersionId',
      ),
      workflowVersion: _nullableString(
        json['workflowVersion'],
        'workflowVersion',
      ),
      backend: _asString(json['backend'], 'backend'),
      metadata: ValidationRunMetadata.fromJson(
        _asObject(json['metadata'], 'metadata'),
      ),
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
      traceCaptureEnabled: _asBoolean(
        json['traceCaptureEnabled'],
        'traceCaptureEnabled',
      ),
      errorCode: _nullableString(json['errorCode'], 'errorCode'),
      errorMessage: _nullableString(json['errorMessage'], 'errorMessage'),
      recordedAtUtc: DateTime.parse(
        _asString(json['recordedAtUtc'], 'recordedAtUtc'),
      ),
    );
  }
}

List<ValidationRunModelArtifact> _modelArtifacts(Object? value) {
  if (value is! List) {
    throw const FormatException('modelArtifacts must be a list.');
  }
  return List.unmodifiable(
    value.map((item) {
      if (item is! Map) {
        throw const FormatException('Model artifact must be an object.');
      }
      return ValidationRunModelArtifact.fromJson(
        item.map((key, value) => MapEntry(key.toString(), value)),
      );
    }),
  );
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
  r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$',
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
