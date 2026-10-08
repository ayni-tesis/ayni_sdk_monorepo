import 'dart:convert';

import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/models/validation_run_metadata.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ExperimentPlan', () {
    test('parses a schema 2 plan with ready and pending resource profiles', () {
      final plan = ExperimentPlan.fromJson(_validPlan());

      expect(plan.schemaVersion, '2');
      expect(plan.activeResourceProfile.id, 'INT-01');
      final active = plan.activeResourceProfile as dynamic;
      expect(active.status.toString(), contains('ready'));
      expect(active.modelRequirements, hasLength(1));
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
      'accepts a profile with multiple models and detection tensor roles',
      () {
        final json = _validPlan();
        final profiles = json['resourceProfiles']! as List<Object?>;
        final profile = Map<String, Object?>.from(profiles.single! as Map);
        final models = profile['modelRequirements']! as List<Object?>;
        models.add({
          'nodeId': 'detector-node',
          'modelVersionId': 'model-version-2',
          'sha256': 'd' * 64,
          'inputContract': {
            'width': 320,
            'height': 320,
            'channels': 3,
            'normalization': 'zero_to_one',
          },
          'modelOutputContract': {
            'type': 'detection',
            'labels': ['leaf'],
            'scoreThreshold': 0.5,
            'tensorIndices': {
              'boxes': 2,
              'classes': 0,
              'scores': 3,
              'count': 1,
            },
          },
        });
        profiles[0] = profile;

        final parsed = ExperimentPlan.fromJson(json);
        final parsedProfile = parsed.activeResourceProfile as dynamic;
        expect(parsedProfile.modelRequirements, hasLength(2));
        expect(
          parsedProfile
              .modelRequirements
              .last
              .modelOutputContract
              .tensorIndices,
          {'boxes': 2, 'classes': 0, 'scores': 3, 'count': 1},
        );
      },
    );

    test('rejects duplicate model node IDs and unknown profile references', () {
      final duplicateNode = _validPlan();
      final profiles = duplicateNode['resourceProfiles']! as List<Object?>;
      final profile = Map<String, Object?>.from(profiles.single! as Map);
      final models = profile['modelRequirements']! as List<Object?>;
      models.add(Map<String, Object?>.from(models.single! as Map));
      profiles[0] = profile;
      expect(
        () => ExperimentPlan.fromJson(duplicateNode),
        throwsFormatException,
      );

      final unknownProfile = _validPlan();
      final scenarios = unknownProfile['scenarios']! as List<Object?>;
      final measured = Map<String, Object?>.from(scenarios[2]! as Map)
        ..['resourceProfileId'] = 'missing-profile';
      scenarios[2] = measured;
      expect(
        () => ExperimentPlan.fromJson(unknownProfile),
        throwsFormatException,
      );
    });

    test('pending profiles accept only an ID and status', () {
      final json = _validPlan();
      final profiles = json['resourceProfiles']! as List<Object?>
        ..add({'id': 'S2', 'status': 'pending'});
      for (final phase in ['warmup', 'measured', 'stress']) {
        json['scenarios'] = [
          ...(json['scenarios']! as List<Object?>),
          _scenario(
            id: 'S2-$phase',
            phase: phase,
            repetitions: switch (phase) {
              'warmup' => 20,
              'measured' => 300,
              _ => 1024,
            },
            blockSizes: switch (phase) {
              'warmup' => [20],
              'measured' => [100, 100, 100],
              _ => [1024],
            },
            resourceProfileId: 'S2',
          ),
        ];
      }
      expect(ExperimentPlan.fromJson(json).resourceProfiles, hasLength(2));

      profiles[1] = {
        'id': 'S2',
        'status': 'pending',
        'datasetVersionId': 'must-not-be-set',
      };
      expect(() => ExperimentPlan.fromJson(json), throwsFormatException);
    });

    test('accepts every typed final output, including composed workflows', () {
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

        expect(
          ExperimentPlan.fromJson(json).activeResourceProfile.outputContract,
          hasLength(outputs.length),
        );
      }
    });

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

      expect(
        () => ValidationOutputContract.fromJson({
          'name': 'objects',
          'resultType': 'detection',
          'labels': ['coffee'],
          'scoreThreshold': 0.5,
          'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 4},
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
        final models = profile['modelRequirements']! as List<Object?>;
        final model = Map<String, Object?>.from(models.single! as Map)
          ..['inputContract'] = {
            'width': 224,
            'height': 224,
            'channels': 4,
            'normalization': 'minus_one_to_one',
          };
        models[0] = model;
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
        final incompatibleModels =
            incompatibleProfile['modelRequirements']! as List<Object?>;
        final incompatibleModel =
            Map<String, Object?>.from(incompatibleModels.single! as Map)
              ..['inputContract'] = {
                'width': 224,
                'height': 224,
                'channels': 3,
                'normalization': 'bgr_mean',
              };
        incompatibleModels[0] = incompatibleModel;
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
        final oversizedModels =
            oversizedProfile['modelRequirements']! as List<Object?>;
        final oversizedModel =
            Map<String, Object?>.from(oversizedModels.single! as Map)
              ..['inputContract'] = {
                'width': 8193,
                'height': 224,
                'channels': 3,
                'normalization': 'zero_to_one',
              };
        oversizedModels[0] = oversizedModel;
        oversizedProfiles[0] = oversizedProfile;
        expect(() => ExperimentPlan.fromJson(oversized), throwsFormatException);
      },
    );

    test('loads a plan from an asset bundle', () async {
      final json = jsonEncode(_validPlan());
      final plan = await ExperimentPlan.load(_JsonAssetBundle(json));

      expect(plan.activeResourceProfile.id, 'INT-01');
      expect(plan.scenarios, isNotEmpty);
    });

    test(
      'loads the multi-case asset and maps each positive case to a profile',
      () async {
        final plan = await ExperimentPlan.load(rootBundle);
        final profile = plan.resourceProfiles.singleWhere(
          (profile) => profile.id == 'INT-01',
        );

        expect(plan.schemaVersion, '2');
        expect(profile.id, 'INT-01');
        expect(profile.isConfigured, isTrue);
        expect(
          profile.datasetVersionId,
          'fc7729f8-5b8a-433e-b811-f0220b4474d8',
        );
        expect(
          profile.controlModelVersionId,
          '5d980cc6-447f-4e53-afb9-8596b59faa69',
        );
        expect(
          profile.treatmentModelVersionId,
          '5d980cc6-447f-4e53-afb9-8596b59faa69',
        );
        expect(
          profile.treatmentWorkflowId,
          '452ccaf5-d39a-4ce6-a5a6-bcf9b2b0be83',
        );
        expect(
          profile.treatmentWorkflowVersionId,
          'c663e668-1a3b-498f-9cd1-858433de21ce',
        );
        final tomatoProfile = plan.resourceProfiles.singleWhere(
          (profile) => profile.id == 'REU-01',
        );
        expect(tomatoProfile.isConfigured, isTrue);
        expect(
          tomatoProfile.datasetVersionId,
          'bf671a9e-1668-496c-83b2-f60cf198373f',
        );
        expect(
          tomatoProfile.workflowVersionId,
          '85cd6afd-903b-467d-bc20-e3887f3fcc38',
        );
        expect(
          tomatoProfile.modelRequirements.single.nodeId,
          '96c2e159-e4e4-4c2e-b7c5-ee30063c43fa',
        );
        expect(plan.resourceProfiles, hasLength(5));
        expect(
          plan.resourceProfiles
              .where((profile) => profile.isPending)
              .map((profile) => profile.id),
          containsAll(['S1', 'S2', 'SEG-01']),
        );
        final runnable = plan.scenarios
            .where(
              (scenario) => (scenario as dynamic).resourceProfileId != null,
            )
            .toList();
        expect(runnable, hasLength(15));
        expect(
          runnable
              .map((scenario) => (scenario as dynamic).resourceProfileId)
              .toSet(),
          {'INT-01', 'S1', 'REU-01', 'S2', 'SEG-01'},
        );
        for (final scenario in runnable) {
          final expected = switch (scenario.phase) {
            ValidationPhase.warmup => (20, [20]),
            ValidationPhase.measured => (300, [100, 100, 100]),
            ValidationPhase.stress => (1024, [1024]),
            _ => fail('Unexpected runnable phase ${scenario.phase}.'),
          };
          expect(scenario.repetitions, expected.$1, reason: scenario.id);
          expect(scenario.blockSizes, expected.$2, reason: scenario.id);
        }
      },
    );

    test(
      'keeps local examples and SDK credentials out of the bundled plan',
      () async {
        final source = await rootBundle.loadString(ExperimentPlan.assetPath);
        expect(_isSafeBundledPlan(source), isTrue);
        expect(_isSafeBundledPlan('$source dataset-version-1'), isFalse);
        expect(_isSafeBundledPlan('$source ayni_sk_1234567890123456'), isFalse);

        final plan = ExperimentPlan.fromJson(
          (jsonDecode(source) as Map).cast<String, Object?>(),
        );
        expect(
          plan.resourceProfiles
              .where((profile) => profile.isPending)
              .map((profile) => profile.id),
          ['S1', 'S2', 'SEG-01'],
        );
      },
    );

    test('rejects an unsupported schema version', () {
      final json = _validPlan()..['schemaVersion'] = '3';

      expect(() => ExperimentPlan.fromJson(json), throwsFormatException);
    });

    test('rejects a plan without resource profiles', () {
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

    test('rejects unknown root keys and malformed model hashes', () {
      final unknown = _validPlan()..['secret'] = 'must-not-be-accepted';
      expect(() => ExperimentPlan.fromJson(unknown), throwsFormatException);

      final malformedHash = _validPlan();
      final profiles = malformedHash['resourceProfiles']! as List<Object?>;
      final profile = Map<String, Object?>.from(profiles.single! as Map);
      final models = profile['modelRequirements']! as List<Object?>;
      final model = Map<String, Object?>.from(models.single! as Map)
        ..['sha256'] = 'c' * 63;
      models[0] = model;
      profiles[0] = profile;
      expect(
        () => ExperimentPlan.fromJson(malformedHash),
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

  group('segmentation contracts', () {
    final voc = ['background', 'aeroplane', 'person'];

    Map<String, Object?> output({
      Object? scoreType = 'logits',
      bool withScoreType = true,
      List<String>? labels,
      String resultType = 'segmentation',
    }) => {
      'name': 'mask',
      'resultType': resultType,
      'labels': labels ?? voc,
      if (withScoreType) 'scoreType': scoreType,
    };

    test('requires a logits or probabilities scoreType on segmentation', () {
      for (final scoreType in ['logits', 'probabilities']) {
        final contract = ValidationOutputContract.fromJson(
          output(scoreType: scoreType),
        );
        expect(contract.resultType, ValidationResultType.segmentation);
        expect(contract.scoreType, scoreType);
        expect(contract.labels, voc);
      }

      expect(
        () => ValidationOutputContract.fromJson(output(withScoreType: false)),
        throwsFormatException,
      );
      for (final bad in ['softmax', '', null, 1]) {
        expect(
          () => ValidationOutputContract.fromJson(output(scoreType: bad)),
          throwsFormatException,
          reason: '$bad',
        );
      }
    });

    test('allows scoreType only on segmentation outputs', () {
      final withoutScoreType = <Map<String, Object?>>[
        {
          'name': 'classification',
          'resultType': 'classification',
          'labels': ['coffee'],
        },
        {
          'name': 'objects',
          'resultType': 'detection',
          'labels': ['coffee'],
          'scoreThreshold': 0.5,
          'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 3},
        },
        {'name': 'accepted', 'resultType': 'boolean', 'labels': <String>[]},
      ];
      for (final json in withoutScoreType) {
        expect(ValidationOutputContract.fromJson(json).scoreType, isNull);
        expect(
          () => ValidationOutputContract.fromJson({
            ...json,
            'scoreType': 'logits',
          }),
          throwsFormatException,
          reason: '${json['resultType']}',
        );
      }
    });

    test('accepts one to 256 distinct labels', () {
      expect(
        () => ValidationOutputContract.fromJson(output(labels: [])),
        throwsFormatException,
      );
      expect(
        ValidationOutputContract.fromJson(
          output(labels: [for (var i = 0; i < 256; i++) 'label-$i']),
        ).labels,
        hasLength(256),
      );
      expect(
        () => ValidationOutputContract.fromJson(
          output(labels: [for (var i = 0; i < 257; i++) 'label-$i']),
        ),
        throwsFormatException,
      );
      expect(
        () => ValidationOutputContract.fromJson(output(labels: ['a', 'a'])),
        throwsFormatException,
      );
    });

    test('a model output contract keeps its scoreType', () {
      final contract = ValidationModelOutputContract.fromJson({
        'type': 'segmentation',
        'labels': voc,
        'scoreType': 'probabilities',
      });
      expect(contract.resultType, ValidationResultType.segmentation);
      expect(contract.scoreType, 'probabilities');

      expect(
        () => ValidationModelOutputContract.fromJson({
          'type': 'segmentation',
          'labels': voc,
        }),
        throwsFormatException,
      );
      expect(
        () => ValidationModelOutputContract.fromJson({
          'type': 'classification',
          'labels': voc,
          'scoreType': 'logits',
        }),
        throwsFormatException,
      );
    });

    test('the one-model constructor carries the scoreType to its model', () {
      final profile = ValidationResourceProfile(
        id: 'SEG-01',
        datasetVersionId: 'dataset-version',
        datasetPartition: 'test',
        datasetSha256: 'a' * 64,
        controlModelVersionId: 'model-version',
        controlModelSha256: 'b' * 64,
        treatmentWorkflowId: 'workflow',
        treatmentWorkflowVersionId: 'workflow-version',
        treatmentWorkflowVersion: '1.0.0',
        treatmentModelVersionId: 'model-version',
        treatmentModelSha256: 'b' * 64,
        inputContract: const ValidationInputContract(
          width: 257,
          height: 257,
          channels: 3,
          normalization: 'minus_one_to_one',
        ),
        outputContract: [
          ValidationOutputContract(
            name: 'mask',
            resultType: ValidationResultType.segmentation,
            labels: voc,
            scoreType: 'logits',
          ),
        ],
      );

      expect(
        profile.modelRequirements.single.modelOutputContract.scoreType,
        'logits',
      );
    });

    test(
      'a ready profile with a segmentation model and boolean output parses',
      () {
        final profile = ValidationResourceProfile.fromJson({
          'id': 'SEG-01',
          'status': 'ready',
          'datasetId': 'dataset-id',
          'datasetVersionId': 'dataset-version-id',
          'datasetPartition': 'test',
          'datasetSha256': 'a' * 64,
          'workflowId': 'workflow-id',
          'workflowVersionId': 'workflow-version-id',
          'workflowVersion': '1.0.0',
          'modelRequirements': [
            {
              'nodeId': 'seg-node',
              'modelVersionId': 'seg-version',
              'sha256': 'b' * 64,
              'inputContract': {
                'width': 257,
                'height': 257,
                'channels': 3,
                'normalization': 'minus_one_to_one',
              },
              'modelOutputContract': {
                'type': 'segmentation',
                'labels': voc,
                'scoreType': 'logits',
              },
            },
          ],
          'outputContract': [
            output(),
            {
              'name': 'hasPerson',
              'resultType': 'boolean',
              'labels': <String>[],
            },
          ],
        });

        expect(profile.outputContract.map((item) => item.resultType), [
          ValidationResultType.segmentation,
          ValidationResultType.boolean,
        ]);
      },
    );

    test(
      'the bundled plan declares SEG-01 as pending with the three phases',
      () async {
        final source = await rootBundle.loadString(ExperimentPlan.assetPath);
        final plan = ExperimentPlan.fromJson(
          (jsonDecode(source) as Map).cast<String, Object?>(),
        );

        final profile = plan.resourceProfiles.singleWhere(
          (item) => item.id == 'SEG-01',
        );
        expect(profile.isPending, isTrue);
        expect(
          plan.scenarios
              .where((scenario) => scenario.resourceProfileId == 'SEG-01')
              .map(
                (scenario) =>
                    (scenario.id, scenario.phase, scenario.repetitions),
              ),
          [
            ('SEG-01-PERF-02-WARMUP', ValidationPhase.warmup, 20),
            ('SEG-01-PERF-02', ValidationPhase.measured, 300),
            ('SEG-01-PERF-04', ValidationPhase.stress, 1024),
          ],
        );
                final stressScenario = plan.scenarios.singleWhere(
                  (scenario) => scenario.id == 'SEG-01-PERF-04',
                );
                expect(stressScenario.caseIds, hasLength(300));
                expect(stressScenario.caseIds.toSet(), hasLength(300));
      },
    );
  });
}

bool _isSafeBundledPlan(String source) {
  const sampleIds = {
    'dataset-1',
    'dataset-version-1',
    'dataset-version-to-configure',
    'model-1',
    'model-version-1',
    'workflow-1',
    'workflow-version-1',
  };
  return !sampleIds.any(source.contains) &&
      !RegExp(r'ayni_sk_[A-Za-z0-9_-]{16,}').hasMatch(source);
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
      id: 'INT-01-PERF-02-WARMUP',
      phase: 'warmup',
      repetitions: 20,
      blockSizes: [20],
      resourceProfileId: 'INT-01',
    ),
    _scenario(
      id: 'INT-01-PERF-02',
      phase: 'measured',
      repetitions: 300,
      blockSizes: [100, 100, 100],
      resourceProfileId: 'INT-01',
    ),
    _scenario(
      id: 'INT-01-PERF-04',
      phase: 'stress',
      repetitions: 1024,
      blockSizes: [1024],
      resourceProfileId: 'INT-01',
    ),
    for (final id in ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'])
      _scenario(id: id, phase: 'fault', repetitions: 30, blockSizes: [30]),
  ];

  return {
    'schemaVersion': '2',
    'caseIds': <String>[],
    'resourceProfiles': <Object?>[
      {
        'id': 'INT-01',
        'status': 'ready',
        'datasetId': 'dataset-1',
        'datasetVersionId': 'dataset-version-to-configure',
        'datasetPartition': 'test',
        'datasetSha256': 'a' * 64,
        'workflowId': 'workflow-1',
        'workflowVersionId': 'workflow-version-1',
        'workflowVersion': '1.0.0',
        'modelRequirements': <Object?>[
          {
            'nodeId': 'model-1',
            'modelVersionId': 'model-version-1',
            'sha256': 'b' * 64,
            'inputContract': {
              'width': 224,
              'height': 224,
              'channels': 3,
              'normalization': 'zero_to_one',
            },
            'modelOutputContract': {
              'type': 'classification',
              'labels': ['sana', 'roya'],
            },
          },
        ],
        'outputContract': [
          {
            'name': 'classification',
            'resultType': 'classification',
            'labels': ['sana', 'roya'],
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
  String? resourceProfileId,
}) {
  final scenario = <String, Object?>{
    'id': id,
    'phase': phase,
    'repetitions': repetitions,
    'blockSizes': blockSizes,
    'caseIds': <String>[],
    'runLabels': runLabels,
    'requiresExternalMeasurement': requiresExternalMeasurement,
  };
  if (resourceProfileId != null) {
    scenario['resourceProfileId'] = resourceProfileId;
  }
  return scenario;
}

class _JsonAssetBundle extends CachingAssetBundle {
  _JsonAssetBundle(this.contents);

  final String contents;

  @override
  Future<ByteData> load(String key) async =>
      ByteData.sublistView(Uint8List.fromList(utf8.encode(contents)));
}
