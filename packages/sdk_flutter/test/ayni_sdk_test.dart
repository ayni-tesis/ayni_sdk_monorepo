import 'dart:async';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
  late Directory storageDirectory;
  late HttpServer server;
  late int statusCode;
  late String responseBody;
  final requests = <HttpRequest>[];

  setUp(() async {
    requests.clear();
    storageDirectory = await Directory.systemTemp.createTemp('ayni-sdk-test-');
    statusCode = HttpStatus.ok;
    responseBody = '{"authenticated":true}';
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(
      server.forEach((request) async {
        requests.add(request);
        request.response
          ..statusCode = statusCode
          ..write(responseBody);
        await request.response.close();
      }),
    );
  });

  tearDown(() async {
    await server.close(force: true);
    await storageDirectory.delete(recursive: true);
  });

  AyniSdk sdk() => AyniSdk(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storageDirectory,
  );

  Future<File> seedInventory(AyniSdk client) async {
    expect(await client.sync(), SyncStatus.updated);
    return File(
      '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
    );
  }

  test(
    'posts its private credential and reports updated then up to date',
    () async {
      final client = sdk();

      expect(await client.sync(), SyncStatus.updated);
      expect(await client.sync(), SyncStatus.upToDate);

      expect(requests, hasLength(2));
      for (final request in requests) {
        expect(request.method, 'POST');
        expect(request.uri.path, '/sdk/sync');
        expect(
          request.headers.value(HttpHeaders.authorizationHeader),
          'Bearer ayni_sk_test',
        );
      }
    },
  );

  test('keeps the local inventory when offline', () async {
    final client = sdk();
    final inventory = await seedInventory(client);
    final before = await inventory.readAsString();
    await server.close(force: true);

    expect(await client.sync(), SyncStatus.offline);
    expect(await inventory.readAsString(), before);
  });

  test('keeps the local inventory after invalid server responses', () async {
    final client = sdk();
    final inventory = await seedInventory(client);
    final before = await inventory.readAsString();

    statusCode = HttpStatus.internalServerError;
    expect(await client.sync(), SyncStatus.error);
    expect(await inventory.readAsString(), before);

    statusCode = HttpStatus.ok;
    responseBody = 'not json';
    expect(await client.sync(), SyncStatus.error);
    expect(await inventory.readAsString(), before);
  });
}
