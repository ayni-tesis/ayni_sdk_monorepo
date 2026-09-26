import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
  late Directory storageDirectory;
  late HttpServer server;
  late int statusCode;
  int? workflowStatusCode;
  late String responseBody;
  Uri? redirectUrl;
  Duration? responseDelay;
  final requests = <HttpRequest>[];

  setUp(() async {
    requests.clear();
    storageDirectory = await Directory.systemTemp.createTemp('ayni-sdk-test-');
    statusCode = HttpStatus.ok;
    workflowStatusCode = null;
    responseBody =
        '{"workflows":[{"id":"workflow-1"}],"models":[{"id":"model-1"}]}';
    redirectUrl = null;
    responseDelay = null;
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(
      server.forEach((request) async {
        requests.add(request);
        if (responseDelay != null) await Future<void>.delayed(responseDelay!);
        try {
          request.response.statusCode =
              request.uri.path.startsWith('/sdk/workflow-versions/')
              ? (workflowStatusCode ?? statusCode)
              : statusCode;
          if (redirectUrl != null) {
            request.response.headers.set(
              HttpHeaders.locationHeader,
              redirectUrl!.toString(),
            );
          }
          request.response.write(
            request.uri.path.startsWith('/sdk/workflow-versions/')
                ? '{"nodes":[],"connections":[]}'
                : responseBody,
          );
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

      final inventory = await File(
        '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
      ).readAsString();
      expect(jsonDecode(inventory), {
        'workflows': [
          {'id': 'workflow-1'},
        ],
        'models': [
          {'id': 'model-1'},
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

  test('keeps the local inventory when offline', () async {
    final client = sdk();
    final inventory = await seedInventory(client);
    final before = await inventory.readAsString();
    await server.close(force: true);

    expect(await client.sync(), SyncStatus.offline);
    expect(await inventory.readAsString(), before);
  });

  test(
    'downloads a new workflow version during sync and exposes its progress',
    () async {
      responseBody = '{"workflows":[{"workflowVersionId":"workflow-version-1","name":"Clasificar hoja"}],"models":[]}';
      final messages = <String>[];
      final downloads = <WorkflowVersionDownloadResult>[];
      final client = AyniSdk(
        serverUrl: Uri.parse(
          'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
        ),
        credential: 'ayni_sk_test',
        storageDirectory: storageDirectory,
        allowInsecureLoopback: true,
        onProgress: messages.add,
        onWorkflowDownload: downloads.add,
      );

      expect(await client.sync(), SyncStatus.updated);
      expect(messages, ['Descargando workflow Clasificar hoja…']);
      expect(downloads.single.status, WorkflowVersionDownloadStatus.downloaded);
      expect(
        await File(downloads.single.temporaryDefinition!).exists(),
        isTrue,
      );
      expect(requests.map((request) => request.uri.path), [
        '/sdk/sync',
        '/sdk/workflow-versions/workflow-version-1',
      ]);
    },
  );

  test(
    'keeps the local inventory when a new workflow becomes unavailable',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      final before = await inventory.readAsString();
      responseBody = '{"workflows":[{"workflowVersionId":"workflow-version-1","name":"Clasificar hoja"}],"models":[]}';
      final downloads = <WorkflowVersionDownloadResult>[];
      workflowStatusCode = HttpStatus.notFound;

      final unavailableClient = AyniSdk(
        serverUrl: Uri.parse(
          'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
        ),
        credential: 'ayni_sk_test',
        storageDirectory: storageDirectory,
        allowInsecureLoopback: true,
        onWorkflowDownload: downloads.add,
      );

      expect(await unavailableClient.sync(), SyncStatus.error);
      expect(
        downloads.single.status,
        WorkflowVersionDownloadStatus.workflowUnavailable,
      );
      expect(await inventory.readAsString(), before);
    },
  );

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

  test(
    'does not replace local inventory with an authentication acknowledgement',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      final before = await inventory.readAsString();
      responseBody = '{"authenticated":true}';

      expect(await client.sync(), SyncStatus.upToDate);
      expect(await inventory.readAsString(), before);
    },
  );

  test('rejects malformed inventory fields despite authentication', () async {
    final client = sdk();
    final inventory = await seedInventory(client);
    final before = await inventory.readAsString();
    responseBody = '{"authenticated":true,"workflows":"invalid","models":[]}';

    expect(await client.sync(), SyncStatus.error);
    expect(await inventory.readAsString(), before);
  });

  test('rejects insecure remote URLs before sending the credential', () async {
    final client = AyniSdk(
      serverUrl: Uri.parse('http://example.invalid'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
    );

    expect(await client.sync(), SyncStatus.error);
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

    expect(await client.sync(), SyncStatus.error);
    expect(requests, isEmpty);
  });

  test('does not follow redirects with the credential', () async {
    redirectUrl = Uri.parse('http://example.invalid/sdk/sync');
    statusCode = HttpStatus.found;

    expect(await sdk().sync(), SyncStatus.error);
    expect(requests, hasLength(1));
    expect(
      requests.single.headers.value(HttpHeaders.authorizationHeader),
      'Bearer ayni_sk_test',
    );
  });

  test('uses a direct connection for permitted loopback HTTP', () async {
    final recordingClient = _RecordingHttpClient(HttpClient());

    await HttpOverrides.runZoned(
      () async => expect(await sdk().sync(), SyncStatus.updated),
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
        await sdk(timeout: const Duration(milliseconds: 10)).sync(),
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
      responseBody =
          '{"workflows":[{"id":"workflow-2"}],"models":[{"id":"model-2"}]}';
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

      expect(await sync, SyncStatus.error);
      releasePersistence.complete();
      await Future<void>.delayed(Duration.zero);
      expect(await inventory.readAsString(), before);
    },
  );

  test('keeps inventory when the persistence callback fails', () async {
    final inventory = await seedInventory(sdk());
    final before = await inventory.readAsString();
    responseBody =
        '{"workflows":[{"id":"workflow-2"}],"models":[{"id":"model-2"}]}';

    expect(
      await sdk(
        onBeforeInventoryPersist: () =>
            Future<void>.error(StateError('persistence callback failed')),
      ).sync(),
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
      expect(await client.sync(), SyncStatus.error);
    } finally {
      await invalidServer.close();
    }
  });
}

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
