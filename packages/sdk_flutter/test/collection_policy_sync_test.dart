// US-067: sync() refreshes the application's collection policy, whose size
// and quality the SDK applies to each evidence image.
import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/src/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
  late Directory storage;
  late HttpServer server;
  late HttpServer redirectTarget;
  late File cache;
  var policyStatus = HttpStatus.ok;
  var policyBody = '';
  final requests = <HttpRequest>[];
  var redirectTargetRequests = 0;

  const enabledPolicy =
      '{"enabled":true,"consentRequired":true,"network":"wifi",'
      '"maxImageSize":640,"imageQuality":55}';

  setUp(() async {
    AyniSdk.resetForTesting();
    storage = await Directory.systemTemp.createTemp('ayni-collection-sync-');
    cache = File('${storage.path}/diagnostics/collection-policy.json');
    policyStatus = HttpStatus.ok;
    policyBody = enabledPolicy;
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
      if (request.uri.path == '/sdk/collection-policy') {
        request.response.statusCode = policyStatus;
        if (policyStatus == HttpStatus.found) {
          request.response.headers.set(
            HttpHeaders.locationHeader,
            'http://${InternetAddress.loopbackIPv4.address}:${redirectTarget.port}/policy',
          );
        } else {
          request.response.write(policyBody);
        }
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

  test('keeps the size and quality of the policy without changing the sync '
      'outcome', () async {
    final result = await sdk().sync();

    expect(result.status, SyncStatus.upToDate);
    expect(requests.map((request) => request.uri.path), [
      '/sdk/telemetry-policy',
      '/sdk/collection-policy',
      '/sdk/sync',
    ]);
    expect(
      requests[1].headers.value(HttpHeaders.authorizationHeader),
      'Bearer ayni_sk_test',
    );
    expect(jsonDecode(await cache.readAsString()), {
      'maxImageSize': 640,
      'imageQuality': 55,
    });
  });

  test('replaces the cached limits when the policy changes', () async {
    await cache.parent.create(recursive: true);
    await cache.writeAsString('{"maxImageSize":640,"imageQuality":55}');
    policyBody =
        '{"enabled":false,"consentRequired":false,"network":"wifi",'
        '"maxImageSize":1024,"imageQuality":80}';

    await sdk().sync();

    expect(jsonDecode(await cache.readAsString()), {
      'maxImageSize': 1024,
      'imageQuality': 80,
    });
  });

  test('keeps the last valid limits when the policy is unavailable', () async {
    await cache.parent.create(recursive: true);
    await cache.writeAsString('{"maxImageSize":640,"imageQuality":55}');
    policyStatus = HttpStatus.serviceUnavailable;

    final result = await sdk().sync();

    expect(result.status, SyncStatus.upToDate);
    expect(jsonDecode(await cache.readAsString()), {
      'maxImageSize': 640,
      'imageQuality': 55,
    });
  });

  for (final (name, body) in [
    ('a size above 4096', enabledPolicy.replaceFirst('640', '5000')),
    ('a size below 128', enabledPolicy.replaceFirst('640', '64')),
    ('a quality below 10', enabledPolicy.replaceFirst('55', '5')),
    ('a quality above 100', enabledPolicy.replaceFirst('55', '101')),
    ('a fractional size', enabledPolicy.replaceFirst('640', '640.5')),
    ('no quality', enabledPolicy.replaceFirst(',"imageQuality":55', '')),
    ('a body that is not JSON', 'not json'),
  ]) {
    test('does not keep a policy with $name', () async {
      policyBody = body;

      final result = await sdk().sync();

      expect(result.status, SyncStatus.upToDate);
      expect(await cache.exists(), isFalse);
    });
  }

  test('reads the limits of a policy with fields it does not use', () async {
    policyBody = enabledPolicy.replaceFirst('}', ',"newSetting":true}');

    await sdk().sync();

    expect(jsonDecode(await cache.readAsString()), {
      'maxImageSize': 640,
      'imageQuality': 55,
    });
  });

  test('does not follow policy redirects', () async {
    policyStatus = HttpStatus.found;

    final result = await sdk().sync();

    expect(result.status, SyncStatus.upToDate);
    expect(redirectTargetRequests, 0);
    expect(await cache.exists(), isFalse);
  });
}
