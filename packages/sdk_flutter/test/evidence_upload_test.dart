// US-070: sync() uploads each pending evidence to the credential's
// application and counts it as sent only once the server confirms it.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/network_type.dart';
import 'package:crypto/crypto.dart';
import 'package:test/test.dart';

const _firstId = '6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f';
const _secondId = '7a2e3d4c-5b6a-4f9e-8d7c-1b2c3d4e5f60';
const _image = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9];
const _receivedAt = '2026-10-03T12:01:00.000Z';
const _revoked = {
  'message':
      'La credencial fue revocada. Genera una nueva credencial para continuar.',
  'code': 'credentialRevoked',
};

Map<String, Object?> _record(String id) => {
  'evidenceSchemaVersion': 1,
  'evidenceId': id,
  'capturedAt': '2026-10-03T12:00:00.000Z',
  'workflowId': 'workflow-1',
  'workflowVersionId': 'workflow-version-1',
  'workflowVersion': '1.0.0',
  'captureNodeId': 'captura',
  'model': {
    'modelVersionId': 'model-version-1',
    'version': '2.0.0',
    'sha256': 'a' * 64,
  },
  'result': {
    'type': 'classification',
    'nodeId': 'modelo',
    'label': 'sana',
    'confidence': 0.9,
    'confidences': {'sana': 0.9},
  },
  'image': {
    'mediaType': 'image/jpeg',
    'width': 640,
    'height': 480,
    'maxImageSize': 1024,
    'imageQuality': 80,
  },
};

/// What the test server received.
class _Request {
  _Request(this.method, this.path, this.headers, this.body);

  final String method;
  final String path;
  final HttpHeaders headers;
  final List<int> body;

  @override
  String toString() => '$method $path';
}

void main() {
  late Directory storage;
  late HttpServer server;
  late List<_Request> requests;
  // How the server answers each step; each returns status and JSON body.
  late (int, Object?) Function(String id) start;
  late int Function() storageStatus;
  late (int, Object?) Function(String id) complete;
  late Future<void> Function() beforeCompleteAnswer;
  late String uploadHost;

  setUp(() async {
    AyniSdk.resetForTesting();
    storage = await Directory.systemTemp.createTemp('ayni-evidence-upload-');
    requests = [];
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    uploadHost =
        'http://${InternetAddress.loopbackIPv4.address}:${server.port}';
    start = (id) => (
      200,
      {
        'evidenceId': id,
        'status': 'uploadRequired',
        'uploadUrl': '$uploadHost/storage/$id.jpg?signature=x',
        'uploadUrlExpiresAt': '2026-10-03T12:16:00.000Z',
      },
    );
    storageStatus = () => 200;
    complete = (id) => (
      200,
      {'evidenceId': id, 'status': 'received', 'receivedAt': _receivedAt},
    );
    beforeCompleteAnswer = () async {};
    server.listen((request) async {
      final body = await request.fold<List<int>>([], (all, part) {
        return all..addAll(part);
      });
      final path = request.uri.path;
      requests.add(_Request(request.method, path, request.headers, body));
      var status = 200;
      Object? answer;
      if (path == '/sdk/collection-policy') {
        answer = {
          'enabled': true,
          'consentRequired': true,
          'network': 'wifi',
          'maxImageSize': 1024,
          'imageQuality': 80,
        };
      } else if (path == '/sdk/telemetry-policy') {
        answer = {'enabled': false, 'retentionDays': 30};
      } else if (path == '/sdk/sync') {
        answer = {'workflows': [], 'models': []};
      } else if (path == '/sdk/evidence') {
        final id = (jsonDecode(utf8.decode(body)) as Map)['evidenceId'];
        (status, answer) = start(id as String);
      } else if (path.startsWith('/storage/')) {
        status = storageStatus();
        answer = '';
      } else if (path.endsWith('/complete')) {
        await beforeCompleteAnswer();
        (status, answer) = complete(path.split('/')[3]);
      }
      request.response.statusCode = status;
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
      await File('${directory.path}/image').writeAsBytes(_image);
      await File(
        '${directory.path}/evidence.json',
      ).writeAsString(jsonEncode(_record(id)));
    }
  }

  final progress = <String>[];
  AyniSdk sdk() {
    progress.clear();
    return createAyniSdkForTesting(
      serverUrl: Uri.parse(uploadHost),
      credential: 'ayni_sk_test',
      storageDirectory: storage,
      allowInsecureLoopback: true,
      networkTypeReader: () async => NetworkType.wifi,
      onProgress: progress.add,
    );
  }

  List<String> evidenceRequests() => [
    for (final request in requests)
      if (!request.path.endsWith('-policy') && request.path != '/sdk/sync')
        '$request',
  ];

  test('uploads a pending evidence and counts it as sent only once the '
      'server confirms it', () async {
    await pendingEvidence([_firstId]);
    final events = <EvidenceEvent>[];
    final client = sdk();

    final result = await client.sync(onEvidence: events.add);

    expect(result.status, SyncStatus.upToDate);
    expect(events, [
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceReceived,
    ]);
    expect(progress, ['Subiendo evidencia…', 'Evidencia recibida.']);
    expect(evidenceRequests(), [
      'POST /sdk/evidence',
      'PUT /storage/$_firstId.jpg',
      'POST /sdk/evidence/$_firstId/complete',
    ]);
    expect(requests.last.path, '/sdk/sync');
    expect(await client.pendingEvidenceCount(), 0);
    expect(await client.evidenceQueueStatus(), EvidenceQueueStatus.empty);
  });

  test('sends the data of evidence.json with the size and SHA-256 of its '
      'image, and the image without the credential', () async {
    await pendingEvidence([_firstId]);

    await sdk().sync();

    final started = requests.firstWhere((r) => r.path == '/sdk/evidence');
    final uploaded = requests.firstWhere((r) => r.method == 'PUT');
    final completed = requests.firstWhere((r) => r.path.endsWith('/complete'));
    expect(jsonDecode(utf8.decode(started.body)), {
      ..._record(_firstId),
      'image': {
        ...(_record(_firstId)['image']! as Map),
        'byteSize': _image.length,
        'sha256': sha256.convert(_image).toString(),
      },
    });
    for (final request in [started, completed]) {
      expect(request.headers.value('authorization'), 'Bearer ayni_sk_test');
    }
    expect(uploaded.headers.value('authorization'), isNull);
    expect(uploaded.headers.contentType?.mimeType, 'image/jpeg');
    expect(uploaded.body, _image);
    expect(completed.body, isEmpty);
  });

  test('keeps evidence.json unchanged and records the confirmation apart, so '
      'a later sync does not upload it again', () async {
    await pendingEvidence([_firstId]);
    final client = sdk();
    await client.sync();
    final record = File('${evidenceDirectory(_firstId).path}/evidence.json');
    requests.clear();

    await client.sync();

    expect(jsonDecode(await record.readAsString()), _record(_firstId));
    expect(
      jsonDecode(
        await File(
          '${evidenceDirectory(_firstId).path}/received.json',
        ).readAsString(),
      ),
      {'evidenceId': _firstId, 'receivedAt': _receivedAt},
    );
    expect(evidenceRequests(), isEmpty);
  });

  test('does not upload the image again when the server already received '
      'the evidence', () async {
    await pendingEvidence([_firstId]);
    start = (id) => (
      200,
      {'evidenceId': id, 'status': 'received', 'receivedAt': _receivedAt},
    );
    final events = <EvidenceEvent>[];
    final client = sdk();

    await client.sync(onEvidence: events.add);

    expect(evidenceRequests(), ['POST /sdk/evidence']);
    expect(events.last, EvidenceEvent.evidenceReceived);
    expect(await client.pendingEvidenceCount(), 0);
  });

  for (final (step, revokeStart) in [
    ('starting the upload', true),
    ('confirming it', false),
  ]) {
    test('does not mark the evidence sent when the server rejects the '
        'revoked credential while $step', () async {
      await pendingEvidence([_firstId, _secondId]);
      if (revokeStart) {
        start = (_) => (401, _revoked);
      } else {
        complete = (_) => (401, _revoked);
      }
      final events = <EvidenceEvent>[];
      final client = sdk();

      await client.sync(onEvidence: events.add);

      expect(events, [
        EvidenceEvent.evidenceUploading,
        EvidenceEvent.evidenceCredentialRevoked,
      ]);
      expect(
        progress.last,
        'No se puede enviar evidencia porque la credencial fue revocada.',
      );
      expect(
        evidenceRequests().where((r) => r == 'POST /sdk/evidence'),
        hasLength(1),
      );
      expect(await client.pendingEvidenceCount(), 2);
    });
  }

  for (final (name, change) in [
    ('the server does not confirm it', () => complete = (_) => (500, {})),
    ('the storage rejects the image', () => storageStatus = () => 403),
    ('the server fails to start it', () => start = (_) => (503, {})),
    (
      'the confirmation names another evidence',
      () => complete = (_) => (
        200,
        {'evidenceId': _secondId, 'status': 'received', 'receivedAt': 'x'},
      ),
    ),
  ]) {
    test('keeps the evidence pending and stops when $name', () async {
      await pendingEvidence([_firstId, _secondId]);
      change();
      final events = <EvidenceEvent>[];
      final client = sdk();

      final result = await client.sync(onEvidence: events.add);

      expect(result.status, SyncStatus.upToDate);
      expect(events, [
        EvidenceEvent.evidenceUploading,
        EvidenceEvent.evidenceUploadFailed,
      ]);
      expect(
        progress.last,
        'No se pudo enviar la evidencia; se reintentará cuando sea posible.',
      );
      expect(await client.pendingEvidenceCount(), 2);
    });
  }

  test('goes on with the next evidence when the server rejects one', () async {
    await pendingEvidence([_firstId, _secondId]);
    var rejected = false;
    start = (id) {
      if (!rejected) {
        rejected = true;
        return (
          404,
          {
            'message':
                'La evidencia no corresponde a un workflow publicado de esta aplicación.',
            'code': 'evidenceSourceNotFound',
          },
        );
      }
      return (
        200,
        {'evidenceId': id, 'status': 'received', 'receivedAt': _receivedAt},
      );
    };
    final events = <EvidenceEvent>[];
    final client = sdk();

    await client.sync(onEvidence: events.add);

    expect(events, [
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceUploadFailed,
      EvidenceEvent.evidenceUploading,
      EvidenceEvent.evidenceReceived,
    ]);
    expect(await client.pendingEvidenceCount(), 1);
  });

  test('never sends the image to a URL it may not use', () async {
    await pendingEvidence([_firstId]);
    start = (id) => (
      200,
      {
        'evidenceId': id,
        'status': 'uploadRequired',
        'uploadUrl': 'http://storage.example/$id.jpg',
        'uploadUrlExpiresAt': '2026-10-03T12:16:00.000Z',
      },
    );
    final events = <EvidenceEvent>[];

    await sdk().sync(onEvidence: events.add);

    expect(evidenceRequests(), ['POST /sdk/evidence']);
    expect(events.last, EvidenceEvent.evidenceUploadFailed);
  });

  test('rejects an evidence whose files do not describe it, without a '
      'request, and goes on', () async {
    await pendingEvidence([_firstId, _secondId]);
    await File(
      '${evidenceDirectory(_firstId).path}/evidence.json',
    ).writeAsString(jsonEncode(_record(_secondId)));
    final events = <EvidenceEvent>[];

    await sdk().sync(onEvidence: events.add);

    expect(
      events.where((event) => event == EvidenceEvent.evidenceUploadFailed),
      hasLength(1),
    );
    expect(
      events.where((event) => event == EvidenceEvent.evidenceReceived),
      hasLength(1),
    );
    expect(
      evidenceRequests().where((r) => r == 'POST /sdk/evidence'),
      hasLength(1),
    );
  });

  test('rejects an evidence that lost its image, without a request, and goes '
      'on with the next one', () async {
    await pendingEvidence([_firstId, _secondId]);
    await File('${evidenceDirectory(_firstId).path}/image').delete();
    final events = <EvidenceEvent>[];
    final client = sdk();

    await client.sync(onEvidence: events.add);

    expect(
      events.where((event) => event == EvidenceEvent.evidenceUploadFailed),
      hasLength(1),
    );
    expect(
      events.where((event) => event == EvidenceEvent.evidenceReceived),
      hasLength(1),
    );
    expect(
      evidenceRequests().where((r) => r == 'POST /sdk/evidence'),
      hasLength(1),
    );
    expect(await client.pendingEvidenceCount(), 1);
  });

  test('reports nothing more for an evidence the app cleared while it was '
      'being uploaded', () async {
    await pendingEvidence([_firstId]);
    final events = <EvidenceEvent>[];
    final client = sdk();
    final confirming = Completer<void>();
    beforeCompleteAnswer = () async {
      await client.clearPendingEvidence();
      confirming.complete();
    };

    await client.sync(onEvidence: events.add);
    await confirming.future;

    expect(events, [EvidenceEvent.evidenceUploading]);
    expect(await evidenceDirectory(_firstId).exists(), isFalse);
  });
}
