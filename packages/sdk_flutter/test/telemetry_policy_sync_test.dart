import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/src/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
  late Directory storage;
  late HttpServer server;
  late HttpServer redirectTarget;
  var policyStatus = HttpStatus.ok;
  var policyBody = '{"enabled":true,"retentionDays":90}';
  final requests = <HttpRequest>[];
  var redirectTargetRequests = 0;

  setUp(() async {
    AyniSdk.resetForTesting();
    storage = await Directory.systemTemp.createTemp('ayni-policy-sync-');
    policyStatus = HttpStatus.ok;
    policyBody = '{"enabled":true,"retentionDays":90}';
    requests.clear();
    redirectTargetRequests = 0;
    redirectTarget = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    redirectTarget.listen((request) async {
      redirectTargetRequests++;
      await request.response.close();
    });
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      requests.add(request);
      request.response.statusCode = HttpStatus.ok;
      if (request.uri.path == '/sdk/telemetry-policy') {
        request.response.statusCode = policyStatus;
        if (policyStatus == HttpStatus.found) {
          request.response.headers.set(
            HttpHeaders.locationHeader,
            'http://${InternetAddress.loopbackIPv4.address}:${redirectTarget.port}/capture',
          );
        } else {
          request.response.write(policyBody);
        }
      } else if (request.uri.path == '/sdk/sync') {
        request.response.write('{"workflows":[],"models":[]}');
      }
      await request.response.close();
    });
  });

  tearDown(() async {
    AyniSdk.resetForTesting();
    await server.close(force: true);
    await redirectTarget.close(force: true);
    await storage.delete(recursive: true);
  });

  AyniSdk sdk() => AyniSdk(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storage,
    allowInsecureLoopback: true,
  );

  test('refreshes and persists policy without changing sync outcome', () async {
    final result = await sdk().sync();

    expect(result.status, SyncStatus.upToDate);
    expect(requests.map((request) => request.uri.path), [
      '/sdk/telemetry-policy',
      '/sdk/collection-policy',
      '/sdk/sync',
    ]);
    expect(
      requests.first.headers.value(HttpHeaders.authorizationHeader),
      'Bearer ayni_sk_test',
    );
    final cached = jsonDecode(
      await File(
        '${storage.path}/diagnostics/telemetry-policy.json',
      ).readAsString(),
    );
    expect(cached, {'enabled': true, 'retentionDays': 90});
  });

  test(
    'keeps the last valid enabled policy when refresh is unavailable',
    () async {
      final cache = File('${storage.path}/diagnostics/telemetry-policy.json');
      await cache.parent.create(recursive: true);
      await cache.writeAsString('{"enabled":true,"retentionDays":30}');
      policyStatus = HttpStatus.serviceUnavailable;

      final result = await sdk().sync();

      expect(result.status, SyncStatus.upToDate);
      expect(jsonDecode(await cache.readAsString()), {
        'enabled': true,
        'retentionDays': 30,
      });
    },
  );

  test('a disabled policy replaces an enabled cached policy', () async {
    final cache = File('${storage.path}/diagnostics/telemetry-policy.json');
    await cache.parent.create(recursive: true);
    await cache.writeAsString('{"enabled":true,"retentionDays":90}');
    policyBody = '{"enabled":false,"retentionDays":30}';

    await sdk().sync();

    expect(jsonDecode(await cache.readAsString()), {
      'enabled': false,
      'retentionDays': 30,
    });
  });

  test('does not follow cross-origin policy redirects', () async {
    policyStatus = HttpStatus.found;

    final result = await sdk().sync();

    expect(result.status, SyncStatus.upToDate);
    expect(redirectTargetRequests, 0);
    expect(
      await File('${storage.path}/diagnostics/telemetry-policy.json').exists(),
      isFalse,
    );
  });

  test('does not cache invalid policy responses', () async {
    policyBody = '{"enabled":true,"retentionDays":365}';

    final result = await sdk().sync();

    expect(result.status, SyncStatus.upToDate);
    expect(
      await File('${storage.path}/diagnostics/telemetry-policy.json').exists(),
      isFalse,
    );
  });
}
