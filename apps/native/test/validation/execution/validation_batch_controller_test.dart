import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:better_fullstack_app/validation/data/dataset_bundle_loader.dart';
import 'package:better_fullstack_app/validation/execution/validation_batch_controller.dart';
import 'package:better_fullstack_app/validation/execution/validation_condition_runner.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
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
      final controller = ValidationBatchController(store: store);
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
      expect(runner.networkCalls, 0);
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
    'records an in-flight cancellation and schedules no later case',
    () async {
      final runner = _FakeRunner()..barrier = Completer<void>();
      final store = ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}cancel.jsonl'),
      );
      final controller = ValidationBatchController(store: store);
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

  test('detects a changed local image before calling the runner', () async {
    final image = File(dataset.cases.first.localPath);
    await image.writeAsBytes([1, 2, 3]);
    final runner = _FakeRunner();
    final controller = ValidationBatchController(
      store: ValidationJsonlStore(
        File('${directory.path}${Platform.pathSeparator}tampered.jsonl'),
      ),
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
}

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
  int calls = 0;
  int networkCalls = 0;
  Completer<void>? barrier;
  final Completer<void> started = Completer<void>();
  Future<void> Function()? beforeRun;
  final caseIds = <String>[];

  @override
  ValidationCondition get condition => ValidationCondition.control;

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
