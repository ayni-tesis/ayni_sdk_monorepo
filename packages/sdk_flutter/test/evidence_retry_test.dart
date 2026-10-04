// US-071: sync() retries the upload of an evidence that failed, waiting a
// little longer after each failure, and keeps it as `Fallida`, without
// retrying it automatically, once it reaches the configured limit.
import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/evidence_store.dart';
import 'package:ayni_sdk/src/network_type.dart';
import 'package:test/test.dart';

const _firstId = '6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f';
const _secondId = '7a2e3d4c-5b6a-4f9e-8d7c-1b2c3d4e5f60';

const _received = (outcome: EvidenceUploadOutcome.received, receivedAt: null);
const _failed = (outcome: EvidenceUploadOutcome.failed, receivedAt: null);

void main() {
  late Directory storage;
  late HttpServer server;
  // The outcome of each upload, in order; the last one repeats.
  var outcomes = <EvidenceUploadResult>[];
  final uploads = <String>[];
  final events = <EvidenceEvent>[];
  final progress = <String>[];
  var now = DateTime.utc(2026, 10, 4, 12);

  setUp(() async {
    AyniSdk.resetForTesting();
    storage = await Directory.systemTemp.createTemp('ayni-evidence-retry-');
    outcomes = [_failed];
    uploads.clear();
    events.clear();
    progress.clear();
    now = DateTime.utc(2026, 10, 4, 12);
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

  AyniSdk sdk({int maxEvidenceUploadAttempts = 5}) => createAyniSdkForTesting(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storage,
    allowInsecureLoopback: true,
    maxEvidenceUploadAttempts: maxEvidenceUploadAttempts,
    onProgress: progress.add,
    clock: () => now,
    networkTypeReader: () async => NetworkType.wifi,
    evidenceUploader: (evidence) async {
      uploads.add(evidence.uri.pathSegments.lastWhere((s) => s != ''));
      return outcomes.length > 1 ? outcomes.removeAt(0) : outcomes.single;
    },
  );

  Future<void> syncAt(AyniSdk client, DateTime time) async {
    now = time;
    await client.sync(onEvidence: events.add);
  }

  Map<EvidenceStatus, int> counts({
    int pending = 0,
    int retrying = 0,
    int received = 0,
    int failed = 0,
  }) => {
    EvidenceStatus.pending: pending,
    EvidenceStatus.retrying: retrying,
    EvidenceStatus.received: received,
    EvidenceStatus.failed: failed,
  };

  test('retries an evidence that failed for a temporary problem and marks it '
      'sent once the server confirms it', () async {
    await pendingEvidence([_firstId]);
    outcomes = [_failed, _received];
    final client = sdk();

    await syncAt(client, now);

    expect(events, [
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceUploadFailed,
    ]);
    expect(await client.evidenceStatusCounts(), counts(retrying: 1));
    expect(await client.pendingEvidenceCount(), 1);

    events.clear();
    await syncAt(client, now.add(const Duration(hours: 1)));

    expect(uploads, [_firstId, _firstId]);
    expect(events, [
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceReceived,
    ]);
    expect(await client.evidenceStatusCounts(), counts(received: 1));
    expect(await client.pendingEvidenceCount(), 0);
  });

  test('keeps an evidence that keeps failing as failed once it reaches the '
      'configured limit, and stops retrying it automatically', () async {
    await pendingEvidence([_firstId]);
    final client = sdk(maxEvidenceUploadAttempts: 3);

    for (var day = 0; day < 3; day++) {
      await syncAt(client, now.add(const Duration(days: 1)));
    }

    expect(uploads, [_firstId, _firstId, _firstId]);
    expect(events, [
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceUploadFailed,
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceUploadFailed,
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceRetriesExhausted,
    ]);
    expect(
      progress.last,
      'No se pudo enviar la evidencia después de varios intentos.',
    );
    expect(await client.evidenceStatusCounts(), counts(failed: 1));
    expect(await client.pendingEvidenceCount(), 0);
    expect(await client.evidenceQueueStatus(), EvidenceQueueStatus.empty);
    // The SDK keeps it, image and data unchanged.
    final directory = evidenceDirectory(_firstId);
    expect(await File('${directory.path}/image').readAsBytes(), [1, 2, 3]);
    expect(
      await File('${directory.path}/evidence.json').readAsString(),
      '{"evidenceId":"$_firstId"}',
    );

    events.clear();
    await syncAt(client, now.add(const Duration(days: 30)));

    expect(uploads, hasLength(3));
    expect(events, isEmpty);
    expect(await client.evidenceStatusCounts(), counts(failed: 1));
  });

  test('waits longer after each failure before it retries, so a sync soon '
      'after one sends nothing', () async {
    await pendingEvidence([_firstId]);
    final client = sdk();
    final start = now;

    // Failures at 0, 5 and 15 minutes; the waits are 5 and then 10 minutes.
    for (final (minute, uploaded) in [
      (0, 1),
      (4, 1),
      (5, 2),
      (14, 2),
      (15, 3),
      (34, 3),
    ]) {
      await syncAt(client, start.add(Duration(minutes: minute)));
      expect(uploads, hasLength(uploaded), reason: 'at minute $minute');
    }
    expect(await client.evidenceStatusCounts(), counts(retrying: 1));
    expect(await client.evidenceQueueStatus(), EvidenceQueueStatus.pending);
  });

  test('never waits more than an hour between two attempts', () {
    expect(
      [
        for (var failures = 1; failures <= 7; failures++) failures,
      ].map((failures) => evidenceRetryDelay(failures).inMinutes),
      [5, 10, 20, 40, 60, 60, 60],
    );
  });

  test('retries when the device clock went back after a failure', () async {
    await pendingEvidence([_firstId]);
    final client = sdk();
    await syncAt(client, now);

    await syncAt(client, now.subtract(const Duration(days: 1)));

    expect(uploads, [_firstId, _firstId]);
  });

  test(
    'goes on with the next evidence while one waits for its retry',
    () async {
      await pendingEvidence([_firstId]);
      final client = sdk();
      await syncAt(client, now);
      await pendingEvidence([_secondId]);
      outcomes = [_received];

      await syncAt(client, now.add(const Duration(minutes: 1)));

      expect(uploads, [_firstId, _secondId]);
      expect(
        await client.evidenceStatusCounts(),
        counts(retrying: 1, received: 1),
      );
    },
  );

  test('a revoked credential uses up no attempt', () async {
    await pendingEvidence([_firstId]);
    outcomes = [
      (outcome: EvidenceUploadOutcome.credentialRevoked, receivedAt: null),
    ];
    final client = sdk(maxEvidenceUploadAttempts: 1);

    await syncAt(client, now);
    await syncAt(client, now);

    expect(uploads, [_firstId, _firstId]);
    expect(events.last, EvidenceEvent.evidenceCredentialRevoked);
    expect(await client.evidenceStatusCounts(), counts(pending: 1));
  });

  test('a rejection of one evidence counts as an attempt but lets the next '
      'one go', () async {
    await pendingEvidence([_firstId, _secondId]);
    outcomes = [(outcome: EvidenceUploadOutcome.rejected, receivedAt: null)];
    final client = sdk(maxEvidenceUploadAttempts: 1);

    await syncAt(client, now);

    expect(uploads, hasLength(2));
    expect(events, [
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceRetriesExhausted,
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceRetriesExhausted,
    ]);
    expect(await client.evidenceStatusCounts(), counts(failed: 2));
  });

  test('a temporary failure stops the queue until a later sync', () async {
    await pendingEvidence([_firstId, _secondId]);
    final client = sdk();

    await syncAt(client, now);

    expect(uploads, hasLength(1));
    expect(
      await client.evidenceStatusCounts(),
      counts(pending: 1, retrying: 1),
    );
    expect(await client.pendingEvidenceCount(), 2);
  });

  test('counts nothing without evidence, and a new evidence as pending, but '
      'not one still being written', () async {
    final client = sdk();
    expect(await client.evidenceStatusCounts(), counts());

    await pendingEvidence([_firstId]);
    await Directory('${storage.path}/evidence/$_secondId.tmp').create();

    expect(await client.evidenceStatusCounts(), counts(pending: 1));
  });

  test('clearPendingEvidence deletes the evidence of every status', () async {
    await pendingEvidence([_firstId, _secondId]);
    outcomes = [_received, _failed];
    final client = sdk(maxEvidenceUploadAttempts: 1);
    await syncAt(client, now);
    expect(await client.evidenceStatusCounts(), counts(received: 1, failed: 1));

    await client.clearPendingEvidence();

    expect(await client.evidenceStatusCounts(), counts());
  });

  test('gives each status its Spanish text', () {
    expect(EvidenceStatus.values.map((status) => status.message), [
      'Pendiente',
      'Reintentando',
      'Enviada',
      'Fallida',
    ]);
  });

  test('a failed evidence does not hold the next one', () async {
    await pendingEvidence([_firstId]);
    final client = sdk(maxEvidenceUploadAttempts: 1);
    await syncAt(client, now);
    await pendingEvidence([_secondId]);
    outcomes = [_received];

    await syncAt(client, now.add(const Duration(minutes: 1)));

    expect(uploads, [_firstId, _secondId]);
    expect(await client.evidenceStatusCounts(), counts(failed: 1, received: 1));
  });
}
