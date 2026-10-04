import 'dart:convert';
import 'dart:io';

import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/storage/validation_jsonl_store.dart';
import 'package:better_fullstack_app/validation/storage/validation_jsonl_exporter.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory directory;
  late File file;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('validation-jsonl-');
    file = File('${directory.path}${Platform.pathSeparator}runs.jsonl');
  });

  tearDown(() async {
    if (await directory.exists()) await directory.delete(recursive: true);
  });

  test('round-trips records and appends after a new store instance', () async {
    final first = _record(1, tracePersistenceFailed: true);
    final second = _record(2);

    await ValidationJsonlStore(file).append(first);
    await ValidationJsonlStore(file).append(second);

    final records = await ValidationJsonlStore(file).readAll();
    expect(records.map((record) => record.repetition), [1, 2]);
    expect(records.first.tracePersistenceFailed, isTrue);
    expect(records.last.toJson(), second.toJson());
    expect(await file.readAsString(), endsWith('\n'));
  });

  test(
    'drops only a malformed final line and can append after recovery',
    () async {
      final first = _record(1);
      final damagedBytes = utf8.encode(
        '${jsonEncode(first.toJson())}\n{"torn":',
      );
      await file.writeAsBytes(damagedBytes);

      final store = ValidationJsonlStore(file);
      expect((await store.readAll()).single.toJson(), first.toJson());
      await ValidationJsonlStore(file).append(_record(2));

      final records = await ValidationJsonlStore(file).readAll();
      expect(records.map((record) => record.repetition), [1, 2]);
    },
  );

  test(
    'recovers a malformed final line even when it ended with a newline',
    () async {
      final first = _record(1);
      await file.writeAsString('${jsonEncode(first.toJson())}\nnot-json\n');

      expect(
        (await ValidationJsonlStore(file).readAll()).single.toJson(),
        first.toJson(),
      );
      expect(await file.readAsString(), '${jsonEncode(first.toJson())}\n');
    },
  );

  test('rejects a corrupt middle line and leaves the file untouched', () async {
    final first = jsonEncode(_record(1).toJson());
    final third = jsonEncode(_record(3).toJson());
    final original = '$first\nnot-json\n$third\n';
    await file.writeAsString(original);

    await expectLater(
      ValidationJsonlStore(file).readAll(),
      throwsA(isA<ValidationJsonlException>()),
    );
    expect(await file.readAsString(), original);
  });

  test(
    'does not serialize traces, credentials, signed URLs, images, or tensors',
    () async {
      final serialized = jsonEncode(_record(1).toJson());

      expect(serialized, isNot(contains('"trace":')));
      expect(serialized, isNot(contains('traceContext')));
      expect(serialized, isNot(contains('credential')));
      expect(serialized, isNot(contains('signedUrl')));
      expect(serialized, isNot(contains('inputBytes')));
      expect(serialized, isNot(contains('tensor')));
    },
  );

  test(
    'exports the existing local JSONL file through the injected share service',
    () async {
      await file.writeAsString('{}\n');
      final share = _FakeShare();

      await ValidationJsonlExporter(share: share).export(file);

      expect(share.sharedFiles, [file]);
    },
  );
}

class _FakeShare implements ValidationFileShare {
  final sharedFiles = <File>[];

  @override
  Future<void> share(File file) async => sharedFiles.add(file);
}

ValidationRunRecord _record(
  int repetition, {
  bool tracePersistenceFailed = false,
}) => ValidationRunRecord(
  pairRunId: 'pair-1',
  repetition: repetition,
  condition: ValidationCondition.control,
  phase: ValidationPhase.measured,
  scenarioId: 'PERF-02',
  caseId: 'coffee-1',
  datasetVersionId: 'dataset-version-1',
  datasetPartition: 'test',
  datasetSha256: 'a' * 64,
  inputSha256: 'b' * 64,
  modelVersionId: 'model-version-1',
  modelSha256: 'c' * 64,
  workflowVersionId: null,
  workflowVersion: null,
  backend: 'CPU',
  durationMicros: 12,
  outcome: ValidationRunOutcome.success,
  normalizedOutput: const {
    'classification': {'label': 'roya'},
  },
  tracePersistenceFailed: tracePersistenceFailed,
);
