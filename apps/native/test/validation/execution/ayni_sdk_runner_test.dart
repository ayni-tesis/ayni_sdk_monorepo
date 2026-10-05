import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:crypto/crypto.dart';
import 'package:better_fullstack_app/validation/data/validation_model_repository.dart';
import 'package:better_fullstack_app/validation/data/workflow_definition_repository.dart';
import 'package:better_fullstack_app/validation/execution/ayni_sdk_runner.dart';
import 'package:better_fullstack_app/validation/execution/validation_condition_runner.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/storage/validation_preferences.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late _MemorySecureStore secureStore;
  late ValidationPreferences preferences;
  late _FakeAyniSdkClient sdk;
  late _FakeValidationModelRepository modelRepository;
  late _FakeWorkflowDefinitionRepository definitions;
  late Directory temporaryDirectory;
  late AyniSdkValidationRunner runner;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'ayni-sdk-runner-',
    );
    secureStore = _MemorySecureStore();
    preferences = ValidationPreferences(secureStore: secureStore);
    sdk = _FakeAyniSdkClient();
    modelRepository = _FakeValidationModelRepository('b' * 64);
    definitions = _FakeWorkflowDefinitionRepository(_workflowDefinition());
    runner = AyniSdkValidationRunner(
      profile: _profile(),
      credentials: const ValidationSdkCredentials(
        serverUrl: 'https://validation.example.test',
        credential: 'secret-sdk-credential',
      ),
      storageDirectory: temporaryDirectory,
      sdk: sdk,
      modelRepository: modelRepository,
      workflowDefinitions: definitions,
      preferences: preferences,
    );
  });

  tearDown(() async {
    if (await temporaryDirectory.exists()) {
      await temporaryDirectory.delete(recursive: true);
    }
  });

  test(
    'initializes and verifies the pinned workflow without syncing implicitly',
    () async {
      await runner.prepare();

      expect(sdk.initialized, isTrue);
      expect(sdk.lastConfig?.syncTimeout, const Duration(minutes: 3));
      expect(definitions.requestedVersionIds, ['workflow-version-1']);
      expect(sdk.syncCalls, 0);
      expect(runner.condition, ValidationCondition.treatment);
      expect(
        runner.credentials.toString(),
        isNot(contains('secret-sdk-credential')),
      );
      expect(
        sdk.lastConfig.toString(),
        isNot(contains('secret-sdk-credential')),
      );
    },
  );

  test(
    'reactivates its SDK instance after another profile initialized',
    () async {
      await runner.prepare();
      final otherProfileRunner = AyniSdkValidationRunner(
        profile: _profile(),
        credentials: runner.credentials,
        storageDirectory: temporaryDirectory,
        sdk: sdk,
        modelRepository: modelRepository,
        workflowDefinitions: definitions,
        preferences: preferences,
      );
      await otherProfileRunner.prepare();
      expect(sdk.initializeCalls, 2);

      await runner.activate();

      expect(sdk.initializeCalls, 3);
      expect(runner.condition, ValidationCondition.treatment);
    },
  );

  test(
    'rejects detection profiles when configured with the older SDK',
    () async {
      final detectionRunner = AyniSdkValidationRunner(
        profile: _profile(detection: true),
        credentials: runner.credentials,
        storageDirectory: temporaryDirectory,
        sdk: sdk,
        modelRepository: modelRepository,
        workflowDefinitions: definitions,
        preferences: preferences,
        sdkVersion: '0.2.0',
      );

      await expectLater(
        detectionRunner.prepare(),
        throwsA(
          isA<ValidationExecutionException>().having(
            (error) => error.code,
            'code',
            'sdkDetectionTensorRolesUnsupported',
          ),
        ),
      );
      expect(sdk.initialized, isFalse);
      expect(definitions.requestedVersionIds, isEmpty);
    },
  );

  test(
    'validates every S2 model contract and preserves its typed outputs',
    () async {
      final profile = _multiProfile();
      modelRepository.sha256ByVersion = {
        'classifier-version': 'b' * 64,
        'detector-version': 'd' * 64,
      };
      definitions = _FakeWorkflowDefinitionRepository(_multiModelWorkflow());
      sdk.outputs = const {
        'classification': ClassificationResult('classifier-node', 'sana', 0.9, {
          'sana': 0.9,
          'roya': 0.1,
        }),
        'objects': DetectionResult('detector-node', [
          Detection('coffee', 0.9, 0.1, 0.2, 0.8, 0.9),
        ]),
        'accepted': BooleanResult('condition-node', true),
      };
      runner = _makeRunner(
        sdk: sdk,
        modelRepository: modelRepository,
        definitions: definitions,
        preferences: preferences,
        storageDirectory: temporaryDirectory,
        profile: profile,
      );

      await runner.prepare();
      final result = await runner.runCase(
        _requestForProfile(Uint8List.fromList([9, 8, 7]), profile),
      );

      expect(modelRepository.requestedVersionIds, [
        'classifier-version',
        'detector-version',
      ]);
      expect(definitions.requestedVersionIds, ['workflow-version-1']);
      expect(result.outcome, ValidationRunOutcome.success);
      expect(result.normalizedOutput.keys, [
        'classification',
        'objects',
        'accepted',
      ]);
      expect(result.normalizedOutput['objects'], {
        'type': 'detection',
        'detections': [
          {
            'label': 'coffee',
            'confidence': 0.9,
            'xMin': 0.1,
            'yMin': 0.2,
            'xMax': 0.8,
            'yMax': 0.9,
          },
        ],
      });
      expect(result.modelArtifacts, [
        ValidationRunModelArtifact(
          nodeId: 'classifier-node',
          modelVersionId: 'classifier-version',
          sha256: 'b' * 64,
        ),
        ValidationRunModelArtifact(
          nodeId: 'detector-node',
          modelVersionId: 'detector-version',
          sha256: 'd' * 64,
        ),
      ]);
    },
  );

  test(
    'rejects S2 workflows with missing, extra, or changed model nodes',
    () async {
      modelRepository.sha256ByVersion = {
        'classifier-version': 'b' * 64,
        'detector-version': 'd' * 64,
      };
      final invalidDefinitions = [
        _multiModelWorkflow(removeDetector: true),
        _multiModelWorkflow(addUnexpectedModel: true),
        _multiModelWorkflow(detectorVersionId: 'wrong-version'),
      ];
      for (final definition in invalidDefinitions) {
        definitions = _FakeWorkflowDefinitionRepository(definition);
        runner = _makeRunner(
          sdk: sdk,
          modelRepository: modelRepository,
          definitions: definitions,
          preferences: preferences,
          storageDirectory: temporaryDirectory,
          profile: _multiProfile(),
          sdkVersion: '0.3.1',
        );
        await expectLater(
          runner.prepare(),
          throwsA(isA<ValidationExecutionException>()),
        );
      }
    },
  );

  test(
    'checks workflow and model versions, shares the same bytes, and normalizes SDK output',
    () async {
      await runner.prepare();
      final sync = await runner.synchronize();
      expect(sync.status, SyncStatus.upToDate);
      expect(sdk.syncCalls, 1);

      final bytes = Uint8List.fromList([4, 5, 6]);
      final preflight = await runner.preflight(bytes);
      expect(preflight.workflowVersion, '1.0.0');
      final result = await runner.runCase(_request(bytes));

      expect(sdk.lastInputBytes, bytes);
      expect(sdk.lastTraceContext, isNull);
      expect(result.outcome, ValidationRunOutcome.success);
      expect(result.modelVersionId, 'model-version-1');
      expect(result.workflowVersionId, 'workflow-version-1');
      expect(result.workflowVersion, '1.0.0');
    },
  );

  test('forwards the choice to defer pending trace uploads', () async {
    await runner.prepare();

    await runner.synchronize(uploadPendingTraces: false);

    expect(sdk.syncUploadPendingTraces, [false]);
  });

  test(
    'cancels the active SDK execution without waiting on the operation gate',
    () async {
      await runner.prepare();
      sdk.runBarrier = Completer<void>();
      sdk.runStarted = Completer<void>();
      final running = runner.runCase(_request(Uint8List.fromList([5, 6, 7])));
      await sdk.runStarted!.future;

      await runner.cancelActive();
      expect(sdk.cancelledExecutionIds, ['execution-1']);
      sdk.runBarrier!.complete();

      final result = await running;
      expect(result.outcome, ValidationRunOutcome.cancelled);
      expect(result.errorCode, 'cancelled');
    },
  );

  test(
    'blocks preflight when the SDK ran a different workflow SemVer',
    () async {
      await runner.prepare();
      sdk.workflowVersion = '1.0.1';

      await expectLater(
        runner.preflight(Uint8List.fromList([1, 2, 3])),
        throwsA(isA<ValidationExecutionException>()),
      );
    },
  );

  test(
    'blocks preflight when typed SDK outputs do not match the profile',
    () async {
      await runner.prepare();
      sdk.outputs = const {'unexpected': BooleanResult('condition-node', true)};

      await expectLater(
        runner.preflight(Uint8List.fromList([1, 2, 3])),
        throwsA(isA<ValidationExecutionException>()),
      );
    },
  );

  test(
    'keeps trace persistence failure when output validation fails',
    () async {
      await runner.prepare();
      await runner.setTraceCaptureAllowed(true);
      sdk.outputs = const {'unexpected': BooleanResult('condition-node', true)};
      sdk.tracePersistenceFailed = true;

      final result = await runner.runCase(
        _request(Uint8List.fromList([4, 5, 6]), captureTrace: true),
      );

      expect(result.outcome, ValidationRunOutcome.error);
      expect(result.errorCode, 'workflowOutputMismatch');
      expect(result.tracePersistenceFailed, isTrue);
    },
  );

  test(
    'rejects a pinned workflow whose model node declares another version',
    () async {
      definitions = _FakeWorkflowDefinitionRepository(
        _workflowDefinition(modelVersionId: 'wrong-version'),
      );
      runner = _makeRunner(
        sdk: sdk,
        modelRepository: modelRepository,
        definitions: definitions,
        preferences: preferences,
        storageDirectory: temporaryDirectory,
      );

      await expectLater(
        runner.prepare(),
        throwsA(isA<ValidationExecutionException>()),
      );
      expect(sdk.syncCalls, 0);
    },
  );

  test(
    'rejects a model manifest whose SHA-256 differs from the profile',
    () async {
      modelRepository.sha256 = 'c' * 64;

      await expectLater(
        runner.prepare(),
        throwsA(
          isA<ValidationExecutionException>().having(
            (error) => error.code,
            'code',
            'modelHashMismatch',
          ),
        ),
      );
      expect(definitions.requestedVersionIds, isEmpty);
    },
  );

  test(
    'requires trace permission and clears queued traces before revocation completes',
    () async {
      await runner.prepare();
      final bytes = Uint8List.fromList([8, 9]);
      await runner.runCase(_request(bytes));
      expect(sdk.lastTraceContext, isNull);
      expect(await preferences.traceCaptureAllowed, isFalse);

      await runner.setTraceCaptureAllowed(true);
      await runner.runCase(_request(bytes, captureTrace: true));
      expect(sdk.lastTraceContext?.runId, 'pair-1');
      expect(sdk.lastTraceContext?.caseId, 'coffee-1');
      expect(sdk.lastTraceContext?.datasetPartition, 'test');

      await runner.setTraceCaptureAllowed(false);
      expect(sdk.clearTraceCalls, 1);
      expect(await preferences.traceCaptureAllowed, isFalse);
      await runner.runCase(_request(bytes, captureTrace: true));
      expect(sdk.lastTraceContext, isNull);
    },
  );

  test(
    'keeps trace permission revoked when purging the outbox fails',
    () async {
      await runner.prepare();
      await runner.setTraceCaptureAllowed(true);
      sdk.failTraceClear = true;

      await expectLater(
        runner.setTraceCaptureAllowed(false),
        throwsA(isA<StateError>()),
      );
      expect(await preferences.traceCaptureAllowed, isFalse);
      await expectLater(runner.synchronize(), throwsA(isA<StateError>()));
      expect(sdk.syncCalls, 0);
      await runner.runCase(
        _request(Uint8List.fromList([2, 3, 4]), captureTrace: true),
      );
      expect(sdk.lastTraceContext, isNull);

      sdk.failTraceClear = false;
      await runner.setTraceCaptureAllowed(true);
      expect(sdk.clearTraceCalls, 3);
      expect(await preferences.traceCaptureAllowed, isTrue);
      await runner.runCase(
        _request(Uint8List.fromList([4, 5, 6]), captureTrace: true),
      );
      expect(sdk.lastTraceContext?.runId, 'pair-1');
    },
  );

  test(
    'waits for active traced inference, then purges before revocation completes',
    () async {
      await runner.prepare();
      await runner.setTraceCaptureAllowed(true);
      sdk.runBarrier = Completer<void>();
      sdk.runStarted = Completer<void>();
      final run = runner.runCase(
        _request(Uint8List.fromList([3, 4, 5]), captureTrace: true),
      );
      await sdk.runStarted!.future;

      final revoke = runner.setTraceCaptureAllowed(false);
      await Future<void>.delayed(Duration.zero);
      expect(await preferences.traceCaptureAllowed, isFalse);
      expect(sdk.clearTraceCalls, 0);

      sdk.runBarrier!.complete();
      await run;
      await revoke;
      expect(sdk.clearTraceCalls, 1);
      expect(await preferences.traceCaptureAllowed, isFalse);
    },
  );
}

class _MemorySecureStore implements ValidationSecureStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

class _FakeAyniSdkClient implements AyniSdkClient {
  bool initialized = false;
  int initializeCalls = 0;
  int syncCalls = 0;
  final syncUploadPendingTraces = <bool>[];
  int clearTraceCalls = 0;
  bool failTraceClear = false;
  bool tracePersistenceFailed = false;
  String workflowVersion = '1.0.0';
  Completer<void>? runBarrier;
  Completer<void>? runStarted;
  Map<String, WorkflowValue> outputs = const {
    'classification': ClassificationResult('model-node', 'roya', 0.8, {
      'sana': 0.1,
      'roya': 0.8,
      'minador': 0.1,
    }),
  };
  AyniConfig? lastConfig;
  Uint8List? lastInputBytes;
  WorkflowTraceContext? lastTraceContext;
  final cancelledExecutionIds = <String>[];

  @override
  Future<AyniInitializationResult> initialize(AyniConfig config) async {
    initializeCalls++;
    lastConfig = config;
    initialized = true;
    return const AyniInitializationResult(
      status: InitializationStatus.ready,
      message: 'SDK listo.',
    );
  }

  @override
  Future<SyncResult> sync({bool uploadPendingTraces = true}) async {
    syncCalls++;
    syncUploadPendingTraces.add(uploadPendingTraces);
    return const SyncResult(SyncStatus.upToDate);
  }

  @override
  Future<WorkflowResult> run(
    String workflowId,
    Uint8List inputBytes, {
    void Function(String executionId)? onExecutionStarted,
    WorkflowTraceContext? traceContext,
  }) async {
    lastInputBytes = inputBytes;
    lastTraceContext = traceContext;
    onExecutionStarted?.call('execution-1');
    runStarted?.complete();
    if (runBarrier != null) await runBarrier!.future;
    if (cancelledExecutionIds.contains('execution-1')) {
      throw const WorkflowError(WorkflowErrorCategory.cancelled);
    }
    return WorkflowResult(
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      workflowVersion: workflowVersion,
      outputs: outputs,
      tracePersistenceFailed: tracePersistenceFailed,
    );
  }

  @override
  void cancelExecution(String executionId) {
    cancelledExecutionIds.add(executionId);
  }

  @override
  Future<void> clearPendingTraces() async {
    clearTraceCalls++;
    if (failTraceClear) throw StateError('trace purge failed');
  }
}

class _FakeWorkflowDefinitionRepository
    implements WorkflowDefinitionRepository {
  _FakeWorkflowDefinitionRepository(this.definition);

  final Map<String, Object?> definition;
  final requestedVersionIds = <String>[];

  @override
  Future<Map<String, Object?>> fetch(String workflowVersionId) async {
    requestedVersionIds.add(workflowVersionId);
    return definition;
  }
}

class _FakeValidationModelRepository implements ValidationModelRepository {
  _FakeValidationModelRepository(this.sha256);

  String sha256;
  Map<String, String> sha256ByVersion = {};
  final requestedVersionIds = <String>[];

  @override
  Future<String> fetchSha256(String modelVersionId) async {
    requestedVersionIds.add(modelVersionId);
    return sha256ByVersion[modelVersionId] ?? sha256;
  }

  @override
  Future<VerifiedModelArtifact> prepare(
    ValidationModelRequirement requirement,
  ) => throw UnimplementedError();
}

AyniSdkValidationRunner _makeRunner({
  required Directory storageDirectory,
  required _FakeAyniSdkClient sdk,
  required _FakeValidationModelRepository modelRepository,
  required _FakeWorkflowDefinitionRepository definitions,
  required ValidationPreferences preferences,
  ValidationResourceProfile? profile,
  String sdkVersion = '0.3.1',
}) => AyniSdkValidationRunner(
  profile: profile ?? _profile(),
  credentials: const ValidationSdkCredentials(
    serverUrl: 'https://validation.example.test',
    credential: 'secret-sdk-credential',
  ),
  storageDirectory: storageDirectory,
  sdk: sdk,
  modelRepository: modelRepository,
  workflowDefinitions: definitions,
  preferences: preferences,
  sdkVersion: sdkVersion,
);

ValidationRunRequest _request(Uint8List bytes, {bool captureTrace = false}) =>
    ValidationRunRequest(
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
      captureTrace: captureTrace,
    );

ValidationRunRequest _requestForProfile(
  Uint8List bytes,
  ValidationResourceProfile profile, {
  bool captureTrace = false,
}) => ValidationRunRequest(
  pairRunId: 'pair-1',
  repetition: 1,
  phase: ValidationPhase.measured,
  scenarioId: 'PERF-02',
  caseId: 'coffee-1',
  datasetId: profile.datasetId,
  datasetVersionId: profile.datasetVersionId,
  datasetPartition: profile.datasetPartition,
  datasetSha256: profile.datasetSha256,
  inputBytes: bytes,
  inputSha256: sha256.convert(bytes).toString(),
  captureTrace: captureTrace,
);

ValidationResourceProfile _profile({bool detection = false}) =>
    ValidationResourceProfile(
      id: 'coffee',
      datasetVersionId: 'dataset-version-1',
      datasetPartition: 'test',
      datasetSha256: 'a' * 64,
      controlModelVersionId: 'model-version-1',
      controlModelSha256: 'b' * 64,
      treatmentWorkflowId: 'workflow-1',
      treatmentWorkflowVersionId: 'workflow-version-1',
      treatmentWorkflowVersion: '1.0.0',
      treatmentModelVersionId: 'model-version-1',
      treatmentModelSha256: 'b' * 64,
      inputContract: const ValidationInputContract(
        width: 224,
        height: 224,
        channels: 3,
        normalization: 'zero_to_one',
      ),
      outputContract: [
        if (detection)
          ValidationOutputContract(
            name: 'objects',
            resultType: ValidationResultType.detection,
            labels: ['sana'],
            scoreThreshold: 0.5,
            tensorIndices: const {
              'boxes': 0,
              'classes': 1,
              'scores': 2,
              'count': 3,
            },
          )
        else
          ValidationOutputContract(
            name: 'classification',
            resultType: ValidationResultType.classification,
            labels: ['sana', 'roya', 'minador'],
          ),
      ],
    );

Map<String, Object?> _workflowDefinition({
  String modelVersionId = 'model-version-1',
}) => {
  'schemaVersion': '1',
  'nodes': [
    {
      'id': 'input-node',
      'type': 'input.image',
      'outputs': {'imagen': 'image'},
    },
    {
      'id': 'legacy-model-node',
      'type': 'model.tflite',
      'modelVersionId': modelVersionId,
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
          'labels': ['sana', 'roya', 'minador'],
        },
      },
    },
    {
      'id': 'output-node',
      'type': 'output',
      'name': 'classification',
      'sourceNodeId': 'legacy-model-node',
      'sourcePort': 'result',
      'resultType': 'classification',
    },
  ],
  'connections': [
    {
      'sourceNodeId': 'input-node',
      'sourcePort': 'imagen',
      'targetNodeId': 'legacy-model-node',
      'targetPort': 'image',
    },
  ],
};

ValidationResourceProfile _multiProfile() => ValidationResourceProfile.fromJson(
  {
    'id': 'coffee-s2',
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
        'nodeId': 'classifier-node',
        'modelVersionId': 'classifier-version',
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
      {
        'nodeId': 'detector-node',
        'modelVersionId': 'detector-version',
        'sha256': 'd' * 64,
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
        'scoreThreshold': 0.5,
        'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 3},
      },
      {'name': 'accepted', 'resultType': 'boolean', 'labels': <String>[]},
    ],
  },
);

Map<String, Object?> _multiModelWorkflow({
  bool removeDetector = false,
  bool addUnexpectedModel = false,
  String detectorVersionId = 'detector-version',
}) {
  final nodes = <Map<String, Object?>>[
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
      'modelVersionId': detectorVersionId,
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
  ];
  if (removeDetector) {
    nodes.removeWhere((node) => node['id'] == 'detector-node');
  }
  if (addUnexpectedModel) {
    nodes.add({
      'id': 'unexpected-node',
      'type': 'model.tflite',
      'modelVersionId': 'unexpected-version',
    });
  }
  return {
    'schemaVersion': '2',
    'nodes': nodes,
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
}
