import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
  late Directory storageDirectory;
  late HttpServer server;
  late int statusCode;
  late String responseBody;
  Uri? redirectUrl;
  Duration? responseDelay;
  final requests = <HttpRequest>[];

  setUp(() async {
    requests.clear();
    storageDirectory = await Directory.systemTemp.createTemp('ayni-sdk-test-');
    statusCode = HttpStatus.ok;
    responseBody = _manifest(workflowVersion: '1.0.0');
    redirectUrl = null;
    responseDelay = null;
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(
      server.forEach((request) async {
        requests.add(request);
        if (responseDelay != null) await Future<void>.delayed(responseDelay!);
        try {
          request.response.statusCode = statusCode;
          if (redirectUrl != null) {
            request.response.headers.set(
              HttpHeaders.locationHeader,
              redirectUrl!.toString(),
            );
          }
          request.response.write(responseBody);
          await request.response.close();
        } on HttpException {
          // The timed-out client has already closed its response stream.
        }
      }),
    );
  });

  tearDown(() async {
    await server.close(force: true);
    await storageDirectory.delete(recursive: true);
  });

  AyniSdk sdk({
    Duration? timeout,
    Future<void> Function()? onBeforeInventoryPersist,
  }) => AyniSdk(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storageDirectory,
    syncTimeout: timeout ?? const Duration(seconds: 30),
    allowInsecureLoopback: true,
    onBeforeInventoryPersist: onBeforeInventoryPersist,
  );

  Future<SyncStatus> syncStatus(AyniSdk client) async =>
      (await client.sync()).status;

  Future<File> seedInventory(AyniSdk client) async {
    expect(await syncStatus(client), SyncStatus.updated);
    return File(
      '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
    );
  }

  test(
    'posts its private credential and reports updated then up to date',
    () async {
      final client = sdk();

      final updated = await client.sync();
      final upToDate = await client.sync();
      expect(updated.status, SyncStatus.updated);
      expect(upToDate.status, SyncStatus.upToDate);
      expect(updated.resources.map((resource) => resource.status), [
        SyncResourceStatus.updated,
        SyncResourceStatus.updated,
      ]);
      expect(upToDate.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.upToDate,
      ]);

      final inventory = await File(
        '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
      ).readAsString();
      expect(jsonDecode(inventory), {
        'workflows': [
          {
            'workflowId': 'workflow-1',
            'workflowVersionId': 'workflow-version-1.0.0',
            'name': 'Clasificar hoja',
            'version': '1.0.0',
            'modelVersionIds': ['model-version-1'],
          },
        ],
        'models': [
          {
            'modelVersionId': 'model-version-1',
            'version': '1.0.0',
            'sha256':
                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
        ],
      });

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

  test('marks only new or changed resources as updated', () async {
    final client = sdk();
    await client.sync();
    responseBody = _manifest(workflowVersion: '2.0.0');

    final result = await client.sync();

    expect(result.status, SyncStatus.updated);
    expect(result.resources.map((resource) => resource.status), [
      SyncResourceStatus.updated,
      SyncResourceStatus.upToDate,
    ]);
    expect(result.resources.first.resourceVersionId, 'workflow-version-2.0.0');
  });

  test(
    'keeps a valid local resource when its remote update is invalid',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      final before = await inventory.readAsString();
      responseBody = jsonEncode({
        'workflows': [
          {
            'workflowId': 'workflow-1',
            'workflowVersionId': 'workflow-version-1.0.0',
            'name': 'Clasificar hoja',
            'version': '1.0.0',
            'modelVersionIds': ['model-version-1'],
          },
        ],
        'models': [
          {'modelVersionId': 'model-version-1', 'version': '2.0.0'},
        ],
      });

      final result = await client.sync();

      expect(result.status, SyncStatus.upToDate);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.invalidRemoteResource,
      ]);
      expect(
        result.resources.last.message,
        'Se mantuvo la versión local porque la actualización no es válida.',
      );
      expect(await inventory.readAsString(), before);
    },
  );

  test('keeps the local inventory when offline', () async {
    final client = sdk();
    final inventory = await seedInventory(client);
    final before = await inventory.readAsString();
    await server.close(force: true);

    expect(await syncStatus(client), SyncStatus.offline);
    expect(await inventory.readAsString(), before);
  });

  test('keeps the local inventory after invalid server responses', () async {
    final client = sdk();
    final inventory = await seedInventory(client);
    final before = await inventory.readAsString();

    statusCode = HttpStatus.internalServerError;
    expect(await syncStatus(client), SyncStatus.error);
    expect(await inventory.readAsString(), before);

    statusCode = HttpStatus.ok;
    responseBody = 'not json';
    expect(await syncStatus(client), SyncStatus.error);
    expect(await inventory.readAsString(), before);
  });

  test(
    'does not replace local inventory with an authentication acknowledgement',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      final before = await inventory.readAsString();
      responseBody = '{"authenticated":true}';

      expect(await syncStatus(client), SyncStatus.upToDate);
      expect(await inventory.readAsString(), before);
    },
  );

  test('rejects malformed inventory fields despite authentication', () async {
    final client = sdk();
    final inventory = await seedInventory(client);
    final before = await inventory.readAsString();
    responseBody = '{"authenticated":true,"workflows":"invalid","models":[]}';

    expect(await syncStatus(client), SyncStatus.error);
    expect(await inventory.readAsString(), before);
  });

  test('rejects insecure remote URLs before sending the credential', () async {
    final client = AyniSdk(
      serverUrl: Uri.parse('http://example.invalid'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
    );

    expect(await syncStatus(client), SyncStatus.error);
    expect(requests, isEmpty);
  });

  test('allows loopback HTTP only when explicitly enabled', () async {
    final client = AyniSdk(
      serverUrl: Uri.parse(
        'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
      ),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
    );

    expect(await syncStatus(client), SyncStatus.error);
    expect(requests, isEmpty);
  });

  test('does not follow redirects with the credential', () async {
    redirectUrl = Uri.parse('http://example.invalid/sdk/sync');
    statusCode = HttpStatus.found;

    expect(await syncStatus(sdk()), SyncStatus.error);
    expect(requests, hasLength(1));
    expect(
      requests.single.headers.value(HttpHeaders.authorizationHeader),
      'Bearer ayni_sk_test',
    );
  });

  test('uses a direct connection for permitted loopback HTTP', () async {
    final recordingClient = _RecordingHttpClient(HttpClient());

    await HttpOverrides.runZoned(
      () async => expect(await syncStatus(sdk()), SyncStatus.updated),
      createHttpClient: (_) => recordingClient,
    );

    expect(recordingClient.recordedFindProxy, isNotNull);
    expect(
      recordingClient.recordedFindProxy!(
        Uri.parse(
          'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
        ),
      ),
      'DIRECT',
    );
  });

  test(
    'returns an error when the complete sync exceeds its deadline',
    () async {
      responseDelay = const Duration(milliseconds: 100);

      expect(
        await syncStatus(sdk(timeout: const Duration(milliseconds: 10))),
        SyncStatus.error,
      );
      await Future<void>.delayed(responseDelay!);
    },
  );

  test(
    'keeps inventory when persistence is pending past the deadline',
    () async {
      final inventory = await seedInventory(sdk());
      final before = await inventory.readAsString();
      responseBody = _manifest(workflowVersion: '2.0.0');
      final startedPersisting = Completer<void>();
      final releasePersistence = Completer<void>();
      final client = sdk(
        timeout: const Duration(seconds: 1),
        onBeforeInventoryPersist: () {
          startedPersisting.complete();
          return releasePersistence.future;
        },
      );
      final sync = client.sync();
      await startedPersisting.future.timeout(const Duration(seconds: 2));

      expect((await sync).status, SyncStatus.error);
      releasePersistence.complete();
      await Future<void>.delayed(Duration.zero);
      expect(await inventory.readAsString(), before);
    },
  );

  test('keeps inventory when the persistence callback fails', () async {
    final inventory = await seedInventory(sdk());
    final before = await inventory.readAsString();
    responseBody = _manifest(workflowVersion: '2.0.0');

    expect(
      await sdk(
        onBeforeInventoryPersist: () =>
            Future<void>.error(StateError('persistence callback failed')),
      ).sync().then((result) => result.status),
      SyncStatus.error,
    );
    expect(await inventory.readAsString(), before);
    expect(
      await storageDirectory
          .list()
          .where((entry) => entry.path.endsWith('.tmp'))
          .isEmpty,
      isTrue,
    );
  });

  test('reports an invalid HTTP response as an error', () async {
    final invalidServer = await ServerSocket.bind(
      InternetAddress.loopbackIPv4,
      0,
    );
    unawaited(
      invalidServer.first.then((socket) async {
        socket.add('not an HTTP response'.codeUnits);
        await socket.close();
      }),
    );
    final client = AyniSdk(
      serverUrl: Uri.parse(
        'http://${InternetAddress.loopbackIPv4.address}:${invalidServer.port}',
      ),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      allowInsecureLoopback: true,
    );

    try {
      expect(await syncStatus(client), SyncStatus.error);
    } finally {
      await invalidServer.close();
    }
  });
}

String _manifest({required String workflowVersion}) => jsonEncode({
  'workflows': [
    {
      'workflowId': 'workflow-1',
      'workflowVersionId': 'workflow-version-$workflowVersion',
      'name': 'Clasificar hoja',
      'version': workflowVersion,
      'modelVersionIds': ['model-version-1'],
    },
  ],
  'models': [
    {
      'modelVersionId': 'model-version-1',
      'version': '1.0.0',
      'sha256': 'a' * 64,
    },
  ],
});

class _RecordingHttpClient implements HttpClient {
  _RecordingHttpClient(this._delegate);

  final HttpClient _delegate;
  String Function(Uri uri)? recordedFindProxy;

  @override
  Future<HttpClientRequest> postUrl(Uri url) => _delegate.postUrl(url);

  @override
  void close({bool force = false}) => _delegate.close(force: force);

  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == const Symbol('findProxy=')) {
      final finder =
          invocation.positionalArguments.single as String Function(Uri);
      recordedFindProxy = finder;
      _delegate.findProxy = finder;
      return null;
    }
    return super.noSuchMethod(invocation);
  }
}
