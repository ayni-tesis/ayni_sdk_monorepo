import 'dart:convert';

import 'package:flutter/services.dart';

enum ValidationPhase { coldStart, warmup, measured, stress, fault }

enum ValidationResultType { classification, detection, boolean }

class ExperimentPlan {
  ExperimentPlan._({
    required this.schemaVersion,
    required this.activeResourceProfile,
    required List<String> caseIds,
    required List<ValidationResourceProfile> resourceProfiles,
    required List<ValidationScenario> scenarios,
  }) : caseIds = List.unmodifiable(caseIds),
       resourceProfiles = List.unmodifiable(resourceProfiles),
       scenarios = List.unmodifiable(scenarios);

  static const assetPath = 'assets/validation/experiment_plan.json';

  final String schemaVersion;
  final ValidationResourceProfile activeResourceProfile;
  final List<String> caseIds;
  final List<ValidationResourceProfile> resourceProfiles;
  final List<ValidationScenario> scenarios;

  factory ExperimentPlan.fromJson(Map<String, Object?> json) {
    _requireKeys(json, const {
      'schemaVersion',
      'activeResourceProfileId',
      'caseIds',
      'resourceProfiles',
      'scenarios',
    }, 'plan');
    final schemaVersion = _string(json['schemaVersion'], 'schemaVersion');
    if (schemaVersion != '1') {
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
    final activeId = _string(
      json['activeResourceProfileId'],
      'activeResourceProfileId',
    );
    final activeMatches = profiles
        .where((profile) => profile.id == activeId)
        .toList();
    if (activeMatches.length != 1) {
      throw const FormatException(
        'The active resource profile does not exist.',
      );
    }

    final caseIds = _strings(json['caseIds'], 'caseIds');
    _requireUnique(caseIds, 'caseId');
    final scenarioRows = _objects(json['scenarios'], 'scenarios');
    final scenarios = scenarioRows
        .map(ValidationScenario.fromJson)
        .toList(growable: false);
    _requireUnique(scenarios.map((scenario) => scenario.id), 'scenario id');
    _validatePlanScenarios(scenarios);

    return ExperimentPlan._(
      schemaVersion: schemaVersion,
      activeResourceProfile: activeMatches.single,
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

  ValidationScenario scenarioFor(ValidationPhase phase) {
    final matches = scenarios
        .where((scenario) => scenario.phase == phase)
        .toList();
    if (matches.length != 1) {
      throw StateError('Expected exactly one ${phase.name} scenario.');
    }
    return matches.single;
  }

  List<ValidationScenario> scenariosFor(ValidationPhase phase) =>
      List.unmodifiable(scenarios.where((scenario) => scenario.phase == phase));
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

  factory ValidationScenario.fromJson(Map<String, Object?> json) {
    _requireKeys(json, const {
      'id',
      'phase',
      'repetitions',
      'blockSizes',
      'caseIds',
      'runLabels',
      'requiresExternalMeasurement',
    }, 'scenario');
    final phaseName = _string(json['phase'], 'scenario.phase');
    final phase = ValidationPhase.values
        .where((value) => value.name == phaseName)
        .firstOrNull;
    if (phase == null) throw const FormatException('Unknown validation phase.');

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
    );
  }
}

class ValidationResourceProfile {
  ValidationResourceProfile({
    required this.id,
    required this.datasetVersionId,
    required this.datasetPartition,
    required this.datasetSha256,
    required this.controlModelVersionId,
    required this.controlModelSha256,
    required this.treatmentWorkflowId,
    required this.treatmentWorkflowVersionId,
    required this.treatmentWorkflowVersion,
    required this.treatmentModelVersionId,
    required this.treatmentModelSha256,
    required this.inputContract,
    required List<ValidationOutputContract> outputContract,
  }) : outputContract = List.unmodifiable(outputContract);

  final String id;
  final String datasetVersionId;
  final String datasetPartition;
  final String datasetSha256;
  final String controlModelVersionId;
  final String controlModelSha256;
  final String treatmentWorkflowId;
  final String treatmentWorkflowVersionId;
  final String treatmentWorkflowVersion;
  final String treatmentModelVersionId;
  final String treatmentModelSha256;
  final ValidationInputContract inputContract;
  final List<ValidationOutputContract> outputContract;

  bool get isConfigured =>
      ![
        datasetVersionId,
        controlModelVersionId,
        treatmentWorkflowId,
        treatmentWorkflowVersionId,
      ].any((value) => value.toLowerCase().contains('to_configure')) &&
      datasetSha256 != _emptySha256 &&
      controlModelSha256 != _emptySha256;

  factory ValidationResourceProfile.fromJson(Map<String, Object?> json) {
    _requireKeys(json, const {
      'id',
      'datasetVersionId',
      'datasetPartition',
      'datasetSha256',
      'controlModelVersionId',
      'controlModelSha256',
      'treatmentWorkflowId',
      'treatmentWorkflowVersionId',
      'treatmentWorkflowVersion',
      'treatmentModelVersionId',
      'treatmentModelSha256',
      'inputContract',
      'outputContract',
    }, 'resource profile');
    final controlVersionId = _string(
      json['controlModelVersionId'],
      'controlModelVersionId',
    );
    final treatmentVersionId = _string(
      json['treatmentModelVersionId'],
      'treatmentModelVersionId',
    );
    final controlSha256 = _sha256(
      json['controlModelSha256'],
      'controlModelSha256',
    );
    final treatmentSha256 = _sha256(
      json['treatmentModelSha256'],
      'treatmentModelSha256',
    );
    if (controlVersionId != treatmentVersionId ||
        controlSha256 != treatmentSha256) {
      throw const FormatException(
        'Control and treatment must use the same model version and SHA-256.',
      );
    }
    final outputs = _objects(
      json['outputContract'],
      'outputContract',
    ).map(ValidationOutputContract.fromJson).toList(growable: false);
    if (outputs.isEmpty) {
      throw const FormatException('At least one output contract is required.');
    }
    if (outputs.length != 1 ||
        outputs.single.resultType == ValidationResultType.boolean) {
      throw const FormatException(
        'The direct control runner requires exactly one classification or detection output.',
      );
    }
    _requireUnique(outputs.map((output) => output.name), 'output name');
    return ValidationResourceProfile(
      id: _string(json['id'], 'profile.id'),
      datasetVersionId: _string(json['datasetVersionId'], 'datasetVersionId'),
      datasetPartition: _string(json['datasetPartition'], 'datasetPartition'),
      datasetSha256: _sha256(json['datasetSha256'], 'datasetSha256'),
      controlModelVersionId: controlVersionId,
      controlModelSha256: controlSha256,
      treatmentWorkflowId: _string(
        json['treatmentWorkflowId'],
        'treatmentWorkflowId',
      ),
      treatmentWorkflowVersionId: _string(
        json['treatmentWorkflowVersionId'],
        'treatmentWorkflowVersionId',
      ),
      treatmentWorkflowVersion: _semver(
        json['treatmentWorkflowVersion'],
        'treatmentWorkflowVersion',
      ),
      treatmentModelVersionId: treatmentVersionId,
      treatmentModelSha256: treatmentSha256,
      inputContract: ValidationInputContract.fromJson(
        _object(json['inputContract'], 'inputContract'),
      ),
      outputContract: outputs,
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
        'Unsupported input contract for ayni_sdk 0.2.0.',
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
    final scoreThreshold = json['scoreThreshold'];
    final rawTensorIndices = json['tensorIndices'];
    if (resultType == ValidationResultType.detection) {
      if (scoreThreshold is! num ||
          !scoreThreshold.isFinite ||
          scoreThreshold < 0 ||
          scoreThreshold > 1) {
        throw const FormatException(
          'Detection outputs require a scoreThreshold from 0 to 1.',
        );
      }
      const tensorRoles = {'boxes', 'classes', 'scores', 'count'};
      if (rawTensorIndices is! Map ||
          rawTensorIndices.keys.toSet().difference(tensorRoles).isNotEmpty ||
          tensorRoles.difference(rawTensorIndices.keys.toSet()).isNotEmpty ||
          rawTensorIndices.values.any(
            (value) => value is! int || value < 0 || value >= 4,
          ) ||
          rawTensorIndices.values.toSet().length != tensorRoles.length) {
        throw const FormatException(
          'Detection outputs require distinct tensor indices for boxes, classes, scores, and count.',
        );
      }
    } else if (json.containsKey('scoreThreshold')) {
      throw const FormatException(
        'Only detection outputs may declare scoreThreshold.',
      );
    } else if (json.containsKey('tensorIndices')) {
      throw const FormatException(
        'Only detection outputs may declare tensorIndices.',
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

void _validatePlanScenarios(List<ValidationScenario> scenarios) {
  for (final phase in ValidationPhase.values.where(
    (phase) => phase != ValidationPhase.fault,
  )) {
    if (scenarios.where((scenario) => scenario.phase == phase).length != 1) {
      throw FormatException(
        'Plan requires exactly one ${phase.name} scenario.',
      );
    }
  }
  final expected = <ValidationPhase, (int repetitions, List<int> blocks)>{
    ValidationPhase.coldStart: (30, [30]),
    ValidationPhase.warmup: (20, [20]),
    ValidationPhase.measured: (300, [100, 100, 100]),
    ValidationPhase.stress: (1024, [1024]),
  };
  for (final entry in expected.entries) {
    final matching = scenarios.singleWhere(
      (scenario) => scenario.phase == entry.key,
    );
    if (matching.repetitions != entry.value.$1 ||
        !_sameInts(matching.blockSizes, entry.value.$2)) {
      throw FormatException(
        'Unexpected ${entry.key.name} repetition or block count.',
      );
    }
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
            !_sameInts(scenario.blockSizes, const [30]),
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
