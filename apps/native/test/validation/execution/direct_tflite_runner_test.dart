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
