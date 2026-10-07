import 'dart:io';
import 'dart:typed_data';
import 'dart:async';

import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:better_fullstack_app/validation/data/validation_model_repository.dart';
import 'package:better_fullstack_app/validation/data/workflow_definition_repository.dart';
import 'package:better_fullstack_app/validation/execution/direct_tflite_runner.dart';
import 'package:better_fullstack_app/validation/execution/validation_condition_runner.dart';
import 'package:better_fullstack_app/validation/execution/validation_image_preprocessor.dart';
import 'package:better_fullstack_app/validation/execution/validation_output_normalizer.dart';
import 'package:better_fullstack_app/validation/execution/validation_segmentation.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory temporaryDirectory;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp('ayni-direct-');
  });

  tearDown(() async {
    if (await temporaryDirectory.exists()) {
      await temporaryDirectory.delete(recursive: true);
    }
  });

  test(
    'passes the original image bytes to the CPU engine and reports exact model metadata',
    () async {
      final imageBytes = Uint8List.fromList([1, 2, 3, 4]);
      final modelFile = File('${temporaryDirectory.path}/model.tflite')
        ..writeAsBytesSync([7, 8, 9]);
      final repository = _ModelRepository(
        VerifiedModelArtifact(
          file: modelFile,
          modelVersionId: 'model-version-1',
          sha256: 'b' * 64,
          version: '1.0.0',
          contract: _modelContract(),
        ),
      );
      final engine = _FakeCpuEngine();
      final runner = DirectTfliteRunner(
        profile: _profile(),
        modelRepository: repository,
        workflowDefinitions: _MemoryWorkflowDefinitionRepository(
          _singleModelWorkflow(),
        ),
        inferenceEngine: engine,
      );
      await runner.prepare();
      final result = await runner.runCase(_request(imageBytes));

      expect(runner.condition, ValidationCondition.control);
      expect(runner.backend, 'CPU');
      expect(engine.receivedImageBytes, imageBytes);
      expect(result.outcome, ValidationRunOutcome.success);
      expect(result.modelVersionId, 'model-version-1');
      expect(result.modelSha256, 'b' * 64);
      expect(result.normalizedOutput, {
        'classification': {
          'type': 'classification',
          'label': 'roya',
          'confidence': 0.8,
          'confidences': {'sana': 0.1, 'roya': 0.8, 'minador': 0.1},
        },
      });
    },
  );

  test(
    'refuses a model artifact whose version or digest differs from the plan',
    () async {
      final modelFile = File('${temporaryDirectory.path}/model.tflite')
        ..writeAsBytesSync([7, 8, 9]);
      final runner = DirectTfliteRunner(
        profile: _profile(),
        modelRepository: _ModelRepository(
          VerifiedModelArtifact(
            file: modelFile,
            modelVersionId: 'another-model-version',
            sha256: 'b' * 64,
            version: '1.0.0',
            contract: _modelContract(),
          ),
        ),
        workflowDefinitions: _MemoryWorkflowDefinitionRepository(
          _singleModelWorkflow(),
        ),
        inferenceEngine: _FakeCpuEngine(),
      );

      await expectLater(
        runner.prepare(),
        throwsA(isA<ValidationExecutionException>()),
      );
    },
  );

  test(
    'refuses the expected version when its manifest SHA-256 differs',
    () async {
      final modelFile = File('${temporaryDirectory.path}/model.tflite')
        ..writeAsBytesSync([7, 8, 9]);
      final runner = DirectTfliteRunner(
        profile: _profile(),
        modelRepository: _ModelRepository(
          VerifiedModelArtifact(
            file: modelFile,
            modelVersionId: 'model-version-1',
            sha256: 'c' * 64,
            version: '1.0.0',
            contract: _modelContract(),
          ),
        ),
        workflowDefinitions: _MemoryWorkflowDefinitionRepository(
          _singleModelWorkflow(),
        ),
        inferenceEngine: _FakeCpuEngine(),
      );

      await expectLater(
        runner.prepare(),
        throwsA(isA<ValidationExecutionException>()),
      );
    },
  );

  test('uses the SDK pixel order, grayscale rule, and float normalization', () {
    final image = img.Image(width: 1, height: 1)..setPixelRgb(0, 0, 128, 64, 0);
    final bytes = Uint8List.fromList(img.encodePng(image));

    final rgb = prepareValidationImageTensor(
      bytes,
      const ValidationInputContract(
        width: 1,
        height: 1,
        channels: 3,
        normalization: 'zero_to_one',
      ),
    );
    final grayscale = prepareValidationImageTensor(
      bytes,
      const ValidationInputContract(
        width: 1,
        height: 1,
        channels: 1,
        normalization: 'minus_one_to_one',
      ),
    );

    expect(rgb[0], closeTo(128 / 255, 0.000001));
    expect(rgb[1], closeTo(64 / 255, 0.000001));
    expect(rgb[2], 0);
    expect(grayscale.single, closeTo(64 / 127.5 - 1, 0.000001));
  });

  test('maps undecodable image bytes to the invalidImage error', () {
    expect(
      () => prepareValidationImageTensor(
        Uint8List.fromList([0xff, 0xd8, 0xff]),
        const ValidationInputContract(
          width: 1,
          height: 1,
          channels: 3,
          normalization: 'zero_to_one',
        ),
      ),
      throwsA(
        isA<ValidationExecutionException>().having(
          (error) => error.code,
          'code',
          'invalidImage',
        ),
      ),
    );
  });

  test(
    'executes both model nodes, the condition, and every typed output',
    () async {
      final profile = _multiProfile();
      final classifier = await _artifact(
        temporaryDirectory,
        modelVersionId: 'classifier-version',
        sha256: 'b' * 64,
        contract: _modelContract(labels: ['sana', 'roya']),
      );
      final detector = await _artifact(
        temporaryDirectory,
        modelVersionId: 'detector-version',
        sha256: 'c' * 64,
        contract: _detectorContract(),
      );
      final engine = _FakeCpuEngine(
        outputsByModelVersion: {
          'classifier-version': [
            ValidationTensor(shape: [1, 2], values: [0.85, 0.15]),
          ],
          'detector-version': [
            ValidationTensor(shape: [1, 1, 4], values: [0.1, 0.2, 0.8, 0.9]),
            ValidationTensor(shape: [1, 1], values: [0]),
            ValidationTensor(shape: [1, 1], values: [0.9]),
            ValidationTensor(shape: [1, 1], values: [1]),
          ],
        },
      );
      final workflowDefinitions = _MemoryWorkflowDefinitionRepository(
        _multiModelWorkflow(),
      );
      final runner = DirectTfliteRunner(
        profile: profile,
        modelRepository: _ModelRepository(
          classifier,
          additionalArtifacts: [detector],
        ),
        workflowDefinitions: workflowDefinitions,
        inferenceEngine: engine,
      );
      await runner.prepare();

      final result = await runner.runCase(_request(Uint8List.fromList([1, 2])));

      expect(engine.invokedModelVersions, [
        'classifier-version',
        'detector-version',
      ]);
      expect(workflowDefinitions.requestedVersionId, profile.workflowVersionId);
      expect(
        engine.inputContractsByModelVersion.map(
          (id, contract) => MapEntry(id, contract.width),
        ),
        {'classifier-version': 224, 'detector-version': 320},
      );
      expect(
        engine.receivedImagesByModelVersion.map(
          (id, bytes) => MapEntry(id, bytes.toList()),
        ),
        {
          'classifier-version': [1, 2],
          'detector-version': [1, 2],
        },
      );
      expect(result.outcome, ValidationRunOutcome.success);
      expect(result.modelArtifacts, [
        ValidationRunModelArtifact(
          nodeId: 'classifier-node',
          modelVersionId: 'classifier-version',
          sha256: 'b' * 64,
        ),
        ValidationRunModelArtifact(
          nodeId: 'detector-node',
          modelVersionId: 'detector-version',
          sha256: 'c' * 64,
        ),
      ]);
      expect(result.normalizedOutput, {
        'classification': {
          'type': 'classification',
          'label': 'sana',
          'confidence': 0.85,
          'confidences': {'sana': 0.85, 'roya': 0.15},
        },
        'objects': {
          'type': 'detection',
          'detections': [
            {
              'label': 'coffee',
              'confidence': 0.9,
              'xMin': 0.2,
              'yMin': 0.1,
              'xMax': 0.9,
              'yMax': 0.8,
            },
          ],
        },
        'accepted': {'type': 'boolean', 'value': true},
      });
    },
  );

  test(
    'selects the false condition branch and emits its boolean output',
    () async {
      final profile = _multiProfile();
      final classifier = await _artifact(
        temporaryDirectory,
        modelVersionId: 'classifier-version',
        sha256: 'b' * 64,
        contract: _modelContract(labels: ['sana', 'roya']),
      );
      final detector = await _artifact(
        temporaryDirectory,
        modelVersionId: 'detector-version',
        sha256: 'c' * 64,
        contract: _detectorContract(),
      );
      final runner = DirectTfliteRunner(
        profile: profile,
        modelRepository: _ModelRepository(
          classifier,
          additionalArtifacts: [detector],
        ),
        workflowDefinitions: _MemoryWorkflowDefinitionRepository(
          _multiModelWorkflow(),
        ),
        inferenceEngine: _FakeCpuEngine(
          outputsByModelVersion: {
            'classifier-version': [
              ValidationTensor(shape: [1, 2], values: [0.7, 0.3]),
            ],
            'detector-version': [
              ValidationTensor(shape: [1, 1, 4], values: [0.1, 0.2, 0.8, 0.9]),
              ValidationTensor(shape: [1, 1], values: [0]),
              ValidationTensor(shape: [1, 1], values: [0.9]),
              ValidationTensor(shape: [1, 1], values: [1]),
            ],
          },
        ),
      );
      await runner.prepare();

      final result = await runner.runCase(_request(Uint8List.fromList([1, 2])));

      expect(result.outcome, ValidationRunOutcome.success);
      expect(result.normalizedOutput['accepted'], {
        'type': 'boolean',
        'value': false,
      });
    },
  );

  test('cancellation after an in-flight model starts no later model', () async {
    final profile = _multiProfile();
    final classifier = await _artifact(
      temporaryDirectory,
      modelVersionId: 'classifier-version',
      sha256: 'b' * 64,
      contract: _modelContract(labels: ['sana', 'roya']),
    );
    final detector = await _artifact(
      temporaryDirectory,
      modelVersionId: 'detector-version',
      sha256: 'c' * 64,
      contract: _detectorContract(),
    );
    final engine = _FakeCpuEngine(
      blockOnModelVersion: 'classifier-version',
      outputsByModelVersion: {
        'classifier-version': [
          ValidationTensor(shape: [1, 2], values: [0.85, 0.15]),
        ],
      },
    );
    final runner = DirectTfliteRunner(
      profile: profile,
      modelRepository: _ModelRepository(
        classifier,
        additionalArtifacts: [detector],
      ),
      workflowDefinitions: _MemoryWorkflowDefinitionRepository(
        _multiModelWorkflow(),
      ),
      inferenceEngine: engine,
    );
    await runner.prepare();
    final inFlight = runner.runCase(_request(Uint8List.fromList([1, 2])));
    await engine.inferenceStarted.future;
    await runner.cancelActive();
    engine.continueInference.complete();

    final result = await inFlight;

    expect(result.outcome, ValidationRunOutcome.cancelled);
    expect(engine.invokedModelVersions, ['classifier-version']);
  });

  test(
    'rejects workflow model references that differ from the profile',
    () async {
      final definition = _singleModelWorkflow();
      final model =
          (definition['nodes'] as List).firstWhere(
                (node) => (node as Map)['type'] == 'model.tflite',
              )
              as Map;
      model['modelVersionId'] = 'another-model-version';
      final runner = DirectTfliteRunner(
        profile: _profile(),
        modelRepository: _ModelRepository(
          VerifiedModelArtifact(
            file: File('${temporaryDirectory.path}/model.tflite')
              ..writeAsBytesSync([7, 8, 9]),
            modelVersionId: 'model-version-1',
            sha256: 'b' * 64,
            version: '1.0.0',
            contract: _modelContract(),
          ),
        ),
        workflowDefinitions: _MemoryWorkflowDefinitionRepository(definition),
        inferenceEngine: _FakeCpuEngine(),
      );

      await expectLater(
        runner.prepare(),
        throwsA(
          isA<ValidationExecutionException>().having(
            (error) => error.code,
            'code',
            'workflowModelVersionMismatch',
          ),
        ),
      );
    },
  );

  test('rejects unrecognized graph fields before downloading models', () async {
    final definition = _singleModelWorkflow();
    ((definition['nodes'] as List).first as Map)['unexpected'] = true;
    final repository = _ModelRepository(
      VerifiedModelArtifact(
        file: File('${temporaryDirectory.path}/model.tflite')
          ..writeAsBytesSync([7, 8, 9]),
        modelVersionId: 'model-version-1',
        sha256: 'b' * 64,
        version: '1.0.0',
        contract: _modelContract(),
      ),
    );
    final runner = DirectTfliteRunner(
      profile: _profile(),
      modelRepository: repository,
      workflowDefinitions: _MemoryWorkflowDefinitionRepository(definition),
      inferenceEngine: _FakeCpuEngine(),
    );

    await expectLater(
      runner.prepare(),
      throwsA(
        isA<ValidationExecutionException>().having(
          (error) => error.code,
          'code',
          'workflowDefinitionInvalid',
        ),
      ),
    );
    expect(repository.requestedModelVersions, isEmpty);
  });

  group('segmentation', () {
    // 20 pixels (4 rows of 5) and three labels. Three pixels are "roya" (15 %).
    final scores = <double>[
      for (var pixel = 0; pixel < 20; pixel++)
        if (pixel < 3) ...[0.0, 5.0, 0.0] else ...[5.0, 0.0, 0.0],
    ];

    Future<DirectTfliteRunner> prepared({
      Map<String, Object?>? workflow,
      List<ValidationTensor>? tensors,
      _FakeCpuEngine? engine,
    }) async {
      final artifact = await _artifact(
        temporaryDirectory,
        modelVersionId: 'seg-version',
        sha256: 'e' * 64,
        contract: _segmentationModelContract(),
      );
      final runner = DirectTfliteRunner(
        profile: _segmentationProfile(),
        modelRepository: _ModelRepository(artifact),
        workflowDefinitions: _MemoryWorkflowDefinitionRepository(
          workflow ?? _segmentationWorkflow(),
        ),
        inferenceEngine:
            engine ??
            _FakeCpuEngine(
              outputsByModelVersion: {
                'seg-version':
                    tensors ??
                    [
                      ValidationTensor(shape: [1, 4, 5, 3], values: scores),
                    ],
              },
            ),
      );
      await runner.prepare();
      return runner;
    }

    test('evaluates "roya gte 0.1" as true when roya covers 15 %', () async {
      final runner = await prepared();

      final result = await runner.runCase(
        _request(Uint8List.fromList([1, 2, 3])),
      );

      expect(result.outcome, ValidationRunOutcome.success);
      final mask = result.normalizedOutput['mask']! as Map;
      expect(mask['type'], 'segmentation');
      expect(mask['width'], 5);
      expect(mask['height'], 4);
      expect((mask['areaFractions']! as Map)['roya'], 0.15);
      expect((mask['areaFractions']! as Map)['fondo'], 0.85);
      expect(result.normalizedOutput['hasRoya'], {
        'type': 'boolean',
        'value': true,
      });
    });

    test('emits the false branch boolean when the area is below it', () async {
      final runner = await prepared(
        workflow: _segmentationWorkflow(threshold: 0.2),
      );

      final result = await runner.runCase(
        _request(Uint8List.fromList([1, 2, 3])),
      );

      expect(result.outcome, ValidationRunOutcome.success);
      expect(result.normalizedOutput['hasRoya'], {
        'type': 'boolean',
        'value': false,
      });
    });

    test('compares areas with every operator like the SDK', () async {
      // 15 % against a 0.15 threshold: only the inclusive operators hold.
      final expected = {'gte': true, 'gt': false, 'lte': true, 'lt': false};
      for (final entry in expected.entries) {
        final runner = await prepared(
          workflow: _segmentationWorkflow(operator: entry.key, threshold: 0.15),
        );

        final result = await runner.runCase(
          _request(Uint8List.fromList([1, 2, 3])),
        );

        expect(
          (result.normalizedOutput['hasRoya']! as Map)['value'],
          entry.value,
          reason: entry.key,
        );
      }
    });

    test('rejects a condition on a label the model does not declare', () async {
      await expectLater(
        prepared(workflow: _segmentationWorkflow(label: 'ausente')),
        throwsA(
          isA<ValidationExecutionException>().having(
            (error) => error.code,
            'code',
            'workflowConditionInvalid',
          ),
        ),
      );
    });

    test('reports an invalid score tensor as a typed failure', () async {
      final runner = await prepared(
        tensors: [
          ValidationTensor(
            shape: [1, 4, 5, 3],
            values: [...scores.take(59), double.nan],
          ),
        ],
      );

      final result = await runner.runCase(
        _request(Uint8List.fromList([1, 2, 3])),
      );

      expect(result.outcome, ValidationRunOutcome.error);
      expect(result.errorCode, 'segmentationScoresInvalid');
    });

    test('accepts schema 4 but rejects the capture schema 3', () async {
      final capture = _segmentationWorkflow()..['schemaVersion'] = '3';

      await expectLater(
        prepared(workflow: capture),
        throwsA(
          isA<ValidationExecutionException>().having(
            (error) => error.code,
            'code',
            'workflowDefinitionInvalid',
          ),
        ),
      );
    });

    test('ValidationTensor copies its values unless built with float32', () {
      final source = Float32List.fromList([0.1, 0.8, 0.1]);
      final copied = ValidationTensor(shape: [1, 3], values: source);
      final kept = ValidationTensor.float32(
        shape: [1, 1, 1, 3],
        values: source,
      );

      source[0] = 0.5;

      expect(copied.values, isNot(isA<Float32List>()));
      expect(copied.values[0], isNot(0.5));
      expect(identical(kept.values, source), isTrue);
    });

    test('keeps a Float32List only for a segmentation score map', () {
      // Segmentation profile: the rank-4 score map is kept as it is.
      expect(validationKeepsFloat32Output(true, [1, 257, 257, 21]), isTrue);
      // Classification and detection outputs keep the 0.3.1 copy.
      for (final shape in [
        [1, 5],
        [1, 10, 4],
        [1, 10],
        [1],
        [5],
      ]) {
        expect(
          validationKeepsFloat32Output(true, shape),
          isFalse,
          reason: '$shape',
        );
      }
      // Without a segmentation model nothing changes, whatever the rank.
      for (final shape in [
        [1, 5],
        [1, 10, 4],
        [1, 257, 257, 21],
      ]) {
        expect(
          validationKeepsFloat32Output(false, shape),
          isFalse,
          reason: '$shape',
        );
      }
    });

    test(
      'a workflow without composed outputs still rejects schema 3',
      () async {
        final capture = _segmentationWorkflow()
          ..['schemaVersion'] = '3'
          ..['nodes'] = [
            for (final node in (_segmentationWorkflow()['nodes']! as List))
              if ((node as Map)['id'] != 'condition-node' &&
                  node['id'] != 'roya-output')
                node,
          ];
        expect(
          (capture['nodes']! as List).any(
            (node) => (node as Map).containsKey('sources'),
          ),
          isFalse,
        );

        await expectLater(
          prepared(workflow: capture),
          throwsA(
            isA<ValidationExecutionException>().having(
              (error) => error.code,
              'code',
              'workflowDefinitionInvalid',
            ),
          ),
        );
      },
    );

    test('encodes the segmentation after the timed region', () async {
      final normalizer = _DeferralRecorder();
      final artifact = await _artifact(
        temporaryDirectory,
        modelVersionId: 'seg-version',
        sha256: 'e' * 64,
        contract: _segmentationModelContract(),
      );
      final runner = DirectTfliteRunner(
        profile: _segmentationProfile(),
        modelRepository: _ModelRepository(artifact),
        workflowDefinitions: _MemoryWorkflowDefinitionRepository(
          _segmentationWorkflow(),
        ),
        inferenceEngine: _FakeCpuEngine(
          outputsByModelVersion: {
            'seg-version': [
              ValidationTensor(shape: [1, 4, 5, 3], values: scores),
            ],
          },
        ),
        outputNormalizer: normalizer,
      );
      await runner.prepare();

      final result = await runner.runCase(
        _request(Uint8List.fromList([1, 2, 3])),
      );

      expect(normalizer.deferred, [true]);
      final mask = result.normalizedOutput['mask']! as Map;
      expect(mask.keys, containsAll(['maskRle', 'maskSha256']));
      expect(mask.keys, isNot(contains('pendingEncoding')));
    });

    test('turns on float32 outputs only for a profile with segmentation', () {
      DirectTfliteRunner build(ValidationResourceProfile profile) =>
          DirectTfliteRunner(
            profile: profile,
            modelRepository: _ModelRepository(
              VerifiedModelArtifact(
                file: File('model.tflite'),
                modelVersionId: 'model-version-1',
                sha256: 'b' * 64,
                version: '1.0.0',
                contract: _modelContract(),
              ),
            ),
            workflowDefinitions: _MemoryWorkflowDefinitionRepository({}),
          );
      bool float32(DirectTfliteRunner runner) =>
          (runner.inferenceEngine as TfliteCpuInferenceEngine).float32Outputs;

      expect(float32(build(_segmentationProfile())), isTrue);
      expect(float32(build(_profile())), isFalse);
      expect(float32(build(_multiProfile())), isFalse);
    });

    test('keeps an injected engine whatever the profile', () {
      final engine = _FakeCpuEngine();
      final runner = DirectTfliteRunner(
        profile: _segmentationProfile(),
        modelRepository: _ModelRepository(
          VerifiedModelArtifact(
            file: File('model.tflite'),
            modelVersionId: 'seg-version',
            sha256: 'e' * 64,
            version: '1.0.0',
            contract: _segmentationModelContract(),
          ),
        ),
        workflowDefinitions: _MemoryWorkflowDefinitionRepository({}),
        inferenceEngine: engine,
      );

      expect(identical(runner.inferenceEngine, engine), isTrue);
    });

    test('encodes the mask only after the stopwatch stopped', () async {
      final artifact = await _artifact(
        temporaryDirectory,
        modelVersionId: 'seg-version',
        sha256: 'e' * 64,
        contract: _segmentationModelContract(),
      );
      final runner = DirectTfliteRunner(
        profile: _segmentationProfile(),
        modelRepository: _ModelRepository(artifact),
        workflowDefinitions: _MemoryWorkflowDefinitionRepository(
          _segmentationWorkflow(),
        ),
        inferenceEngine: _FakeCpuEngine(
          outputsByModelVersion: {
            'seg-version': [
              ValidationTensor(shape: [1, 4, 5, 3], values: scores),
            ],
          },
        ),
        outputNormalizer: _SlowEncodingNormalizer(),
      );
      await runner.prepare();

      final result = await runner.runCase(
        _request(Uint8List.fromList([1, 2, 3])),
      );

      // The encoding takes 400 ms. Had it run before the stopwatch stopped,
      // the measured duration would include it.
      expect(
        (result.normalizedOutput['mask']! as Map)['encoded'],
        isTrue,
      );
      expect(result.outcome, ValidationRunOutcome.success);
      expect(result.durationMicros, lessThan(200000));
    });
  });
}

class _ModelRepository implements ValidationModelRepository {
  _ModelRepository(
    VerifiedModelArtifact artifact, {
    List<VerifiedModelArtifact> additionalArtifacts = const [],
  }) : artifacts = {
         for (final item in [artifact, ...additionalArtifacts])
           item.modelVersionId: item,
       };

  final Map<String, VerifiedModelArtifact> artifacts;
  final requestedModelVersions = <String>[];

  @override
  Future<VerifiedModelArtifact> prepare(
    ValidationModelRequirement requirement,
  ) async {
    requestedModelVersions.add(requirement.modelVersionId);
    return artifacts[requirement.modelVersionId] ?? artifacts.values.first;
  }

  @override
  Future<String> fetchSha256(String modelVersionId) async =>
      artifacts[modelVersionId]!.sha256;
}

class _MemoryWorkflowDefinitionRepository
    implements WorkflowDefinitionRepository {
  _MemoryWorkflowDefinitionRepository(this.definition);

  final Map<String, Object?> definition;
  String? requestedVersionId;

  @override
  Future<Map<String, Object?>> fetch(String workflowVersionId) async {
    requestedVersionId = workflowVersionId;
    return definition;
  }
}

class _FakeCpuEngine implements ValidationTfliteEngine {
  _FakeCpuEngine({
    this.outputsByModelVersion = const {},
    this.blockOnModelVersion,
  });

  final Map<String, List<ValidationTensor>> outputsByModelVersion;
  final String? blockOnModelVersion;
  final invokedModelVersions = <String>[];
  final inputContractsByModelVersion = <String, ValidationInputContract>{};
  final receivedImagesByModelVersion = <String, Uint8List>{};
  final inferenceStarted = Completer<void>();
  final continueInference = Completer<void>();
  Uint8List? receivedImageBytes;

  @override
  Future<List<ValidationTensor>> run({
    required File modelFile,
    required Uint8List imageBytes,
    required ValidationInputContract inputContract,
  }) async {
    receivedImageBytes = imageBytes;
    final modelVersionId = Directory(
      modelFile.path,
    ).parent.uri.pathSegments.where((segment) => segment.isNotEmpty).last;
    invokedModelVersions.add(modelVersionId);
    inputContractsByModelVersion[modelVersionId] = inputContract;
    receivedImagesByModelVersion[modelVersionId] = imageBytes;
    if (modelVersionId == blockOnModelVersion) {
      inferenceStarted.complete();
      await continueInference.future;
    }
    return outputsByModelVersion[modelVersionId] ??
        [
          ValidationTensor(shape: [1, 3], values: [0.1, 0.8, 0.1]),
        ];
  }
}

ValidationRunRequest _request(Uint8List bytes) => ValidationRunRequest(
  pairRunId: 'pair-1',
  repetition: 1,
  phase: ValidationPhase.measured,
  scenarioId: 'PERF-02',
  caseId: 'coffee-1',
  datasetId: 'dataset-1',
  datasetVersionId: 'dataset-version-1',
  datasetPartition: 'test',
  datasetSha256: 'a' * 64,
  inputBytes: bytes,
  inputSha256: sha256.convert(bytes).toString(),
  captureTrace: false,
);

ValidationResourceProfile _profile() => ValidationResourceProfile.fromJson({
  'id': 'coffee',
  'status': 'ready',
  'datasetId': 'dataset-1',
  'datasetVersionId': 'dataset-version-1',
  'datasetPartition': 'test',
  'datasetSha256': 'a' * 64,
  'workflowId': 'workflow-1',
  'workflowVersionId': 'workflow-version-1',
  'workflowVersion': '1.0.0',
  'modelRequirements': [_classifierRequirement()],
  'outputContract': [
    {
      'name': 'classification',
      'resultType': 'classification',
      'labels': ['sana', 'roya', 'minador'],
    },
  ],
});

ValidationResourceProfile _multiProfile() => ValidationResourceProfile.fromJson(
  {
    'id': 'S2',
    'status': 'ready',
    'datasetId': 'dataset-1',
    'datasetVersionId': 'dataset-version-1',
    'datasetPartition': 'test',
    'datasetSha256': 'a' * 64,
    'workflowId': 'workflow-2',
    'workflowVersionId': 'workflow-version-2',
    'workflowVersion': '1.0.0',
    'modelRequirements': [
      _classifierRequirement(
        nodeId: 'classifier-node',
        modelVersionId: 'classifier-version',
        sha256: 'b' * 64,
        labels: ['sana', 'roya'],
      ),
      {
        'nodeId': 'detector-node',
        'modelVersionId': 'detector-version',
        'sha256': 'c' * 64,
        'inputContract': {
          'width': 320,
          'height': 320,
          'channels': 3,
          'normalization': 'zero_to_one',
        },
        'modelOutputContract': {
          'type': 'detection',
          'labels': ['coffee'],
          'scoreThreshold': 0.5,
          'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 3},
        },
      },
    ],
    'outputContract': [
      {
        'name': 'classification',
        'resultType': 'classification',
        'labels': ['sana', 'roya'],
      },
      {
        'name': 'objects',
        'resultType': 'detection',
        'labels': ['coffee'],
      },
      {'name': 'accepted', 'resultType': 'boolean', 'labels': <String>[]},
    ],
  },
);

Map<String, Object?> _classifierRequirement({
  String nodeId = 'model-node',
  String modelVersionId = 'model-version-1',
  String? sha256,
  List<String> labels = const ['sana', 'roya', 'minador'],
}) => {
  'nodeId': nodeId,
  'modelVersionId': modelVersionId,
  'sha256': sha256 ?? 'b' * 64,
  'inputContract': {
    'width': 224,
    'height': 224,
    'channels': 3,
    'normalization': 'zero_to_one',
  },
  'modelOutputContract': {'type': 'classification', 'labels': labels},
};

Map<String, Object?> _singleModelWorkflow() => {
  'schemaVersion': '1',
  'nodes': [
    {
      'id': 'input-node',
      'type': 'input.image',
      'outputs': {'imagen': 'image'},
    },
    {
      'id': 'model-node',
      'type': 'model.tflite',
      'modelVersionId': 'model-version-1',
      'modelName': 'Coffee classifier',
      'version': '1.0.0',
      'inputs': {'image': _modelContract()['input']},
      'outputs': {'result': _modelContract()['output']},
    },
    {
      'id': 'output-node',
      'type': 'output',
      'name': 'classification',
      'sourceNodeId': 'model-node',
      'sourcePort': 'result',
      'resultType': 'classification',
    },
  ],
  'connections': [
    {
      'sourceNodeId': 'input-node',
      'sourcePort': 'imagen',
      'targetNodeId': 'model-node',
      'targetPort': 'image',
    },
  ],
};

Map<String, Object?> _multiModelWorkflow() => {
  'schemaVersion': '2',
  'nodes': [
    {
      'id': 'input-node',
      'type': 'input.image',
      'outputs': {'imagen': 'image'},
    },
    {
      'id': 'classifier-node',
      'type': 'model.tflite',
      'modelVersionId': 'classifier-version',
      'modelName': 'Coffee classifier',
      'version': '1.0.0',
      'inputs': {
        'image': {
          'type': 'image',
          'width': 224,
          'height': 224,
          'channels': 3,
          'normalization': 'zero_to_one',
        },
      },
      'outputs': {
        'result': {
          'type': 'classification',
          'labels': ['sana', 'roya'],
        },
      },
    },
    {
      'id': 'condition-node',
      'type': 'condition',
      'sourceNodeId': 'classifier-node',
      'label': 'sana',
      'operator': 'gte',
      'threshold': 0.8,
      'branches': {'true': 'boolean', 'false': 'boolean'},
    },
    {
      'id': 'detector-node',
      'type': 'model.tflite',
      'modelVersionId': 'detector-version',
      'modelName': 'Coffee detector',
      'version': '1.0.0',
      'inputs': {
        'image': {
          'type': 'image',
          'width': 320,
          'height': 320,
          'channels': 3,
          'normalization': 'zero_to_one',
        },
      },
      'outputs': {
        'result': {
          'type': 'detection',
          'labels': ['coffee'],
          'scoreThreshold': 0.5,
          'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 3},
        },
      },
    },
    {
      'id': 'classification-output',
      'type': 'output',
      'name': 'classification',
      'sourceNodeId': 'classifier-node',
      'sourcePort': 'result',
      'resultType': 'classification',
    },
    {
      'id': 'detection-output',
      'type': 'output',
      'name': 'objects',
      'sourceNodeId': 'detector-node',
      'sourcePort': 'result',
      'resultType': 'detection',
    },
    {
      'id': 'accepted-output',
      'type': 'output',
      'name': 'accepted',
      'sources': [
        {
          'sourceNodeId': 'condition-node',
          'sourcePort': 'true',
          'resultType': 'boolean',
        },
        {
          'sourceNodeId': 'condition-node',
          'sourcePort': 'false',
          'resultType': 'boolean',
        },
      ],
    },
  ],
  'connections': [
    {
      'sourceNodeId': 'input-node',
      'sourcePort': 'imagen',
      'targetNodeId': 'classifier-node',
      'targetPort': 'image',
    },
    {
      'sourceNodeId': 'input-node',
      'sourcePort': 'imagen',
      'targetNodeId': 'detector-node',
      'targetPort': 'image',
    },
  ],
};

Map<String, Object?> _detectorContract() => {
  'input': {
    'type': 'image',
    'width': 320,
    'height': 320,
    'channels': 3,
    'normalization': 'zero_to_one',
  },
  'output': {
    'type': 'detection',
    'labels': ['coffee'],
    'scoreThreshold': 0.5,
    'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 3},
  },
};

Future<VerifiedModelArtifact> _artifact(
  Directory root, {
  required String modelVersionId,
  required String sha256,
  required Map<String, Object?> contract,
}) async {
  final directory = Directory(
    '${root.path}${Platform.pathSeparator}$modelVersionId',
  )..createSync(recursive: true);
  final file = File('${directory.path}${Platform.pathSeparator}model.tflite')
    ..writeAsBytesSync([7, 8, 9]);
  return VerifiedModelArtifact(
    file: file,
    modelVersionId: modelVersionId,
    sha256: sha256,
    version: '1.0.0',
    contract: contract,
  );
}

Map<String, Object?> _modelContract({
  List<String> labels = const ['sana', 'roya', 'minador'],
}) => {
  'input': {
    'type': 'image',
    'width': 224,
    'height': 224,
    'channels': 3,
    'normalization': 'zero_to_one',
  },
  'output': {'type': 'classification', 'labels': labels},
};

ValidationResourceProfile _segmentationProfile() =>
    ValidationResourceProfile.fromJson({
      'id': 'SEG-01',
      'status': 'ready',
      'datasetId': 'dataset-1',
      'datasetVersionId': 'dataset-version-1',
      'datasetPartition': 'test',
      'datasetSha256': 'a' * 64,
      'workflowId': 'workflow-1',
      'workflowVersionId': 'workflow-version-1',
      'workflowVersion': '1.0.0',
      'modelRequirements': [
        {
          'nodeId': 'seg-node',
          'modelVersionId': 'seg-version',
          'sha256': 'e' * 64,
          'inputContract': {
            'width': 257,
            'height': 257,
            'channels': 3,
            'normalization': 'minus_one_to_one',
          },
          'modelOutputContract': {
            'type': 'segmentation',
            'labels': ['fondo', 'roya', 'sana'],
            'scoreType': 'logits',
          },
        },
      ],
      'outputContract': [
        {
          'name': 'mask',
          'resultType': 'segmentation',
          'labels': ['fondo', 'roya', 'sana'],
          'scoreType': 'logits',
        },
        {'name': 'hasRoya', 'resultType': 'boolean', 'labels': <String>[]},
      ],
    });

Map<String, Object?> _segmentationModelContract() => {
  'input': {
    'type': 'image',
    'width': 257,
    'height': 257,
    'channels': 3,
    'normalization': 'minus_one_to_one',
  },
  'output': {
    'type': 'segmentation',
    'labels': ['fondo', 'roya', 'sana'],
    'scoreType': 'logits',
  },
};

Map<String, Object?> _segmentationWorkflow({
  String label = 'roya',
  String operator = 'gte',
  double threshold = 0.1,
}) => {
  'schemaVersion': '4',
  'nodes': [
    {
      'id': 'input-node',
      'type': 'input.image',
      'outputs': {'imagen': 'image'},
    },
    {
      'id': 'seg-node',
      'type': 'model.tflite',
      'modelVersionId': 'seg-version',
      'modelName': 'DeepLabV3',
      'version': '1.0.0',
      'inputs': {'image': _segmentationModelContract()['input']},
      'outputs': {'result': _segmentationModelContract()['output']},
    },
    {
      'id': 'condition-node',
      'type': 'condition',
      'sourceNodeId': 'seg-node',
      'label': label,
      'operator': operator,
      'threshold': threshold,
      'branches': {'true': 'boolean', 'false': 'boolean'},
    },
    {
      'id': 'mask-output',
      'type': 'output',
      'name': 'mask',
      'sourceNodeId': 'seg-node',
      'sourcePort': 'result',
      'resultType': 'segmentation',
    },
    {
      'id': 'roya-output',
      'type': 'output',
      'name': 'hasRoya',
      'sources': [
        {
          'sourceNodeId': 'condition-node',
          'sourcePort': 'true',
          'resultType': 'boolean',
        },
        {
          'sourceNodeId': 'condition-node',
          'sourcePort': 'false',
          'resultType': 'boolean',
        },
      ],
    },
  ],
  'connections': [
    {
      'sourceNodeId': 'input-node',
      'sourcePort': 'imagen',
      'targetNodeId': 'seg-node',
      'targetPort': 'image',
    },
  ],
};

class _DeferralRecorder extends ValidationOutputNormalizer {
  _DeferralRecorder();

  final deferred = <bool>[];

  @override
  Map<String, Object?> normalizeDirect({
    required List<ValidationTensor> tensors,
    required List<ValidationOutputContract> contracts,
    bool deferSegmentationEncoding = false,
  }) {
    deferred.add(deferSegmentationEncoding);
    return super.normalizeDirect(
      tensors: tensors,
      contracts: contracts,
      deferSegmentationEncoding: deferSegmentationEncoding,
    );
  }
}

/// A summary whose encoding takes a visible time and leaves a marker, to show
/// when a runner encodes it: after its stopwatch stopped, never before.
class _SlowSummary extends SegmentationSummary {
  _SlowSummary(SegmentationSummary source)
    : super(
        width: source.width,
        height: source.height,
        labels: source.labels,
        mask: source.mask,
        areaFractions: source.areaFractions,
        confidence: source.confidence,
      );

  @override
  Map<String, Object?> toJson() {
    final clock = Stopwatch()..start();
    while (clock.elapsedMilliseconds < 400) {}
    return {...super.toJson(), 'encoded': true};
  }
}

Map<String, Object?> _withSlowEncoding(Map<String, Object?> outputs) => {
  for (final entry in outputs.entries)
    entry.key:
        entry.value is Map &&
            (entry.value as Map)['pendingEncoding'] is SegmentationSummary
        ? {
            ...(entry.value as Map).cast<String, Object?>(),
            'pendingEncoding': _SlowSummary(
              (entry.value as Map)['pendingEncoding'] as SegmentationSummary,
            ),
          }
        : entry.value,
};

class _SlowEncodingNormalizer extends ValidationOutputNormalizer {
  _SlowEncodingNormalizer();

  @override
  Map<String, Object?> normalizeDirect({
    required List<ValidationTensor> tensors,
    required List<ValidationOutputContract> contracts,
    bool deferSegmentationEncoding = false,
  }) => _withSlowEncoding(
    super.normalizeDirect(
      tensors: tensors,
      contracts: contracts,
      deferSegmentationEncoding: deferSegmentationEncoding,
    ),
  );
}
