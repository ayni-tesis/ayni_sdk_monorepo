import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:better_fullstack_app/validation/data/dataset_bundle_loader.dart';
import 'package:better_fullstack_app/validation/execution/validation_batch_controller.dart';
import 'package:better_fullstack_app/validation/execution/validation_condition_runner.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/models/validation_run_metadata.dart';
import 'package:better_fullstack_app/validation/storage/validation_jsonl_store.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late VerifiedDataset dataset;
  late ExperimentPlan plan;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('validation-batch-');
    plan = await ExperimentPlan.load(rootBundle);
    dataset = await _installDataset(directory);
  });

  tearDown(() async {
    if (await directory.exists()) await directory.delete(recursive: true);
  });

  test(
    'executes the exact repeated blocks, cycling verified cases deterministically',
    () async {
      final runner = _FakeRunner();
      final store = ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}runs.jsonl'),
      );
      final controller = ValidationBatchController(
        store: store,
        metadata: _metadata,
      );
      final persistedBeforeEachRun = <int>[];
      runner.beforeRun = () async =>
          persistedBeforeEachRun.add((await store.readAll()).length);

      final summary = await controller.runPhase(
        plan: plan,
        pairRunId: 'pair-perf-02',
        runner: runner,
        dataset: dataset,
        scenarioId: 'PERF-02',
        phase: ValidationPhase.measured,
        isCancelled: () async => false,
        onRecord: (_) {},
      );

      expect(summary.attempted, 300);
      expect(summary.successes, 300);
      expect(summary.completedBlockSizes, [100, 100, 100]);
      expect(runner.calls, 300);
      expect(persistedBeforeEachRun.take(4), [0, 1, 2, 3]);
      expect(runner.caseIds.take(4), [
        'coffee-1',
        'coffee-2',
        'coffee-1',
        'coffee-2',
      ]);
      expect(
        (await store.readAll()).map((record) => record.repetition).toList(),
        List<int>.generate(300, (index) => index + 1),
      );
    },
  );

  test(
    'rejects an external cold-start phase before invoking the runner',
    () async {
      final runner = _FakeRunner();
      final controller = ValidationBatchController(
        store: ValidationJsonlStore(
          File('${directory.path}${Platform.pathSeparator}cold.jsonl'),
        ),
        metadata: _metadata,
      );

      await expectLater(
        controller.runPhase(
          plan: plan,
          pairRunId: 'pair-cold',
          runner: runner,
          dataset: dataset,
          scenarioId: 'PERF-01',
          phase: ValidationPhase.coldStart,
          isCancelled: () async => false,
          onRecord: (_) {},
        ),
        throwsA(isA<ValidationBatchException>()),
      );
      expect(runner.calls, 0);
    },
  );

  test(
    'records one labeled PERF-01 attempt for an external cold start',
    () async {
      final runner = _FakeRunner();
      final store = ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}perf-01.jsonl'),
      );
      final controller = ValidationBatchController(
        store: store,
        metadata: _metadata,
      );
      final records = <ValidationRunRecord>[];

      final summary = await controller.runPhase(
        plan: plan,
        pairRunId: 'perf01-control-20261005',
        runner: runner,
        dataset: dataset,
        scenarioId: 'PERF-01',
        phase: ValidationPhase.coldStart,
        coldStartRunLabel: 'PERF-01-007',
        isCancelled: () async => false,
        onRecord: records.add,
      );

      expect(summary.attempted, 1);
      expect(summary.stoppedByCancellation, isFalse);
      expect(runner.calls, 1);
      expect(records.single.scenarioId, 'PERF-01');
      expect(records.single.phase, ValidationPhase.coldStart);
      expect(records.single.repetition, 7);
      expect(records.single.caseId, 'coffee-1');
      expect((await store.readAll()).single.toJson(), records.single.toJson());
    },
  );

  test(
    'records an in-flight cancellation and schedules no later case',
    () async {
      final runner = _FakeRunner()..barrier = Completer<void>();
      final store = ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}cancel.jsonl'),
      );
      final controller = ValidationBatchController(
        store: store,
        metadata: _metadata,
      );
      final records = <ValidationRunRecord>[];

      final running = controller.runPhase(
        plan: plan,
        pairRunId: 'pair-cancel',
        runner: runner,
        dataset: dataset,
        scenarioId: 'PERF-02-WARMUP',
        phase: ValidationPhase.warmup,
        isCancelled: () async => false,
        onRecord: records.add,
      );
      await runner.started.future;
      await controller.cancel();
      runner.barrier!.complete();
      final summary = await running;

      expect(runner.calls, 1);
      expect(summary.attempted, 1);
      expect(summary.cancelled, 1);
      expect(summary.stoppedByCancellation, isTrue);
      expect(records.single.outcome, ValidationRunOutcome.cancelled);
      expect(records.single.errorCode, 'cancelled');
      expect(
        (await store.readAll()).single.outcome,
        ValidationRunOutcome.cancelled,
      );
    },
  );

  test('cancelling during image loading never starts inference', () async {
    final runner = _FakeRunner();
    final imageReadStarted = Completer<void>();
    final imageReadGate = Completer<void>();
    final store = ValidationJsonlStore(
      File('${directory.path}${Platform.pathSeparator}cancel-loading.jsonl'),
    );
    final controller = ValidationBatchController(
      store: store,
      metadata: _metadata,
      readBytes: (path) async {
        imageReadStarted.complete();
        await imageReadGate.future;
        return File(path).readAsBytes();
      },
    );
    final running = controller.runPhase(
      plan: plan,
      pairRunId: 'pair-cancel-loading',
      runner: runner,
      dataset: dataset,
      scenarioId: 'PERF-02-WARMUP',
      phase: ValidationPhase.warmup,
      isCancelled: () async => false,
      onRecord: (_) {},
    );

    await imageReadStarted.future;
    await controller.cancel();
    imageReadGate.complete();
    final summary = await running;

    expect(runner.calls, 0);
    expect(summary.attempted, 0);
    expect(summary.stoppedByCancellation, isTrue);
    expect(await store.readAll(), isEmpty);
  });

  test('detects a changed local image before calling the runner', () async {
    final image = File(dataset.cases.first.localPath);
    await image.writeAsBytes([1, 2, 3]);
    final runner = _FakeRunner();
    final controller = ValidationBatchController(
      store: ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}tampered.jsonl'),
      ),
      metadata: _metadata,
    );

    await expectLater(
      controller.runPhase(
        plan: plan,
        pairRunId: 'pair-tampered',
        runner: runner,
        dataset: dataset,
        scenarioId: 'PERF-02',
        phase: ValidationPhase.measured,
        isCancelled: () async => false,
        onRecord: (_) {},
      ),
      throwsA(isA<ValidationBatchException>()),
    );
    expect(runner.calls, 0);
  });

  test(
    'preflights every profile before running ordered paired phases',
    () async {
      final suitePlan = _allReadyPlan(plan, dataset);
      final calls = <String>[];
      final store = ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}suite.jsonl'),
      );
      final controller = _CountingBatchController(
        store: store,
        metadata: _metadata,
        calls: calls,
      );
      final datasets = {
        for (final profile in suitePlan.resourceProfiles) profile.id: dataset,
      };
      final runners = _runnersFor(suitePlan);

      final summary = await controller.runSuite(
        plan: suitePlan,
        pairRunId: 'pair-suite',
        datasetsByProfileId: datasets,
        runnersByProfileId: runners,
        conditions: const [
          ValidationCondition.control,
          ValidationCondition.treatment,
        ],
        captureTrace: true,
        isCancelled: () async => false,
        onRecord: (_) {},
        onProgress: (_) {},
      );

      expect(calls, hasLength(24));
      expect(calls.take(4), [
        'INT-01:PERF-02-WARMUP:control',
        'INT-01:PERF-02-WARMUP:treatment',
        'INT-01:PERF-02:control',
        'INT-01:PERF-02:treatment',
      ]);
      expect(
        calls.skip(18).take(6).every((call) => call.startsWith('S2:')),
        isTrue,
      );
      expect(summary.attempted, 10752);
      expect(summary.stoppedByCancellation, isFalse);
      expect(await store.readAll(), isEmpty);
    },
  );

  test(
    'skips pending profile scenarios when running the configured suite',
    () async {
      final suitePlan = _allReadyPlan(plan, dataset, pendingLast: true);
      final calls = <String>[];
      final store = ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}pending.jsonl'),
      );
      final controller = _CountingBatchController(
        store: store,
        metadata: _metadata,
        calls: calls,
      );

      final summary = await controller.runSuite(
        plan: suitePlan,
        pairRunId: 'pair-pending',
        datasetsByProfileId: {
          for (final profile in suitePlan.resourceProfiles) profile.id: dataset,
        },
        runnersByProfileId: _runnersFor(suitePlan),
        conditions: const [
          ValidationCondition.control,
          ValidationCondition.treatment,
        ],
        captureTrace: false,
        isCancelled: () async => false,
        onRecord: (_) {},
        onProgress: (_) {},
      );

      expect(calls, hasLength(18));
      expect(calls.any((call) => call.startsWith('S2:')), isFalse);
      expect(summary.attempted, 8064);
      expect(summary.stoppedByCancellation, isFalse);
      expect(await store.readAll(), isEmpty);
    },
  );

  test('quick suite runs twenty percent of every automatic scenario', () async {
    final suitePlan = _allReadyPlan(plan, dataset);
    final calls = <String>[];
    final controller = _CountingBatchController(
      store: ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}quick.jsonl'),
      ),
      metadata: _metadata,
      calls: calls,
    );

    final summary = await controller.runSuite(
      plan: suitePlan,
      pairRunId: 'quick-suite',
      datasetsByProfileId: {
        for (final profile in suitePlan.resourceProfiles) profile.id: dataset,
      },
      runnersByProfileId: _runnersFor(suitePlan),
      conditions: const [
        ValidationCondition.control,
        ValidationCondition.treatment,
      ],
      quickRun: true,
      captureTrace: false,
      isCancelled: () async => false,
      onRecord: (_) {},
      onProgress: (_) {},
    );

    expect(calls, hasLength(24));
    expect(controller.repetitions, contains('INT-01:PERF-02-WARMUP:control:4'));
    expect(controller.repetitions, contains('INT-01:PERF-02:control:60'));
    expect(controller.repetitions, contains('INT-01:PERF-04:control:205'));
    expect(summary.attempted, 2152);
    expect(summary.stoppedByCancellation, isFalse);
  });

  test('mismatched ready profile blocks the suite before any write', () async {
    final suitePlan = _allReadyPlan(plan, dataset, mismatchLastDataset: true);
    var imageReads = 0;
    final calls = <String>[];
    final store = ValidationJsonlStore(
      File('${directory.path}${Platform.pathSeparator}mismatched.jsonl'),
    );
    final controller = _CountingBatchController(
      store: store,
      metadata: _metadata,
      calls: calls,
      readBytes: (path) async {
        imageReads++;
        return File(path).readAsBytes();
      },
    );

    await expectLater(
      controller.runSuite(
        plan: suitePlan,
        pairRunId: 'pair-mismatched',
        datasetsByProfileId: {
          for (final profile in suitePlan.resourceProfiles) profile.id: dataset,
        },
        runnersByProfileId: _runnersFor(suitePlan),
        conditions: const [
          ValidationCondition.control,
          ValidationCondition.treatment,
        ],
        captureTrace: false,
        isCancelled: () async => false,
        onRecord: (_) {},
        onProgress: (_) {},
      ),
      throwsA(isA<ValidationBatchException>()),
    );

    expect(calls, isEmpty);
    expect(imageReads, 0);
    expect(await store.readAll(), isEmpty);
  });

  test(
    'suite cancellation during S2 stops before its paired SDK run',
    () async {
      final suitePlan = _allReadyPlan(plan, dataset);
      final calls = <String>[];
      final controller = _CountingBatchController(
        store: ValidationJsonlStore(
          File('${directory.path}${Platform.pathSeparator}s2-cancel.jsonl'),
        ),
        metadata: _metadata,
        calls: calls,
        cancelAtS2Control: true,
      );

      final summary = await controller.runSuite(
        plan: suitePlan,
        pairRunId: 'pair-s2-cancel',
        datasetsByProfileId: {
          for (final profile in suitePlan.resourceProfiles) profile.id: dataset,
        },
        runnersByProfileId: _runnersFor(suitePlan),
        conditions: const [
          ValidationCondition.control,
          ValidationCondition.treatment,
        ],
        captureTrace: true,
        isCancelled: () async => false,
        onRecord: (_) {},
        onProgress: (_) {},
      );

      expect(calls.last, 'S2:S2-PERF-02-WARMUP:control');
      expect(calls.where((call) => call.startsWith('S2:')), hasLength(1));
      expect(summary.cancelled, 1);
      expect(summary.stoppedByCancellation, isTrue);
    },
  );
}

const _metadata = ValidationRunMetadata(
  deviceModel: 'Pixel 8',
  platform: 'android',
  osVersion: '16',
  apiLevel: 36,
  appVersion: '1.0.0',
  sdkVersion: '0.3.0',
);

Future<VerifiedDataset> _installDataset(Directory root) async {
  final image1 = utf8.encode('image-one');
  final image2 = utf8.encode('image-two');
  final archive = Archive()
    ..addFile(
      ArchiveFile.bytes(
        'manifest.json',
        utf8.encode(
          jsonEncode({
            'schemaVersion': '1',
            'datasetId': 'dataset-1',
            'version': '1.0.0',
            'partition': 'test',
            'source': 'Test dataset',
            'license': 'CC BY 4.0',
            'cases': [
              _case('coffee-1', 'images/one.jpg', image1),
              _case('coffee-2', 'images/two.jpg', image2),
            ],
          }),
        ),
      ),
    )
    ..addFile(ArchiveFile.bytes('images/one.jpg', image1))
    ..addFile(ArchiveFile.bytes('images/two.jpg', image2));
  final bytes = ZipEncoder().encode(archive);
  final zipFile = File('${root.path}${Platform.pathSeparator}bundle.zip');
  await zipFile.writeAsBytes(bytes);
  return DatasetBundleLoader().install(
    archiveFile: zipFile,
    datasetsDirectory: Directory(
      '${root.path}${Platform.pathSeparator}datasets',
    ),
    expectedDatasetVersionId: 'dataset-version-1',
    expectedArchiveSha256: sha256.convert(bytes).toString(),
    expectedDatasetId: 'dataset-1',
    expectedVersion: '1.0.0',
    expectedPartition: 'test',
    expectedSource: 'Test dataset',
    expectedLicense: 'CC BY 4.0',
  );
}

Map<String, Object?> _case(String id, String path, List<int> bytes) => {
  'scenario': 'PERF-02',
  'caseId': id,
  'path': path,
  'sha256': sha256.convert(bytes).toString(),
};

class _FakeRunner implements ValidationConditionRunner {
  _FakeRunner({this.runCondition = ValidationCondition.control});

  final ValidationCondition runCondition;
  int calls = 0;
  Completer<void>? barrier;
  final Completer<void> started = Completer<void>();
  Future<void> Function()? beforeRun;
  final caseIds = <String>[];

  @override
  ValidationCondition get condition => runCondition;

  @override
  Future<void> prepare() async {}

  @override
  Future<ConditionRunResult> runCase(ValidationRunRequest request) async {
    calls++;
    caseIds.add(request.caseId);
    await beforeRun?.call();
    if (!started.isCompleted) started.complete();
    if (barrier != null) await barrier!.future;
    return ConditionRunResult.success(
      durationMicros: 8,
      modelVersionId: 'model-version-1',
      modelSha256: 'c' * 64,
      normalizedOutput: const {
        'classification': {'label': 'roya'},
      },
    );
  }

  @override
  Future<void> cancelActive() async {}

  @override
  Future<void> close() async {}
}

class _CountingBatchController extends ValidationBatchController {
  _CountingBatchController({
    required super.store,
    required super.metadata,
    required this.calls,
    this.cancelAtS2Control = false,
    super.readBytes,
  });

  final List<String> calls;
  final repetitions = <String>[];
  final bool cancelAtS2Control;

  @override
  Future<BatchRunSummary> runPhase({
    required ExperimentPlan plan,
    required String pairRunId,
    required ValidationConditionRunner runner,
    required VerifiedDataset dataset,
    required String scenarioId,
    required ValidationPhase phase,
    String? coldStartRunLabel,
    int? repetitionLimit,
    required Future<bool> Function() isCancelled,
    required void Function(ValidationRunRecord) onRecord,
    bool captureTrace = false,
  }) async {
    final scenario = plan.scenarios.singleWhere(
      (item) => item.id == scenarioId,
    );
    final profile = plan.resourceProfiles.singleWhere(
      (item) => item.id == scenario.resourceProfileId,
    );
    final repetitions = repetitionLimit ?? scenario.repetitions;
    calls.add('${profile.id}:$scenarioId:${runner.condition.name}');
    this.repetitions.add(
      '${profile.id}:$scenarioId:${runner.condition.name}:$repetitions',
    );
    if (cancelAtS2Control &&
        profile.id == 'S2' &&
        runner.condition == ValidationCondition.control) {
      return BatchRunSummary(
        attempted: 1,
        successes: 0,
        errors: 0,
        cancelled: 1,
        completedBlockSizes: [],
        stoppedByCancellation: true,
      );
    }
    return BatchRunSummary(
      attempted: repetitions,
      successes: repetitions,
      errors: 0,
      cancelled: 0,
      completedBlockSizes: repetitionLimit == null
          ? scenario.blockSizes
          : [repetitions],
      stoppedByCancellation: false,
    );
  }
}

ExperimentPlan _allReadyPlan(
  ExperimentPlan original,
  VerifiedDataset dataset, {
  bool pendingLast = false,
  bool mismatchLastDataset = false,
}) {
  final source = <String, Object?>{
    'schemaVersion': '2',
    'caseIds': <String>[],
    'resourceProfiles': <Object?>[],
    'scenarios': <Object?>[],
  };
  final profileTemplate =
      jsonDecode(
            jsonEncode({
              'id': 'template',
              'status': 'ready',
              'datasetId': dataset.datasetId,
              'datasetVersionId': dataset.datasetVersionId,
              'datasetPartition': dataset.partition,
              'datasetSha256': dataset.zipSha256,
              'workflowId': 'workflow-template',
              'workflowVersionId': 'workflow-version-template',
              'workflowVersion': '1.0.0',
              'modelRequirements': [
                {
                  'nodeId': 'model-node-template',
                  'modelVersionId': 'model-version-template',
                  'sha256': 'b' * 64,
                  'inputContract': {
                    'width': 224,
                    'height': 224,
                    'channels': 3,
                    'normalization': 'none',
                  },
                  'modelOutputContract': {
                    'type': 'classification',
                    'labels': ['roya'],
                  },
                },
              ],
              'outputContract': [
                {
                  'name': 'classification',
                  'resultType': 'classification',
                  'labels': ['roya'],
                },
              ],
            }),
          )
          as Map<String, Object?>;
  final profiles = <Object?>[];
  for (final originalProfile in original.resourceProfiles) {
    if (pendingLast &&
        originalProfile.id == original.resourceProfiles.last.id) {
      profiles.add({'id': originalProfile.id, 'status': 'pending'});
      continue;
    }
    final profile =
        jsonDecode(jsonEncode(profileTemplate)) as Map<String, Object?>;
    profile['id'] = originalProfile.id;
    profile['workflowId'] = 'workflow-${originalProfile.id}';
    profile['workflowVersionId'] = 'workflow-version-${originalProfile.id}';
    (profile['modelRequirements'] as List).single['nodeId'] =
        'model-node-${originalProfile.id}';
    (profile['modelRequirements'] as List).single['modelVersionId'] =
        'model-version-${originalProfile.id}';
    if (mismatchLastDataset &&
        originalProfile.id == original.resourceProfiles.last.id) {
      profile['datasetSha256'] = 'd' * 64;
    }
    profiles.add(profile);
  }
  source['resourceProfiles'] = profiles;
  source['scenarios'] = original.scenarios.map((scenario) {
    final raw = <String, Object?>{
      'id': scenario.id,
      'phase': scenario.phase.name,
      'repetitions': scenario.repetitions,
      'blockSizes': scenario.blockSizes,
      'caseIds': scenario.caseIds,
      'runLabels': scenario.runLabels,
      'requiresExternalMeasurement': scenario.requiresExternalMeasurement,
      if (scenario.resourceProfileId != null)
        'resourceProfileId': scenario.resourceProfileId,
    };
    if (scenario.resourceProfileId != null &&
        scenario.phase != ValidationPhase.coldStart &&
        scenario.phase != ValidationPhase.fault) {
      raw['caseIds'] = ['coffee-1', 'coffee-2'];
    }
    return raw;
  }).toList();
  return ExperimentPlan.fromJson(source);
}

Map<String, Map<ValidationCondition, ValidationConditionRunner>> _runnersFor(
  ExperimentPlan plan,
) => {
  for (final profile in plan.resourceProfiles)
    profile.id: {
      ValidationCondition.control: _FakeRunner(),
      ValidationCondition.treatment: _FakeRunner(
        runCondition: ValidationCondition.treatment,
      ),
    },
};
