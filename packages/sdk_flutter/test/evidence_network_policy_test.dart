// US-069: before each evidence upload the SDK consults the collection policy
// and the type of connection, and with `wifi` it only sends over Wi-Fi; the
// queue reports `Pendiente de Wi-Fi` while it waits.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/collection_policy_store.dart';
import 'package:ayni_sdk/src/network_type.dart';
import 'package:test/test.dart';

String _policy({bool enabled = true, String network = 'wifi'}) => jsonEncode({
  'enabled': enabled,
  'consentRequired': true,
  'network': network,
  'maxImageSize': 640,
  'imageQuality': 55,
});

void main() {
  late Directory storage;
  late HttpServer server;
  final requests = <String>[];
  // The bodies of the next policy requests, in order; the last one repeats.
  var policyBodies = <String>[];
  var policyStatus = HttpStatus.ok;
  var networks = <NetworkType>[];
  var networkReads = 0;
  // Replaces the answer of the network reader when set.
  Future<NetworkType> Function()? networkFailure;
  final uploads = <String>[];
  var confirmUploads = true;

  setUp(() async {
    AyniSdk.resetForTesting();
    storage = await Directory.systemTemp.createTemp('ayni-evidence-network-');
    requests.clear();
    uploads.clear();
    policyBodies = [_policy()];
    policyStatus = HttpStatus.ok;
    networks = [NetworkType.wifi];
    networkReads = 0;
    networkFailure = null;
    confirmUploads = true;
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      requests.add(request.uri.path);
      if (request.uri.path == '/sdk/collection-policy') {
        request.response.statusCode = policyStatus;
        request.response.write(
          policyBodies.length > 1 ? policyBodies.removeAt(0) : policyBodies[0],
        );
      } else if (request.uri.path == '/sdk/telemetry-policy') {
        request.response.write('{"enabled":false,"retentionDays":30}');
      } else if (request.uri.path == '/sdk/sync') {
        request.response.write('{"workflows":[],"models":[]}');
      }
      await request.response.close();
    });
  });

  tearDown(() async {
    AyniSdk.resetForTesting();
    await server.close(force: true);
    await storage.delete(recursive: true);
  });

  Future<NetworkType> readNetwork() async {
    final index = networkReads++;
    final failure = networkFailure;
    if (failure != null) return failure();
    return networks[index < networks.length ? index : networks.length - 1];
  }

  AyniSdk sdk({bool withUploader = true}) => createAyniSdkForTesting(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storage,
    allowInsecureLoopback: true,
    networkTypeReader: readNetwork,
    evidenceUploader: withUploader
        ? (evidence) async {
            uploads.add(evidence.uri.pathSegments.lastWhere((s) => s != ''));
            return confirmUploads;
          }
        : null,
  );

  Future<void> pendingEvidence(List<String> ids) async {
    for (final id in ids) {
      final directory = Directory('${storage.path}/evidence/$id');
      await directory.create(recursive: true);
      await File('${directory.path}/image').writeAsBytes([1, 2, 3]);
      await File(
        '${directory.path}/evidence.json',
      ).writeAsString('{"evidenceId":"$id"}');
    }
  }

  Future<void> cachePolicy(String body) async {
    final policy = CollectionPolicy.fromJson(jsonDecode(body));
    await CollectionPolicyStore(storage).write(policy!);
  }

  int policyRequests() =>
      requests.where((path) => path == '/sdk/collection-policy').length;

  group('when the SDK processes the queue', () {
    test('sends the pending evidence when the policy only allows Wi-Fi and '
        'the device has Wi-Fi', () async {
      await pendingEvidence(['evidence-1']);

      final result = await sdk().sync();

      expect(result.status, SyncStatus.upToDate);
      expect(uploads, ['evidence-1']);
      expect(requests, [
        '/sdk/telemetry-policy',
        '/sdk/collection-policy',
        '/sdk/sync',
      ]);
    });

    for (final network in [
      NetworkType.cellular,
      NetworkType.none,
      NetworkType.other,
    ]) {
      test('keeps the evidence pending and starts no upload when the policy '
          'only allows Wi-Fi and the device uses ${network.name}', () async {
        await pendingEvidence(['evidence-1', 'evidence-2']);
        networks = [network];
        final client = sdk();

        final result = await client.sync();

        expect(result.status, SyncStatus.upToDate);
        expect(uploads, isEmpty);
        expect(await client.pendingEvidenceCount(), 2);
        expect(
          await client.evidenceQueueStatus(),
          EvidenceQueueStatus.waitingForWifi,
        );
      });
    }

    test('keeps the evidence for a later sync with Wi-Fi', () async {
      await pendingEvidence(['evidence-1']);
      networks = [NetworkType.cellular];
      final client = sdk();
      await client.sync();
      expect(uploads, isEmpty);

      networks = [NetworkType.wifi];
      networkReads = 0;
      await client.sync();

      expect(uploads, ['evidence-1']);
    });

    for (final network in [NetworkType.wifi, NetworkType.cellular]) {
      test('sends over ${network.name} when the policy allows Wi-Fi and '
          'mobile data', () async {
        await pendingEvidence(['evidence-1']);
        policyBodies = [_policy(network: 'wifiAndCellular')];
        networks = [network];

        await sdk().sync();

        expect(uploads, ['evidence-1']);
      });
    }

    test('sends nothing over another or an unknown connection when the '
        'policy allows Wi-Fi and mobile data', () async {
      await pendingEvidence(['evidence-1']);
      policyBodies = [_policy(network: 'wifiAndCellular')];
      networks = [NetworkType.other];

      await sdk().sync();

      expect(uploads, isEmpty);
    });

    for (final (name, failure) in [
      ('fails', () async => throw StateError('no network service')),
      ('never answers', () => Completer<NetworkType>().future),
    ]) {
      test('sends nothing and still syncs when the network reader '
          '$name', () async {
        await pendingEvidence(['evidence-1']);
        policyBodies = [_policy(network: 'wifiAndCellular')];
        networkFailure = failure;
        final client = sdk();

        final result = await client.sync();

        expect(result.status, SyncStatus.upToDate);
        expect(requests.last, '/sdk/sync');
        expect(uploads, isEmpty);
        expect(await client.pendingEvidenceCount(), 1);
      });

      test('waits for Wi-Fi when the network reader $name', () async {
        await pendingEvidence(['evidence-1']);
        await cachePolicy(_policy());
        networkFailure = failure;

        expect(
          await sdk().evidenceQueueStatus(),
          EvidenceQueueStatus.waitingForWifi,
        );
      });
    }

    test('sends nothing without a connection even when the policy allows '
        'mobile data', () async {
      await pendingEvidence(['evidence-1']);
      policyBodies = [_policy(network: 'wifiAndCellular')];
      networks = [NetworkType.none];
      final client = sdk();

      await client.sync();

      expect(uploads, isEmpty);
      expect(await client.evidenceQueueStatus(), EvidenceQueueStatus.pending);
    });

    test(
      'sends nothing while the application does not collect evidence',
      () async {
        await pendingEvidence(['evidence-1']);
        policyBodies = [_policy(enabled: false, network: 'wifiAndCellular')];

        await sdk().sync();

        expect(uploads, isEmpty);
      },
    );

    test('sends nothing over a network the SDK does not know', () async {
      await pendingEvidence(['evidence-1']);
      policyBodies = [_policy(network: 'satellite')];

      await sdk().sync();

      expect(uploads, isEmpty);
    });

    test('consults the policy before each upload', () async {
      await pendingEvidence(['evidence-1', 'evidence-2', 'evidence-3']);
      policyBodies = [_policy(network: 'wifiAndCellular')];
      networks = [NetworkType.cellular];

      await sdk().sync();

      expect(uploads, hasLength(3));
      expect(policyRequests(), 3);
      expect(networkReads, 3);
      expect(requests.last, '/sdk/sync');
    });

    test('stops on cellular once the policy changes to Wi-Fi only', () async {
      await pendingEvidence(['evidence-1', 'evidence-2']);
      policyBodies = [
        _policy(network: 'wifiAndCellular'),
        _policy(network: 'wifi'),
      ];
      networks = [NetworkType.cellular];
      final client = sdk();

      await client.sync();

      expect(uploads, hasLength(1));
      expect(await client.pendingEvidenceCount(), 2);
      expect(
        await client.evidenceQueueStatus(),
        EvidenceQueueStatus.waitingForWifi,
      );
    });

    test('stops when the device leaves Wi-Fi between two uploads', () async {
      await pendingEvidence(['evidence-1', 'evidence-2']);
      networks = [NetworkType.wifi, NetworkType.cellular];

      await sdk().sync();

      expect(uploads, hasLength(1));
    });

    test('sends nothing when the policy cannot be consulted, even with a '
        'saved policy that allows it', () async {
      await pendingEvidence(['evidence-1']);
      await cachePolicy(_policy(network: 'wifiAndCellular'));
      policyStatus = HttpStatus.serviceUnavailable;

      final result = await sdk().sync();

      expect(result.status, SyncStatus.upToDate);
      expect(uploads, isEmpty);
    });

    test('stops when the server does not confirm an upload', () async {
      await pendingEvidence(['evidence-1', 'evidence-2']);
      confirmUploads = false;

      await sdk().sync();

      expect(uploads, hasLength(1));
      expect(policyRequests(), 1);
    });

    test('without pending evidence only refreshes the policy', () async {
      await sdk().sync();

      expect(networkReads, 0);
      expect(policyRequests(), 1);
    });

    test('sends nothing until the upload exists (US-070)', () async {
      await pendingEvidence(['evidence-1']);
      final client = sdk(withUploader: false);

      await client.sync();

      expect(networkReads, 0);
      expect(await client.pendingEvidenceCount(), 1);
    });
  });

  group('evidenceQueueStatus', () {
    test('is empty without pending evidence, whatever the network', () async {
      await cachePolicy(_policy());
      networks = [NetworkType.cellular];

      expect(await sdk().evidenceQueueStatus(), EvidenceQueueStatus.empty);
      expect(networkReads, 0);
    });

    test('waits for Wi-Fi with a Wi-Fi only policy and mobile data', () async {
      await pendingEvidence(['evidence-1']);
      await cachePolicy(_policy());
      networks = [NetworkType.cellular];

      final status = await sdk().evidenceQueueStatus();

      expect(status, EvidenceQueueStatus.waitingForWifi);
      expect(status.message, 'Pendiente de Wi-Fi');
      expect(requests, isEmpty);
    });

    for (final (name, policy, network) in [
      ('with Wi-Fi', _policy(), NetworkType.wifi),
      (
        'when the policy allows mobile data',
        _policy(network: 'wifiAndCellular'),
        NetworkType.cellular,
      ),
      (
        'while collection is disabled',
        _policy(enabled: false),
        NetworkType.cellular,
      ),
      (
        'with a policy saved before the SDK read its network',
        '{"maxImageSize":640,"imageQuality":55}',
        NetworkType.cellular,
      ),
    ]) {
      test('is pending $name', () async {
        await pendingEvidence(['evidence-1']);
        await cachePolicy(policy);
        networks = [network];

        final status = await sdk().evidenceQueueStatus();

        expect(status, EvidenceQueueStatus.pending);
        expect(status.message, 'Evidencia pendiente de envío');
      });
    }

    test('is pending before any sync saved a policy', () async {
      await pendingEvidence(['evidence-1']);
      networks = [NetworkType.cellular];

      expect(await sdk().evidenceQueueStatus(), EvidenceQueueStatus.pending);
    });

    test('ignores evidence that is still being written', () async {
      await Directory(
        '${storage.path}/evidence/evidence-1.tmp',
      ).create(recursive: true);

      final status = await sdk().evidenceQueueStatus();

      expect(status, EvidenceQueueStatus.empty);
      expect(status.message, 'Sin evidencia pendiente de envío');
    });
  });
}
