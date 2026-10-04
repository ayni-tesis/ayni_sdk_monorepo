// US-072: once the server confirms an evidence, sync() deletes its local
// copy and takes it out of the queue; without a confirmation it keeps it.
import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/evidence_store.dart';
import 'package:ayni_sdk/src/network_type.dart';
import 'package:test/test.dart';

const _firstId = '6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f';
const _secondId = '7a2e3d4c-5b6a-4f9e-8d7c-1b2c3d4e5f60';
const _stoppedId = '8b3f4e5d-6c7b-4a0f-9e8d-2c3d4e5f6071';

const _received = (outcome: EvidenceUploadOutcome.received, receivedAt: null);
const _failed = (outcome: EvidenceUploadOutcome.failed, receivedAt: null);

void main() {
  late Directory storage;
  late HttpServer server;
  // The outcome of each upload, in order; the last one repeats.
  var outcomes = <EvidenceUploadResult>[];
  // Runs inside each upload, before it ends.
  Future<void> Function(AyniSdk client, Directory evidence) duringUpload =
      (_, _) async {};
  final uploads = <String>[];
  final events = <EvidenceEvent>[];

  setUp(() async {
    AyniSdk.resetForTesting();
    storage = await Directory.systemTemp.createTemp('ayni-evidence-deletion-');
    outcomes = [_received];
    duringUpload = (_, _) async {};
    uploads.clear();
    events.clear();
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      final answer = switch (request.uri.path) {
        '/sdk/collection-policy' => {
          'enabled': true,
          'consentRequired': true,
          'network': 'wifiAndCellular',
          'maxImageSize': 1024,
          'imageQuality': 80,
        },
        '/sdk/telemetry-policy' => {'enabled': false, 'retentionDays': 30},
        _ => {'workflows': [], 'models': []},
      };
      request.response.write(jsonEncode(answer));
      await request.response.close();
    });
  });

  tearDown(() async {
    AyniSdk.resetForTesting();
    await server.close(force: true);
    await storage.delete(recursive: true);
  });

  Directory evidenceDirectory(String id) =>
      Directory('${storage.path}/evidence/$id');

  Future<void> pendingEvidence(List<String> ids) async {
    for (final id in ids) {
      final directory = evidenceDirectory(id);
      await directory.create(recursive: true);
      await File('${directory.path}/image').writeAsBytes([1, 2, 3]);
      await File(
        '${directory.path}/evidence.json',
      ).writeAsString('{"evidenceId":"$id"}');
    }
  }

  late AyniSdk client;
  AyniSdk sdk() => client = createAyniSdkForTesting(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storage,
    allowInsecureLoopback: true,
    networkTypeReader: () async => NetworkType.wifi,
    evidenceUploader: (evidence) async {
      uploads.add(evidence.uri.pathSegments.lastWhere((s) => s != ''));
      await duringUpload(client, evidence);
      return outcomes.length > 1 ? outcomes.removeAt(0) : outcomes.single;
    },
  );

  Map<EvidenceStatus, int> counts({
    int pending = 0,
    int uploading = 0,
    int retrying = 0,
    int received = 0,
    int failed = 0,
  }) => {
    EvidenceStatus.pending: pending,
    EvidenceStatus.uploading: uploading,
    EvidenceStatus.retrying: retrying,
    EvidenceStatus.received: received,
    EvidenceStatus.failed: failed,
  };

  test('deletes the optimized local copy once the server confirms the upload '
      'and takes it out of the pending queue', () async {
    await pendingEvidence([_firstId]);
    final existedWhenReceived = <bool>[];
    final client = sdk();

    await client.sync(
      onEvidence: (event) {
        events.add(event);
        if (event == EvidenceEvent.evidenceReceived) {
          existedWhenReceived.add(evidenceDirectory(_firstId).existsSync());
        }
      },
    );

    expect(events, [
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceReceived,
    ]);
    expect(existedWhenReceived, [false]);
    expect(await evidenceDirectory(_firstId).exists(), isFalse);
    expect(await Directory('${storage.path}/evidence').list().toList(), []);
    expect(await client.pendingEvidenceCount(), 0);
    expect(await client.evidenceQueueStatus(), EvidenceQueueStatus.empty);
    expect(await client.evidenceStatusCounts(), counts());
  });

  test('keeps the local copy as pending, without deleting it, when the upload '
      'ends without a confirmation', () async {
    await pendingEvidence([_firstId]);
    outcomes = [_failed];
    final client = sdk();

    await client.sync(onEvidence: events.add);

    expect(events, [
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceUploadFailed,
    ]);
    final directory = evidenceDirectory(_firstId);
    expect(await File('${directory.path}/image').readAsBytes(), [1, 2, 3]);
    expect(
      await File('${directory.path}/evidence.json').readAsString(),
      '{"evidenceId":"$_firstId"}',
    );
    expect(await File('${directory.path}/received.json').exists(), isFalse);
    expect(await client.pendingEvidenceCount(), 1);
    expect(await client.evidenceStatusCounts(), counts(retrying: 1));
  });

  test('shows the evidence as uploading, never as received, until the server '
      'confirms it', () async {
    await pendingEvidence([_firstId, _secondId]);
    final during = <Map<EvidenceStatus, int>>[];
    final pendingDuring = <int>[];
    duringUpload = (client, _) async {
      during.add(await client.evidenceStatusCounts());
      pendingDuring.add(await client.pendingEvidenceCount());
    };
    outcomes = [_received, _failed];
    final client = sdk();

    await client.sync(onEvidence: events.add);

    expect(during, [counts(pending: 1, uploading: 1), counts(uploading: 1)]);
    expect(pendingDuring, [2, 1]);
    expect(await client.evidenceStatusCounts(), counts(retrying: 1));
  });

  test('does not touch workflows, installed models or other files of the '
      'storage directory', () async {
    final others = {
      'sync-inventory.json': '{"workflows":[],"models":[]}',
      'workflow-definitions/workflow.json': '{"schemaVersion":"3"}',
      'model-version-1/model-version-1.tflite': 'model',
      'model-version-1/model-version-1.json': '{"sha256":"a"}',
      'diagnostics/collection-policy.json': '{}',
      'installation-id': _secondId,
    };
    for (final MapEntry(key: path, value: contents) in others.entries) {
      final file = File('${storage.path}/$path');
      await file.parent.create(recursive: true);
      await file.writeAsString(contents);
    }
    await pendingEvidence([_firstId]);

    await sdk().sync(onEvidence: events.add);

    expect(events.last, EvidenceEvent.evidenceReceived);
    expect(await evidenceDirectory(_firstId).exists(), isFalse);
    for (final MapEntry(key: path, value: contents) in others.entries) {
      final file = File('${storage.path}/$path');
      // The sync may refresh the cached collection policy.
      if (path.startsWith('diagnostics/')) {
        expect(await file.exists(), isTrue, reason: path);
      } else {
        expect(await file.readAsString(), contents, reason: path);
      }
    }
  });

  test('when it cannot delete the confirmed copy, does not upload it again '
      'and deletes it in the next sync', () async {
    await pendingEvidence([_firstId]);
    // Something in the way of the deletion, only during this upload.
    duringUpload = (_, _) async {
      final blocker = File('${storage.path}/evidence/$_firstId.tmp/image');
      await blocker.create(recursive: true);
    };
    final client = sdk();

    await client.sync(onEvidence: events.add);

    expect(events.last, EvidenceEvent.evidenceReceived);
    expect(
      await File('${evidenceDirectory(_firstId).path}/received.json').exists(),
      isTrue,
    );
    expect(await client.pendingEvidenceCount(), 0);
    expect(await client.evidenceStatusCounts(), counts(received: 1));

    duringUpload = (_, _) async {};
    events.clear();
    await client.sync(onEvidence: events.add);

    expect(uploads, [_firstId]);
    expect(events, isEmpty);
    expect(await Directory('${storage.path}/evidence').list().toList(), []);
    expect(await client.evidenceStatusCounts(), counts());
  });

  test('deletes, without uploading it again, an evidence confirmed before '
      'the app stopped and the half-written evidence it left', () async {
    await pendingEvidence([_firstId, _secondId]);
    await File(
      '${evidenceDirectory(_firstId).path}/received.json',
    ).writeAsString(
      '{"evidenceId":"$_firstId","receivedAt":"2026-10-04T12:00:00.000Z"}',
    );
    await File(
      '${storage.path}/evidence/$_stoppedId.tmp/image',
    ).create(recursive: true);
    outcomes = [_failed];
    final client = sdk();
    expect(
      await client.evidenceStatusCounts(),
      counts(received: 1, pending: 1),
    );

    await client.sync(onEvidence: events.add);

    expect(uploads, [_secondId]);
    expect(
      (await Directory('${storage.path}/evidence').list().toList()).map(
        (entity) => entity.uri.pathSegments.lastWhere((s) => s != ''),
      ),
      [_secondId],
    );
    expect(await client.evidenceStatusCounts(), counts(retrying: 1));
  });

  test('keeps the failed evidence on the device', () async {
    await pendingEvidence([_firstId]);
    outcomes = [_failed];
    final client = createAyniSdkForTesting(
      serverUrl: Uri.parse(
        'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
      ),
      credential: 'ayni_sk_test',
      storageDirectory: storage,
      allowInsecureLoopback: true,
      maxEvidenceUploadAttempts: 1,
      networkTypeReader: () async => NetworkType.wifi,
      evidenceUploader: (_) async => _failed,
    );

    await client.sync();
    await client.sync();

    expect(await client.evidenceStatusCounts(), counts(failed: 1));
    expect(
      await File('${evidenceDirectory(_firstId).path}/image').readAsBytes(),
      [1, 2, 3],
    );
  });

  test('reports nothing and fails nothing when the app clears the evidence '
      'while the server confirms it', () async {
    await pendingEvidence([_firstId]);
    duringUpload = (client, _) => client.clearPendingEvidence();
    final client = sdk();

    final result = await client.sync(onEvidence: events.add);

    expect(result.status, SyncStatus.upToDate);
    expect(events, [EvidenceEvent.evidenceUploading]);
    expect(await Directory('${storage.path}/evidence').exists(), isFalse);
    expect(await client.evidenceStatusCounts(), counts());
  });
}
