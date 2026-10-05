import 'dart:convert';

import 'package:flutter/services.dart';

enum ValidationPhase { coldStart, warmup, measured, stress, fault }

enum ValidationResultType { classification, detection, boolean }

enum ValidationResourceProfileStatus { pending, ready }

class ExperimentPlan {
  ExperimentPlan._({
    required this.schemaVersion,
    required List<String> caseIds,
    required List<ValidationResourceProfile> resourceProfiles,
    required List<ValidationScenario> scenarios,
  }) : caseIds = List.unmodifiable(caseIds),
       resourceProfiles = List.unmodifiable(resourceProfiles),
       scenarios = List.unmodifiable(scenarios);

  static const assetPath = 'assets/validation/experiment_plan.json';

  final String schemaVersion;
  final List<String> caseIds;
  final List<ValidationResourceProfile> resourceProfiles;
  final List<ValidationScenario> scenarios;

  /// Transitional compatibility for the existing single-profile UI.
  /// Multi-profile execution must select the profile from its scenario.
  ValidationResourceProfile get activeResourceProfile {
    final ready = resourceProfiles.where((profile) => profile.isReady).toList();
    if (ready.length != 1) {
      throw StateError('The plan does not have exactly one ready profile.');
    }
    return ready.single;
  }

  factory ExperimentPlan.fromJson(Map<String, Object?> json) {
    _requireKeys(json, const {
      'schemaVersion',
      'caseIds',
      'resourceProfiles',
      'scenarios',
    }, 'plan');
    final schemaVersion = _string(json['schemaVersion'], 'schemaVersion');
    if (schemaVersion != '2') {
      throw const FormatException('Unsupported experiment plan schemaVersion.');
    }

    final profileRows = _objects(json['resourceProfiles'], 'resourceProfiles');
    if (profileRows.isEmpty) {
      throw const FormatException('At least one resource profile is required.');
    }
    final profiles = profileRows
        .map(ValidationResourceProfile.fromJson)
        .toList(growable: false);
    _requireUnique(
      profiles.map((profile) => profile.id),
      'resource profile id',
    );

    final caseIds = _strings(json['caseIds'], 'caseIds');
    _requireUnique(caseIds, 'caseId');
    final scenarioRows = _objects(json['scenarios'], 'scenarios');
    final scenarios = scenarioRows
        .map(ValidationScenario.fromJson)
        .toList(growable: false);
    _requireUnique(scenarios.map((scenario) => scenario.id), 'scenario id');
    final profileIds = profiles.map((profile) => profile.id).toSet();
    if (scenarios.any(
      (scenario) =>
          scenario.resourceProfileId != null &&
          !profileIds.contains(scenario.resourceProfileId),
    )) {
      throw const FormatException('A scenario references an unknown profile.');
    }
    _validatePlanScenarios(scenarios, profiles);

    return ExperimentPlan._(
      schemaVersion: schemaVersion,
      caseIds: caseIds,
      resourceProfiles: profiles,
      scenarios: scenarios,
    );
  }

  static Future<ExperimentPlan> load(AssetBundle bundle) async {
    final source = await bundle.loadString(assetPath);
    final decoded = jsonDecode(source);
    return ExperimentPlan.fromJson(_object(decoded, 'plan'));
  }

  ValidationScenario scenarioFor(
    ValidationPhase phase, {
    String? resourceProfileId,
  }) {
    final profileId = switch (phase) {
      ValidationPhase.coldStart || ValidationPhase.fault => null,
      _ => resourceProfileId ?? activeResourceProfile.id,
    };
    final matches = scenarios
        .where(
          (scenario) =>
              scenario.phase == phase &&
              scenario.resourceProfileId == profileId,
        )
        .toList();
    if (matches.length != 1) {
      throw StateError('Expected exactly one ${phase.name} scenario.');
    }
    return matches.single;
  }

  List<ValidationScenario> scenariosFor(
    ValidationPhase phase, {
    String? resourceProfileId,
  }) => List.unmodifiable(
    scenarios.where(
      (scenario) =>
          scenario.phase == phase &&
          (resourceProfileId == null ||
              scenario.resourceProfileId == resourceProfileId),
    ),
  );
}

class ValidationScenario {
  ValidationScenario({
    required this.id,
    required this.phase,
    required this.repetitions,
    required List<int> blockSizes,
    required List<String> caseIds,
    required List<String> runLabels,
    required this.requiresExternalMeasurement,
    this.resourceProfileId,
  }) : blockSizes = List.unmodifiable(blockSizes),
       caseIds = List.unmodifiable(caseIds),
       runLabels = List.unmodifiable(runLabels);

  final String id;
  final ValidationPhase phase;
  final int repetitions;
  final List<int> blockSizes;
  final List<String> caseIds;
  final List<String> runLabels;
  final bool requiresExternalMeasurement;
  final String? resourceProfileId;

  factory ValidationScenario.fromJson(Map<String, Object?> json) {
    const requiredKeys = {
      'id',
      'phase',
      'repetitions',
      'blockSizes',
      'caseIds',
      'runLabels',
      'requiresExternalMeasurement',
    };
    if (requiredKeys.difference(json.keys.toSet()).isNotEmpty ||
        json.keys.toSet().difference({
          ...requiredKeys,
          'resourceProfileId',
        }).isNotEmpty) {
      throw const FormatException('scenario has missing or unknown fields.');
    }
    final phaseName = _string(json['phase'], 'scenario.phase');
    final phase = ValidationPhase.values
        .where((value) => value.name == phaseName)
        .firstOrNull;
    if (phase == null) throw const FormatException('Unknown validation phase.');
    final resourceProfileId = json.containsKey('resourceProfileId')
        ? _identifier(json['resourceProfileId'], 'scenario.resourceProfileId')
        : null;
    if ([
          ValidationPhase.warmup,
          ValidationPhase.measured,
          ValidationPhase.stress,
        ].contains(phase) !=
        (resourceProfileId != null)) {
      throw const FormatException(
        'Runnable scenarios require a resource profile; external scenarios must not select one.',
      );
    }

    final repetitions = _positiveInt(
      json['repetitions'],
      'scenario.repetitions',
    );
    final blockSizes = _integers(json['blockSizes'], 'scenario.blockSizes');
    if (blockSizes.isEmpty ||
        blockSizes.any((size) => size <= 0) ||
        blockSizes.fold<int>(0, (total, size) => total + size) != repetitions) {
      throw const FormatException(
        'Scenario block sizes must be positive and sum to repetitions.',
      );
    }
    final caseIds = _strings(json['caseIds'], 'scenario.caseIds');
    _requireUnique(caseIds, 'scenario caseId');
    final runLabels = _strings(json['runLabels'], 'scenario.runLabels');
    _requireUnique(runLabels, 'scenario runLabel');
    final external = _boolean(
      json['requiresExternalMeasurement'],
      'scenario.requiresExternalMeasurement',
    );
    if (phase == ValidationPhase.coldStart) {
      if (!external ||
          repetitions != 30 ||
          blockSizes.length != 1 ||
          blockSizes.single != 30 ||
          caseIds.isNotEmpty ||
          runLabels.length != 30 ||
          runLabels.asMap().entries.any(
            (entry) => entry.value != _coldStartLabel(entry.key + 1),
          )) {
        throw const FormatException(
          'Cold-start scenarios require 30 externally measured PERF-01 labels.',
        );
      }
    } else if (external || runLabels.isNotEmpty) {
      throw const FormatException(
        'Only cold-start scenarios may declare external run labels.',
      );
    }

    return ValidationScenario(
      id: _string(json['id'], 'scenario.id'),
      phase: phase,
      repetitions: repetitions,
      blockSizes: blockSizes,
      caseIds: caseIds,
      runLabels: runLabels,
      requiresExternalMeasurement: external,
      resourceProfileId: resourceProfileId,
    );
  }
}

class ValidationResourceProfile {
  factory ValidationResourceProfile({
    required String id,
    required String datasetVersionId,
    required String datasetPartition,
    required String datasetSha256,
    required String controlModelVersionId,
    required String controlModelSha256,
    required String treatmentWorkflowId,
    required String treatmentWorkflowVersionId,
    required String treatmentWorkflowVersion,
    required String treatmentModelVersionId,
    required String treatmentModelSha256,
    required ValidationInputContract inputContract,
    required List<ValidationOutputContract> outputContract,
  }) {
    if (controlModelVersionId != treatmentModelVersionId ||
        controlModelSha256 != treatmentModelSha256) {
      throw const FormatException(
        'Control and treatment must use the same model version and SHA-256.',
      );
    }
    return ValidationResourceProfile._(
      id: id,
      status: ValidationResourceProfileStatus.ready,
      datasetVersionId: datasetVersionId,
      datasetPartition: datasetPartition,
      datasetSha256: datasetSha256,
      workflowId: treatmentWorkflowId,
      workflowVersionId: treatmentWorkflowVersionId,
      workflowVersion: treatmentWorkflowVersion,
      modelRequirements: [
        ValidationModelRequirement(
          nodeId: 'legacy-model-node',
          modelVersionId: treatmentModelVersionId,
          sha256: treatmentModelSha256,
          inputContract: inputContract,
          modelOutputContract: ValidationModelOutputContract(
            resultType: outputContract.first.resultType,
            labels: outputContract.first.labels,
            scoreThreshold: outputContract.first.scoreThreshold,
            tensorIndices: outputContract.first.tensorIndices,
          ),
        ),
      ],
      outputContract: outputContract,
    );
  }

  ValidationResourceProfile._({
    required this.id,
    required this.status,
    String? datasetId,
    String? datasetVersionId,
    String? datasetPartition,
    String? datasetSha256,
    String? workflowId,
    String? workflowVersionId,
    String? workflowVersion,
    List<ValidationModelRequirement> modelRequirements = const [],
    List<ValidationOutputContract> outputContract = const [],
  }) : _datasetId = datasetId,
       _datasetVersionId = datasetVersionId,
       _datasetPartition = datasetPartition,
       _datasetSha256 = datasetSha256,
       _workflowId = workflowId,
       _workflowVersionId = workflowVersionId,
       _workflowVersion = workflowVersion,
       modelRequirements = List.unmodifiable(modelRequirements),
       outputContract = List.unmodifiable(outputContract);

  factory ValidationResourceProfile.pending({required String id}) =>
      ValidationResourceProfile._(
        id: _identifier(id, 'profile.id'),
        status: ValidationResourceProfileStatus.pending,
      );

  final String id;
  final ValidationResourceProfileStatus status;
  final String? _datasetId;
  final String? _datasetVersionId;
  final String? _datasetPartition;
  final String? _datasetSha256;
  final String? _workflowId;
  final String? _workflowVersionId;
  final String? _workflowVersion;
  final List<ValidationModelRequirement> modelRequirements;
  final List<ValidationOutputContract> outputContract;

  bool get isReady => status == ValidationResourceProfileStatus.ready;
  bool get isConfigured => isReady;
  bool get isPending => status == ValidationResourceProfileStatus.pending;

  String get datasetId => _readyValue(_datasetId, 'datasetId');
  String get datasetVersionId =>
      _readyValue(_datasetVersionId, 'datasetVersionId');
  String get datasetPartition =>
      _readyValue(_datasetPartition, 'datasetPartition');
  String get datasetSha256 => _readyValue(_datasetSha256, 'datasetSha256');
  String get workflowId => _readyValue(_workflowId, 'workflowId');
  String get workflowVersionId =>
      _readyValue(_workflowVersionId, 'workflowVersionId');
  String get workflowVersion =>
      _readyValue(_workflowVersion, 'workflowVersion');

  ValidationModelRequirement get _singleModel {
    if (!isReady || modelRequirements.length != 1) {
      throw StateError('This compatibility getter requires one ready model.');
    }
    return modelRequirements.single;
  }

  // Kept until the existing one-profile runner is replaced by suite runners.
  String get controlModelVersionId => _singleModel.modelVersionId;
  String get controlModelSha256 => _singleModel.sha256;
  String get treatmentModelVersionId => _singleModel.modelVersionId;
  String get treatmentModelSha256 => _singleModel.sha256;
  String get treatmentWorkflowId => workflowId;
  String get treatmentWorkflowVersionId => workflowVersionId;
  String get treatmentWorkflowVersion => workflowVersion;
  ValidationInputContract get inputContract => _singleModel.inputContract;

  factory ValidationResourceProfile.fromJson(Map<String, Object?> json) {
    final id = _identifier(json['id'], 'profile.id');
    final statusName = _string(json['status'], 'profile.status');
    if (statusName == 'pending') {
      _requireKeys(json, const {'id', 'status'}, 'pending profile');
      return ValidationResourceProfile.pending(id: id);
    }
    if (statusName != 'ready') {
      throw const FormatException('Unknown resource profile status.');
    }
    _requireKeys(json, const {
      'id',
      'status',
      'datasetId',
      'datasetVersionId',
      'datasetPartition',
      'datasetSha256',
      'workflowId',
      'workflowVersionId',
      'workflowVersion',
      'modelRequirements',
      'outputContract',
    }, 'ready profile');

    final datasetSha256 = _sha256(json['datasetSha256'], 'datasetSha256');
    if (datasetSha256 == _emptySha256) {
      throw const FormatException(
        'A ready profile requires a real dataset hash.',
      );
    }
    final models = _objects(
      json['modelRequirements'],
      'modelRequirements',
    ).map(ValidationModelRequirement.fromJson).toList(growable: false);
    if (models.isEmpty) {
      throw const FormatException(
        'A ready profile requires at least one model.',
      );
    }
    _requireUnique(models.map((model) => model.nodeId), 'model node id');
    final outputs = _objects(
      json['outputContract'],
      'outputContract',
    ).map(ValidationOutputContract.fromJson).toList(growable: false);
    if (outputs.isEmpty) {
      throw const FormatException('At least one output contract is required.');
    }
    _requireUnique(outputs.map((output) => output.name), 'output name');
    return ValidationResourceProfile._(
      id: id,
      status: ValidationResourceProfileStatus.ready,
      datasetId: _identifier(json['datasetId'], 'datasetId'),
      datasetVersionId: _identifier(
        json['datasetVersionId'],
        'datasetVersionId',
      ),
      datasetPartition: _string(json['datasetPartition'], 'datasetPartition'),
      datasetSha256: datasetSha256,
      workflowId: _identifier(json['workflowId'], 'workflowId'),
      workflowVersionId: _identifier(
        json['workflowVersionId'],
        'workflowVersionId',
      ),
      workflowVersion: _semver(json['workflowVersion'], 'workflowVersion'),
      modelRequirements: models,
      outputContract: outputs,
    );
  }

  String _readyValue(String? value, String name) {
    if (!isReady || value == null) {
      throw StateError('$name is unavailable for a pending profile.');
    }
    return value;
  }
}

class ValidationModelRequirement {
  const ValidationModelRequirement({
    required this.nodeId,
    required this.modelVersionId,
    required this.sha256,
    required this.inputContract,
    required this.modelOutputContract,
  });

  final String nodeId;
  final String modelVersionId;
  final String sha256;
  final ValidationInputContract inputContract;
  final ValidationModelOutputContract modelOutputContract;

  factory ValidationModelRequirement.fromJson(Map<String, Object?> json) {
    _requireKeys(json, const {
      'nodeId',
      'modelVersionId',
      'sha256',
      'inputContract',
      'modelOutputContract',
    }, 'model requirement');
    final sha256 = _sha256(json['sha256'], 'model.sha256');
    if (sha256 == _emptySha256) {
      throw const FormatException(
        'A ready model requires a real SHA-256 hash.',
      );
    }
    return ValidationModelRequirement(
      nodeId: _identifier(json['nodeId'], 'model.nodeId'),
      modelVersionId: _identifier(json['modelVersionId'], 'modelVersionId'),
      sha256: sha256,
      inputContract: ValidationInputContract.fromJson(
        _object(json['inputContract'], 'inputContract'),
      ),
      modelOutputContract: ValidationModelOutputContract.fromJson(
        _object(json['modelOutputContract'], 'modelOutputContract'),
      ),
    );
  }
}

class ValidationInputContract {
  const ValidationInputContract({
    required this.width,
    required this.height,
    required this.channels,
    required this.normalization,
  });

  final int width;
  final int height;
  final int channels;
  final String normalization;

  factory ValidationInputContract.fromJson(Map<String, Object?> json) {
    _requireKeys(json, const {
      'width',
      'height',
      'channels',
      'normalization',
    }, 'input contract');
    final width = _positiveInt(json['width'], 'input.width');
    final height = _positiveInt(json['height'], 'input.height');
    final channels = _positiveInt(json['channels'], 'input.channels');
    final normalization = _string(json['normalization'], 'input.normalization');
    if (width > 8192 ||
        height > 8192 ||
        ![1, 3, 4].contains(channels) ||
        !{'none', 'zero_to_one', 'minus_one_to_one'}.contains(normalization)) {
      throw const FormatException(
        'Unsupported input contract for the validation harness.',
      );
    }
    return ValidationInputContract(
      width: width,
      height: height,
      channels: channels,
      normalization: normalization,
    );
  }
}

class ValidationModelOutputContract {
  ValidationModelOutputContract({
    required this.resultType,
    required List<String> labels,
    this.scoreThreshold,
    Map<String, int>? tensorIndices,
  }) : labels = List.unmodifiable(labels),
       tensorIndices = tensorIndices == null
           ? null
           : Map.unmodifiable(tensorIndices);

  final ValidationResultType resultType;
  final List<String> labels;
  final double? scoreThreshold;
  final Map<String, int>? tensorIndices;

  factory ValidationModelOutputContract.fromJson(Map<String, Object?> json) {
    const requiredKeys = {'type', 'labels'};
    if (requiredKeys.difference(json.keys.toSet()).isNotEmpty ||
        json.keys.toSet().difference({
          ...requiredKeys,
          'scoreThreshold',
          'tensorIndices',
        }).isNotEmpty) {
      throw const FormatException(
        'model output contract has missing or unknown fields.',
      );
    }
    final contract = ValidationOutputContract.fromJson({
      'name': 'result',
      'resultType': json['type'],
      'labels': json['labels'],
      if (json.containsKey('scoreThreshold'))
        'scoreThreshold': json['scoreThreshold'],
      if (json.containsKey('tensorIndices'))
        'tensorIndices': json['tensorIndices'],
    });
    if (contract.resultType == ValidationResultType.boolean ||
        (contract.resultType == ValidationResultType.detection &&
            (contract.scoreThreshold == null ||
                contract.tensorIndices == null))) {
      throw const FormatException(
        'Model outputs must declare classification or complete detection contracts.',
      );
    }
    return ValidationModelOutputContract(
      resultType: contract.resultType,
      labels: contract.labels,
      scoreThreshold: contract.scoreThreshold,
      tensorIndices: contract.tensorIndices,
    );
  }
}

class ValidationOutputContract {
  ValidationOutputContract({
    required this.name,
    required this.resultType,
    required List<String> labels,
    this.scoreThreshold,
    Map<String, int>? tensorIndices,
  }) : labels = List.unmodifiable(labels),
       tensorIndices = tensorIndices == null
           ? null
           : Map.unmodifiable(tensorIndices);

  final String name;
  final ValidationResultType resultType;
  final List<String> labels;
  final double? scoreThreshold;
  final Map<String, int>? tensorIndices;

  factory ValidationOutputContract.fromJson(Map<String, Object?> json) {
    const requiredKeys = {'name', 'resultType', 'labels'};
    if (requiredKeys.difference(json.keys.toSet()).isNotEmpty ||
        json.keys.toSet().difference({
          ...requiredKeys,
          'scoreThreshold',
          'tensorIndices',
        }).isNotEmpty) {
      throw const FormatException(
        'output contract has missing or unknown fields.',
      );
    }
    final resultTypeName = _string(json['resultType'], 'output.resultType');
    final resultType = ValidationResultType.values
        .where((value) => value.name == resultTypeName)
        .firstOrNull;
    if (resultType == null) {
      throw const FormatException('Unknown output result type.');
    }
    final labels = _strings(json['labels'], 'output.labels');
    _requireUnique(labels, 'output label');
    if (resultType == ValidationResultType.classification && labels.isEmpty) {
      throw const FormatException('Classification outputs require labels.');
    }
    if (resultType == ValidationResultType.boolean && labels.isNotEmpty) {
      throw const FormatException('Boolean outputs must not declare labels.');
    }
    final scoreThreshold = json['scoreThreshold'];
    final rawTensorIndices = json['tensorIndices'];
    if (resultType == ValidationResultType.detection) {
      if (json.containsKey('scoreThreshold') !=
              json.containsKey('tensorIndices') ||
          (scoreThreshold != null &&
              (scoreThreshold is! num ||
                  !scoreThreshold.isFinite ||
                  scoreThreshold < 0 ||
                  scoreThreshold > 1))) {
        throw const FormatException(
          'Detection output thresholds and tensor indices must be declared together.',
        );
      }
      const tensorRoles = {'boxes', 'classes', 'scores', 'count'};
      if (rawTensorIndices != null &&
          (rawTensorIndices is! Map ||
              rawTensorIndices.keys
                  .toSet()
                  .difference(tensorRoles)
                  .isNotEmpty ||
              tensorRoles
                  .difference(rawTensorIndices.keys.toSet())
                  .isNotEmpty ||
              rawTensorIndices.values.any(
                (value) => value is! int || value < 0 || value >= 4,
              ) ||
              rawTensorIndices.values.toSet().length != tensorRoles.length)) {
        throw const FormatException(
          'Detection outputs require distinct tensor indices for boxes, classes, scores, and count.',
        );
      }
    } else if (json.containsKey('scoreThreshold') ||
        json.containsKey('tensorIndices')) {
      throw const FormatException(
        'Only detection outputs may declare detection metadata.',
      );
    }
    return ValidationOutputContract(
      name: _string(json['name'], 'output.name'),
      resultType: resultType,
      labels: labels,
      scoreThreshold: (scoreThreshold as num?)?.toDouble(),
      tensorIndices: rawTensorIndices == null
          ? null
          : {
              for (final entry in (rawTensorIndices as Map).entries)
                entry.key as String: entry.value as int,
            },
    );
  }
}

void _validatePlanScenarios(
  List<ValidationScenario> scenarios,
  List<ValidationResourceProfile> profiles,
) {
  final coldStarts = scenarios
      .where((scenario) => scenario.phase == ValidationPhase.coldStart)
      .toList();
  if (coldStarts.length != 1 || coldStarts.single.resourceProfileId != null) {
    throw const FormatException('Plan requires one external PERF-01 scenario.');
  }
  final coldStart = coldStarts.single;
  if (coldStart.repetitions != 30 ||
      !_sameInts(coldStart.blockSizes, const [30])) {
    throw const FormatException('PERF-01 requires 30 external measurements.');
  }

  const expected = <ValidationPhase, (int repetitions, List<int> blocks)>{
    ValidationPhase.warmup: (20, [20]),
    ValidationPhase.measured: (300, [100, 100, 100]),
    ValidationPhase.stress: (1024, [1024]),
  };
  for (final profile in profiles) {
    for (final entry in expected.entries) {
      final matching = scenarios
          .where(
            (scenario) =>
                scenario.resourceProfileId == profile.id &&
                scenario.phase == entry.key,
          )
          .toList();
      if (matching.length != 1 ||
          matching.single.repetitions != entry.value.$1 ||
          !_sameInts(matching.single.blockSizes, entry.value.$2)) {
        throw FormatException(
          'Profile ${profile.id} requires one valid ${entry.key.name} scenario.',
        );
      }
    }
  }
  if (scenarios.any(
    (scenario) =>
        [
          ValidationPhase.warmup,
          ValidationPhase.measured,
          ValidationPhase.stress,
        ].contains(scenario.phase) &&
        !profiles.any((profile) => profile.id == scenario.resourceProfileId),
  )) {
    throw const FormatException('Runnable scenarios require a known profile.');
  }

  final faults = scenarios
      .where((scenario) => scenario.phase == ValidationPhase.fault)
      .toList();
  if (faults.length != 6 ||
      faults.map((scenario) => scenario.id).toSet().difference({
        'F1',
        'F2',
        'F3',
        'F4',
        'F5',
        'F6',
      }).isNotEmpty ||
      !faults.map((scenario) => scenario.id).toSet().containsAll({
        'F1',
        'F2',
        'F3',
        'F4',
        'F5',
        'F6',
      }) ||
      faults.any(
        (scenario) =>
            scenario.repetitions != 30 ||
            !_sameInts(scenario.blockSizes, const [30]) ||
            scenario.resourceProfileId != null,
      )) {
    throw const FormatException(
      'Plan requires fault scenarios F1-F6 with 30 repetitions each.',
    );
  }
}

Map<String, Object?> _object(Object? value, String name) {
  if (value is Map<String, Object?>) return value;
  if (value is Map) {
    return value.map((key, value) => MapEntry(key.toString(), value));
  }
  throw FormatException('$name must be an object.');
}

List<Map<String, Object?>> _objects(Object? value, String name) {
  if (value is! List) throw FormatException('$name must be a list.');
  return value.map((item) => _object(item, name)).toList(growable: false);
}

List<String> _strings(Object? value, String name) {
  if (value is! List) throw FormatException('$name must be a list.');
  return value.map((item) => _string(item, name)).toList(growable: false);
}

List<int> _integers(Object? value, String name) {
  if (value is! List) throw FormatException('$name must be a list.');
  return value
      .map((item) {
        if (item is! int) throw FormatException('$name must contain integers.');
        return item;
      })
      .toList(growable: false);
}

String _string(Object? value, String name) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$name must be a non-empty string.');
  }
  return value;
}

String _identifier(Object? value, String name) {
  final identifier = _string(value, name);
  if (!RegExp(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$').hasMatch(identifier)) {
    throw FormatException('$name must be a safe identifier.');
  }
  return identifier;
}

int _positiveInt(Object? value, String name) {
  if (value is! int || value <= 0) {
    throw FormatException('$name must be a positive integer.');
  }
  return value;
}

bool _boolean(Object? value, String name) {
  if (value is! bool) throw FormatException('$name must be a boolean.');
  return value;
}

String _sha256(Object? value, String name) {
  final digest = _string(value, name);
  if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(digest)) {
    throw FormatException('$name must be a lowercase SHA-256 digest.');
  }
  return digest;
}

String _semver(Object? value, String name) {
  final version = _string(value, name);
  if (!RegExp(
    r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$',
  ).hasMatch(version)) {
    throw FormatException('$name must be a semantic version.');
  }
  return version;
}

void _requireKeys(
  Map<String, Object?> json,
  Set<String> expected,
  String name,
) {
  final missing = expected.difference(json.keys.toSet());
  final unknown = json.keys.toSet().difference(expected);
  if (missing.isNotEmpty || unknown.isNotEmpty) {
    throw FormatException('$name has missing or unknown fields.');
  }
}

void _requireUnique(Iterable<String> values, String name) {
  final list = values.toList(growable: false);
  if (list.toSet().length != list.length) {
    throw FormatException('$name values must be unique.');
  }
}

bool _sameInts(List<int> left, List<int> right) =>
    left.length == right.length &&
    List.generate(
      left.length,
      (index) => left[index] == right[index],
    ).every((same) => same);

String _coldStartLabel(int index) =>
    'PERF-01-${index.toString().padLeft(3, '0')}';

const _emptySha256 =
    '0000000000000000000000000000000000000000000000000000000000000000';
