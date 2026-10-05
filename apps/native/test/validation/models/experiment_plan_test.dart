import 'dart:convert';

import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/models/validation_run_metadata.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ExperimentPlan', () {
    test('parses the versioned plan and selects its resource profile', () {
      final plan = ExperimentPlan.fromJson(_validPlan());

      expect(plan.schemaVersion, '1');
      expect(plan.activeResourceProfile.id, 'coffee-classification');
      expect(
        plan.activeResourceProfile.controlModelVersionId,
        'model-version-1',
      );
      expect(
        plan.activeResourceProfile.treatmentModelVersionId,
        'model-version-1',
      );
      expect(
        plan.activeResourceProfile.inputContract.normalization,
        'zero_to_one',
      );
      expect(plan.scenarios, hasLength(10));
    });

    test(
      'rejects output contracts the direct control runner cannot execute',
      () {
        for (final outputs in [
          [
            {'name': 'accepted', 'resultType': 'boolean', 'labels': <String>[]},
          ],
          [
            {
              'name': 'classification',
              'resultType': 'classification',
              'labels': ['coffee'],
            },
            {'name': 'accepted', 'resultType': 'boolean', 'labels': <String>[]},
          ],
        ]) {
          final json = _validPlan();
          final profiles = json['resourceProfiles']! as List<Object?>;
          final profile = Map<String, Object?>.from(profiles.single! as Map)
            ..['outputContract'] = outputs;
          profiles[0] = profile;

          expect(() => ExperimentPlan.fromJson(json), throwsFormatException);
        }
      },
    );

    test('requires explicit, distinct tensor roles for detection outputs', () {
      final contract = ValidationOutputContract.fromJson({
        'name': 'objects',
        'resultType': 'detection',
        'labels': ['coffee'],
        'scoreThreshold': 0.5,
        'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 3},
      });
      expect(contract.tensorIndices, {
        'boxes': 0,
        'classes': 1,
        'scores': 2,
        'count': 3,
      });

      expect(
        () => ValidationOutputContract.fromJson({
          'name': 'objects',
          'resultType': 'detection',
          'labels': ['coffee'],
          'scoreThreshold': 0.5,
          'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 1, 'count': 3},
        }),
        throwsFormatException,
      );
    });

    test(
      'accepts only image preprocessing contracts supported by ayni_sdk',
      () {
        final json = _validPlan();
        final profiles = json['resourceProfiles']! as List<Object?>;
        final profile = Map<String, Object?>.from(profiles.single! as Map);
        profile['inputContract'] = {
          'width': 224,
          'height': 224,
          'channels': 4,
          'normalization': 'minus_one_to_one',
        };
        profiles[0] = profile;

        final parsed = ExperimentPlan.fromJson(json);
        expect(parsed.activeResourceProfile.inputContract.channels, 4);
        expect(
          parsed.activeResourceProfile.inputContract.normalization,
          'minus_one_to_one',
        );

        final incompatible = _validPlan();
        final incompatibleProfiles =
            incompatible['resourceProfiles']! as List<Object?>;
        final incompatibleProfile = Map<String, Object?>.from(
          incompatibleProfiles.single! as Map,
        );
        incompatibleProfile['inputContract'] = {
          'width': 224,
          'height': 224,
          'channels': 3,
          'normalization': 'bgr_mean',
        };
        incompatibleProfiles[0] = incompatibleProfile;
        expect(
          () => ExperimentPlan.fromJson(incompatible),
          throwsFormatException,
        );

        final oversized = _validPlan();
        final oversizedProfiles =
            oversized['resourceProfiles']! as List<Object?>;
        final oversizedProfile = Map<String, Object?>.from(
          oversizedProfiles.single! as Map,
        );
        oversizedProfile['inputContract'] = {
          'width': 8193,
          'height': 224,
          'channels': 3,
          'normalization': 'zero_to_one',
        };
        oversizedProfiles[0] = oversizedProfile;
        expect(() => ExperimentPlan.fromJson(oversized), throwsFormatException);
      },
    );

    test('loads a plan from an asset bundle', () async {
      final json = jsonEncode(_validPlan());
      final plan = await ExperimentPlan.load(_JsonAssetBundle(json));

      expect(plan.activeResourceProfile.id, 'coffee-classification');
      expect(plan.scenarios, isNotEmpty);
    });

    test(
      'loads the bundled Plan template without treating placeholder resources as verified',
      () async {
        final plan = await ExperimentPlan.load(rootBundle);

        expect(plan.schemaVersion, '1');
        expect(plan.activeResourceProfile.isConfigured, isFalse);
        expect(plan.scenarios, hasLength(10));
      },
    );

    test('rejects an unsupported schema version', () {
      final json = _validPlan()..['schemaVersion'] = '2';

      expect(() => ExperimentPlan.fromJson(json), throwsFormatException);
    });

    test('rejects a plan without its selected resource profile', () {
      final json = _validPlan()..['resourceProfiles'] = <Object?>[];

      expect(() => ExperimentPlan.fromJson(json), throwsFormatException);
    });

    test('rejects duplicate case IDs in a scenario', () {
      final json = _validPlan();
      final scenarios = json['scenarios']! as List<Object?>;
      final warmup = Map<String, Object?>.from(scenarios[1]! as Map);
      warmup['caseIds'] = <String>['case-1', 'case-1'];
      scenarios[1] = warmup;

      expect(() => ExperimentPlan.fromJson(json), throwsFormatException);
    });

    test('rejects invalid counts and unknown phases', () {
      final invalidCount = _validPlan();
      final invalidCountScenarios = invalidCount['scenarios']! as List<Object?>;
      final warmup = Map<String, Object?>.from(
        invalidCountScenarios[1]! as Map,
      );
      warmup['repetitions'] = 0;
      invalidCountScenarios[1] = warmup;

      expect(
        () => ExperimentPlan.fromJson(invalidCount),
        throwsFormatException,
      );

      final invalidPhase = _validPlan();
      final invalidPhaseScenarios = invalidPhase['scenarios']! as List<Object?>;
      final unknown = Map<String, Object?>.from(
        invalidPhaseScenarios[1]! as Map,
      );
      unknown['phase'] = 'baseline';
      invalidPhaseScenarios[1] = unknown;

      expect(
        () => ExperimentPlan.fromJson(invalidPhase),
        throwsFormatException,
      );
    });

    test(
      'requires the Plan cold-start labels to remain external and numbered',
      () {
        final plan = ExperimentPlan.fromJson(_validPlan());
        final coldStart = plan.scenarioFor(ValidationPhase.coldStart);

        expect(coldStart.repetitions, 30);
        expect(coldStart.runLabels, hasLength(30));
        expect(coldStart.runLabels.first, 'PERF-01-001');
        expect(coldStart.requiresExternalMeasurement, isTrue);

        final invalid = _validPlan();
        final scenarios = invalid['scenarios']! as List<Object?>;
        final coldScenario = Map<String, Object?>.from(scenarios.first! as Map);
        coldScenario['runLabels'] =
            (coldScenario['runLabels']! as List<Object?>).take(29).toList();
        scenarios[0] = coldScenario;

        expect(() => ExperimentPlan.fromJson(invalid), throwsFormatException);
      },
    );

    test('preserves 20 warmups and three measured blocks of 100', () {
      final plan = ExperimentPlan.fromJson(_validPlan());

      final warmup = plan.scenarioFor(ValidationPhase.warmup);
      expect(warmup.repetitions, 20);
      expect(warmup.blockSizes, [20]);

      final measured = plan.scenarioFor(ValidationPhase.measured);
      expect(measured.repetitions, 300);
      expect(measured.blockSizes, [100, 100, 100]);
    });

    test('preserves the 1,024-run stress phase', () {
      final stress = ExperimentPlan.fromJson(
        _validPlan(),
      ).scenarioFor(ValidationPhase.stress);

      expect(stress.repetitions, 1024);
      expect(stress.blockSizes, [1024]);
    });

    test('preserves 30 repetitions for every Plan fault scenario', () {
      final faults = ExperimentPlan.fromJson(
        _validPlan(),
      ).scenariosFor(ValidationPhase.fault);

      expect(faults.map((scenario) => scenario.id).toSet(), {
        'F1',
        'F2',
        'F3',
        'F4',
        'F5',
        'F6',
      });
      expect(faults, hasLength(6));
      expect(faults.map((scenario) => scenario.repetitions), everyElement(30));
    });

    test(
      'rejects profiles whose direct and workflow models are not the same version',
      () {
        final json = _validPlan();
        final profiles = json['resourceProfiles']! as List<Object?>;
        final profile = Map<String, Object?>.from(profiles.single! as Map);
        profile['treatmentModelVersionId'] = 'different-model-version';
        profiles[0] = profile;

        expect(() => ExperimentPlan.fromJson(json), throwsFormatException);
      },
    );

    test('rejects unknown root keys and mismatched model hashes', () {
      final unknown = _validPlan()..['secret'] = 'must-not-be-accepted';
      expect(() => ExperimentPlan.fromJson(unknown), throwsFormatException);

      final differentHash = _validPlan();
      final profiles = differentHash['resourceProfiles']! as List<Object?>;
      final profile = Map<String, Object?>.from(profiles.single! as Map);
      profile['treatmentModelSha256'] = 'c' * 64;
      profiles[0] = profile;
      expect(
        () => ExperimentPlan.fromJson(differentHash),
        throwsFormatException,
      );
    });

    test('exposes immutable scenarios and case identifiers', () {
      final plan = ExperimentPlan.fromJson(_validPlan());

      expect(() => plan.scenarios.clear(), throwsUnsupportedError);
      expect(
        () => plan.scenarioFor(ValidationPhase.warmup).blockSizes.add(2),
        throwsUnsupportedError,
      );
    });
  });

  group('ValidationRunRecord', () {
    test(
      'keeps paired repetitions one-based and round-trips only result metadata',
      () {
        final record = ValidationRunRecord(
          pairRunId: 'paired-run-1',
          repetition: 1,
          condition: ValidationCondition.treatment,
          phase: ValidationPhase.measured,
          scenarioId: 'PERF-02',
          caseId: 'image-001',
          datasetVersionId: 'dataset-version-1',
          datasetPartition: 'test',
          datasetSha256: 'a' * 64,
          inputSha256: 'b' * 64,
          modelVersionId: 'model-version-1',
          modelSha256: 'c' * 64,
          workflowVersionId: 'workflow-version-1',
          workflowVersion: '1.0.0',
          backend: 'CPU',
          metadata: const ValidationRunMetadata(
            deviceModel: 'Pixel 8',
            platform: 'android',
            osVersion: '16',
            apiLevel: 36,
            appVersion: '1.0.0',
            sdkVersion: '0.2.0',
          ),
          durationMicros: 1200,
          outcome: ValidationRunOutcome.success,
          traceCaptureEnabled: false,
          normalizedOutput: const {
            'classification': {'label': 'sana', 'score': 0.9},
          },
        );
        final restored = ValidationRunRecord.fromJson(record.toJson());

        expect(restored.pairRunId, 'paired-run-1');
        expect(restored.repetition, 1);
        expect(restored.condition, ValidationCondition.treatment);
        expect(restored.metadata.deviceModel, 'Pixel 8');
        expect(restored.metadata.sdkVersion, '0.2.0');
        expect(restored.traceCaptureEnabled, isFalse);
        expect(restored.normalizedOutput, {
          'classification': {'label': 'sana', 'score': 0.9},
        });
        expect(record.toJson().keys, isNot(contains('inputBytes')));
        expect(record.toJson().keys, isNot(contains('credential')));
        expect(record.toJson().keys, isNot(contains('trace')));

        for (final invalidVersion in ['1.0.0-.', '1.0.0-01']) {
          final invalidRecord = Map<String, Object?>.from(record.toJson())
            ..['workflowVersion'] = invalidVersion;
          expect(
            () => ValidationRunRecord.fromJson(invalidRecord),
            throwsFormatException,
          );
        }
      },
    );

    test('rejects a zero-based repetition', () {
      expect(
        () => ValidationRunRecord(
          pairRunId: 'paired-run-1',
          repetition: 0,
          condition: ValidationCondition.control,
          phase: ValidationPhase.measured,
          scenarioId: 'PERF-02',
          caseId: 'image-001',
          datasetVersionId: 'dataset-version-1',
          datasetPartition: 'test',
          datasetSha256: 'a' * 64,
          inputSha256: 'b' * 64,
          modelVersionId: 'model-version-1',
          modelSha256: 'c' * 64,
          workflowVersionId: null,
          workflowVersion: null,
          backend: 'CPU',
          metadata: const ValidationRunMetadata(
            deviceModel: 'Pixel 8',
            platform: 'android',
            osVersion: '16',
            apiLevel: 36,
            appVersion: '1.0.0',
            sdkVersion: '0.2.0',
          ),
          durationMicros: 1200,
          outcome: ValidationRunOutcome.success,
          traceCaptureEnabled: false,
          normalizedOutput: const {},
        ),
        throwsFormatException,
      );
    });
  });
}

Map<String, Object?> _validPlan() {
  final coldStartLabels = List<String>.generate(
    30,
    (index) => 'PERF-01-${(index + 1).toString().padLeft(3, '0')}',
  );
  final phases = <Map<String, Object?>>[
    _scenario(
      id: 'PERF-01',
      phase: 'coldStart',
      repetitions: 30,
      blockSizes: [30],
      runLabels: coldStartLabels,
      requiresExternalMeasurement: true,
    ),
    _scenario(
      id: 'PERF-02-WARMUP',
      phase: 'warmup',
      repetitions: 20,
      blockSizes: [20],
    ),
    _scenario(
      id: 'PERF-02',
      phase: 'measured',
      repetitions: 300,
      blockSizes: [100, 100, 100],
    ),
    _scenario(
      id: 'PERF-04',
      phase: 'stress',
      repetitions: 1024,
      blockSizes: [1024],
    ),
    for (final id in ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'])
      _scenario(id: id, phase: 'fault', repetitions: 30, blockSizes: [30]),
  ];

  return {
    'schemaVersion': '1',
    'activeResourceProfileId': 'coffee-classification',
    'caseIds': <String>[],
    'resourceProfiles': <Object?>[
      {
        'id': 'coffee-classification',
        'datasetVersionId': 'dataset-version-to-configure',
        'datasetPartition': 'test',
        'datasetSha256': 'a' * 64,
        'controlModelVersionId': 'model-version-1',
        'controlModelSha256': 'b' * 64,
        'treatmentWorkflowId': 'workflow-to-configure',
        'treatmentWorkflowVersionId': 'workflow-version-to-configure',
        'treatmentWorkflowVersion': '1.0.0',
        'treatmentModelVersionId': 'model-version-1',
        'treatmentModelSha256': 'b' * 64,
        'inputContract': {
          'width': 224,
          'height': 224,
          'channels': 3,
          'normalization': 'zero_to_one',
        },
        'outputContract': [
          {
            'name': 'classification',
            'resultType': 'classification',
            'labels': [
              'sana',
              'roya',
              'minador',
              'mancha-de-hierro',
              'araniata-roja',
            ],
          },
        ],
      },
    ],
    'scenarios': phases.cast<Object?>(),
  };
}

Map<String, Object?> _scenario({
  required String id,
  required String phase,
  required int repetitions,
  required List<int> blockSizes,
  List<String> runLabels = const [],
  bool requiresExternalMeasurement = false,
}) => {
  'id': id,
  'phase': phase,
  'repetitions': repetitions,
  'blockSizes': blockSizes,
  'caseIds': <String>[],
  'runLabels': runLabels,
  'requiresExternalMeasurement': requiresExternalMeasurement,
};

class _JsonAssetBundle extends CachingAssetBundle {
  _JsonAssetBundle(this.contents);

  final String contents;

  @override
  Future<ByteData> load(String key) async =>
      ByteData.sublistView(Uint8List.fromList(utf8.encode(contents)));
}
