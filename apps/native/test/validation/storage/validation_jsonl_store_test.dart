import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:better_fullstack_app/validation/execution/validation_segmentation.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/models/validation_run_metadata.dart';
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

  test('round-trips all model node version and hash associations', () async {
    final record = _record(
      1,
      modelArtifacts: [
        ValidationRunModelArtifact(
          nodeId: 'classifier-node',
          modelVersionId: 'classifier-version',
          sha256: 'c' * 64,
        ),
        ValidationRunModelArtifact(
          nodeId: 'detector-node',
          modelVersionId: 'detector-version',
          sha256: 'd' * 64,
        ),
      ],
    );
    await ValidationJsonlStore(file).append(record);

    final loaded = (await ValidationJsonlStore(file).readAll()).single;
    expect(loaded.modelArtifacts, record.modelArtifacts);
    expect(jsonDecode(await file.readAsString())['modelArtifacts'], [
      {
        'nodeId': 'classifier-node',
        'modelVersionId': 'classifier-version',
        'sha256': 'c' * 64,
      },
      {
        'nodeId': 'detector-node',
        'modelVersionId': 'detector-version',
        'sha256': 'd' * 64,
      },
    ]);
  });

  test(
    'reads legacy singleton rows without rewriting their JSONL bytes',
    () async {
      final legacy = _record(1).toJson()..remove('modelArtifacts');
      final line = '${jsonEncode(legacy)}\n';
      await file.writeAsString(line);

      final loaded = (await ValidationJsonlStore(file).readAll()).single;

      expect(loaded.modelVersionId, 'model-version-1');
      expect(loaded.modelSha256, 'c' * 64);
      expect(loaded.modelArtifacts, isEmpty);
      expect(await file.readAsString(), line);
    },
  );

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

  test('round-trips a segmentation row with its mask and agreement', () async {
    final record = _treatmentRecord(
      segmentationAgreement: const SegmentationAgreement(
        pixelAgreement: 0.75,
        meanIou: 0.5,
        maxAbsAreaFractionDelta: 0.25,
        absConfidenceDelta: 0.125,
        dimensionsMatch: true,
      ),
    );
    await ValidationJsonlStore(file).append(record);

    final loaded = (await ValidationJsonlStore(file).readAll()).single;

    expect(loaded.segmentationAgreement, record.segmentationAgreement);
    expect(loaded.toJson(), record.toJson());
    final stored =
        jsonDecode(await file.readAsString()) as Map<String, Object?>;
    expect(stored['segmentationAgreement'], {
      'pixelAgreement': 0.75,
      'meanIou': 0.5,
      'maxAbsAreaFractionDelta': 0.25,
      'absConfidenceDelta': 0.125,
      'dimensionsMatch': true,
    });
    final output =
        (stored['normalizedOutput']! as Map)['mask']! as Map<String, Object?>;
    expect(output.keys, containsAll(['width', 'height', 'areaFractions']));
    expect(output.keys, containsAll(['confidence', 'maskSha256', 'maskRle']));
  });

  test('a row without an agreement has no such field', () async {
    final classification = _record(1);
    final segmentation = _treatmentRecord();

    expect(classification.toJson(), isNot(contains('segmentationAgreement')));
    expect(segmentation.toJson(), isNot(contains('segmentationAgreement')));
    await ValidationJsonlStore(file).append(classification);
    expect(await file.readAsString(), isNot(contains('segmentationAgreement')));
  });

  test('only a successful SDK row may carry an agreement', () {
    const agreement = SegmentationAgreement(
      pixelAgreement: 1,
      meanIou: 1,
      maxAbsAreaFractionDelta: 0,
      absConfidenceDelta: 0,
      dimensionsMatch: true,
    );

    expect(
      () => _record(1, segmentationAgreement: agreement),
      throwsFormatException,
    );
    expect(
      () => _treatmentRecord(
        outcome: ValidationRunOutcome.error,
        segmentationAgreement: agreement,
      ),
      throwsFormatException,
    );
  });

  test('rejects a stored agreement that is not valid', () async {
    final row = _treatmentRecord().toJson()
      ..['segmentationAgreement'] = {'pixelAgreement': 1};
    await file.writeAsString('${jsonEncode(row)}\n');

    await expectLater(
      ValidationJsonlStore(file).readAll(),
      completion(isEmpty),
      reason: 'A damaged final line is dropped like any other.',
    );
  });

  test('still reads rows written before segmentation existed', () async {
    final legacy = _record(1).toJson()..remove('modelArtifacts');
    final current = _record(2).toJson();
    await file.writeAsString('${jsonEncode(legacy)}\n${jsonEncode(current)}\n');

    final records = await ValidationJsonlStore(file).readAll();

    expect(records.map((record) => record.repetition), [1, 2]);
    expect(records.every((r) => r.segmentationAgreement == null), isTrue);
  });

  test('round-trips the typed reason an agreement is unavailable', () async {
    for (final reason in ['controlMissing', 'invalid']) {
      final record = _treatmentRecord(segmentationAgreementUnavailable: reason);
      await ValidationJsonlStore(file).append(record);
    }

    final records = await ValidationJsonlStore(file).readAll();

    expect(records.map((r) => r.segmentationAgreementUnavailable), [
      'controlMissing',
      'invalid',
    ]);
    expect(records.every((r) => r.segmentationAgreement == null), isTrue);
    final first = jsonDecode((await file.readAsLines()).first) as Map;
    expect(first['segmentationAgreementUnavailable'], 'controlMissing');
    expect(first, isNot(contains('segmentationAgreement')));
  });

  test('rows without the reason do not carry the field', () {
    expect(
      _treatmentRecord().toJson(),
      isNot(contains('segmentationAgreementUnavailable')),
    );
    expect(
      _record(1).toJson(),
      isNot(contains('segmentationAgreementUnavailable')),
    );
  });

  test('the reason is typed, exclusive and only for successful SDK rows', () {
    const agreement = SegmentationAgreement(
      pixelAgreement: 1,
      meanIou: 1,
      maxAbsAreaFractionDelta: 0,
      absConfidenceDelta: 0,
      dimensionsMatch: true,
    );

    expect(
      () => _treatmentRecord(segmentationAgreementUnavailable: 'whatever'),
      throwsFormatException,
    );
    expect(
      () => _treatmentRecord(
        segmentationAgreement: agreement,
        segmentationAgreementUnavailable: 'invalid',
      ),
      throwsFormatException,
    );
    expect(
      () => _record(1, segmentationAgreementUnavailable: 'invalid'),
      throwsFormatException,
    );
    expect(
      () => _treatmentRecord(
        outcome: ValidationRunOutcome.error,
        segmentationAgreementUnavailable: 'invalid',
      ),
      throwsFormatException,
    );
  });

  test('a stored reason that is not a typed one is a damaged row', () async {
    final row = _treatmentRecord().toJson()
      ..['segmentationAgreementUnavailable'] = 'other';
    await file.writeAsString('${jsonEncode(row)}\n');

    expect(await ValidationJsonlStore(file).readAll(), isEmpty);
  });

  test('rejects an explicit null reason instead of reading it as absent', () {
    final row = _treatmentRecord().toJson()
      ..['segmentationAgreementUnavailable'] = null;

    expect(() => ValidationRunRecord.fromJson(row), throwsFormatException);
  });
}

class _FakeShare implements ValidationFileShare {
  final sharedFiles = <File>[];

  @override
  Future<void> share(File file) async => sharedFiles.add(file);
}

ValidationRunRecord _record(
  int repetition, {
  bool tracePersistenceFailed = false,
  List<ValidationRunModelArtifact> modelArtifacts = const [],
  SegmentationAgreement? segmentationAgreement,
  String? segmentationAgreementUnavailable,
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
  modelArtifacts: modelArtifacts,
  workflowVersionId: null,
  workflowVersion: null,
  backend: 'CPU',
  metadata: const ValidationRunMetadata(
    deviceModel: 'Pixel 8',
    platform: 'android',
    osVersion: '16',
    apiLevel: 36,
    appVersion: '1.0.0',
    sdkVersion: '0.3.0',
  ),
  durationMicros: 12,
  outcome: ValidationRunOutcome.success,
  traceCaptureEnabled: false,
  normalizedOutput: const {
    'classification': {'label': 'roya'},
  },
  tracePersistenceFailed: tracePersistenceFailed,
  segmentationAgreement: segmentationAgreement,
  segmentationAgreementUnavailable: segmentationAgreementUnavailable,
);

ValidationRunRecord _treatmentRecord({
  ValidationRunOutcome outcome = ValidationRunOutcome.success,
  SegmentationAgreement? segmentationAgreement,
  String? segmentationAgreementUnavailable,
}) => ValidationRunRecord(
  pairRunId: 'pair-1',
  repetition: 1,
  condition: ValidationCondition.treatment,
  phase: ValidationPhase.measured,
  scenarioId: 'SEG-01-PERF-02',
  caseId: 'image-1',
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
    sdkVersion: '0.4.0',
  ),
  durationMicros: 12,
  outcome: outcome,
  traceCaptureEnabled: false,
  normalizedOutput: outcome == ValidationRunOutcome.success
      ? {
          'mask': segmentationOutputJson(
            width: 2,
            height: 2,
            labels: const ['fondo', 'roya'],
            mask: Uint8List.fromList([0, 1, 1, 1]),
            areaFractions: const {'fondo': 0.25, 'roya': 0.75},
            confidence: 0.9,
          ),
        }
      : const {},
  errorCode: outcome == ValidationRunOutcome.success ? null : 'failed',
  segmentationAgreement: segmentationAgreement,
  segmentationAgreementUnavailable: segmentationAgreementUnavailable,
);
