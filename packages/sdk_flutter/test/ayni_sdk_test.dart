import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

import '../lib/src/sdk_internal.dart';

void main() {
  late Directory storageDirectory;
  late HttpServer server;
  late int statusCode;
  int? workflowStatusCode;
  late String responseBody;
  late String workflowResponseBody;
  Uri? redirectUrl;
  Duration? responseDelay;
  final requests = <HttpRequest>[];

  // Two files per download: the downloader streams the definition into its
  // own `.part` attempt file (reported as `temporaryDefinition` and validated
  // there), and only a valid definition is renamed to the installed path
  // below. The installed path comes from the production builder, not a
  // re-implemented base64Url encoding.
  File installedDefinitionFile(String versionId) =>
      installedWorkflowDefinitionFile(storageDirectory, versionId);

  setUp(() async {
    requests.clear();
    storageDirectory = await Directory.systemTemp.createTemp('ayni-sdk-test-');
    statusCode = HttpStatus.ok;
    workflowStatusCode = null;
    responseBody = _manifest(workflowVersion: '1.0.0');
    workflowResponseBody = _validWorkflowDefinition();
    redirectUrl = null;
    responseDelay = null;
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(
      server.forEach((request) async {
        requests.add(request);
        if (responseDelay != null) await Future<void>.delayed(responseDelay!);
        try {
          final isWorkflow = request.uri.path.startsWith(
            '/sdk/workflow-versions/',
          );
          request.response.statusCode = isWorkflow
              ? (workflowStatusCode ?? statusCode)
              : statusCode;
          if (redirectUrl != null) {
            request.response.headers.set(
              HttpHeaders.locationHeader,
              redirectUrl!.toString(),
            );
          }
          request.response.write(
            isWorkflow ? workflowResponseBody : responseBody,
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
    void Function(String message)? onProgress,
    void Function(WorkflowVersionDownloadResult result)? onWorkflowDownload,
  }) => AyniSdk(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storageDirectory,
    syncTimeout: timeout ?? const Duration(seconds: 30),
    allowInsecureLoopback: true,
    onBeforeInventoryPersist: onBeforeInventoryPersist,
    onProgress: onProgress,
    onWorkflowDownload: onWorkflowDownload,
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
    'installs the validated workflow, commits it, and skips its download',
    () async {
      final messages = <String>[];
      final downloads = <WorkflowVersionDownloadResult>[];
      final client = sdk(
        onProgress: messages.add,
        onWorkflowDownload: downloads.add,
      );

      final updated = await client.sync();
      final retried = await client.sync();
      expect(updated.status, SyncStatus.updated);
      expect(retried.status, SyncStatus.upToDate);
      expect(updated.resources.map((resource) => resource.status), [
        SyncResourceStatus.updated,
        SyncResourceStatus.updated,
      ]);
      expect(retried.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.upToDate,
      ]);

      expect(messages, ['Descargando workflow Clasificar hoja…']);
      expect(downloads.single.status, WorkflowVersionDownloadStatus.downloaded);
      expect(
        await File(downloads.single.temporaryDefinition!).exists(),
        isFalse,
      );
      expect(
        await installedDefinitionFile('workflow-version-1.0.0').readAsString(),
        workflowResponseBody,
      );

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

      expect(requests.map((request) => request.uri.path), [
        '/sdk/sync',
        '/sdk/workflow-versions/workflow-version-1.0.0',
        '/sdk/sync',
      ]);
    },
  );

  test('marks only new or changed resources as updated', () async {
    final client = sdk();
    await client.sync();
    responseBody = _manifest(workflowVersion: '2.0.0');

    final result = await client.sync();

    expect(result.status, SyncStatus.updated);
    expect(result.resources.map((resource) => resource.status), [
      SyncResourceStatus.upToDate,
      SyncResourceStatus.updated,
    ]);
    expect(result.resources.last.resourceVersionId, 'workflow-version-2.0.0');
  });

  test(
    'keeps a valid workflow when its remote model dependency is invalid',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      final before = await inventory.readAsString();
      responseBody = jsonEncode({
        'workflows': [
          {
            'workflowId': 'workflow-1',
            'workflowVersionId': 'workflow-version-2.0.0',
            'name': 'Clasificar hoja',
            'version': '2.0.0',
            'modelVersionIds': ['model-version-2'],
          },
        ],
        'models': [
          {
            'modelVersionId': 'model-version-2',
            'version': '1.0.0',
            'sha256': 'invalid',
          },
        ],
      });

      final result = await client.sync();

      expect(result.status, SyncStatus.upToDate);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.invalidRemoteResource,
        SyncResourceStatus.invalidRemoteResource,
      ]);
      expect(await inventory.readAsString(), before);
    },
  );

  test(
    'does not download a workflow rejected by the inventory comparison',
    () async {
      responseBody = jsonEncode({
        'workflows': [
          {
            'workflowId': 'workflow-1',
            'workflowVersionId': 'workflow-version-1.0.0',
            'name': 'Clasificar hoja',
            'version': '1.0.0',
            'modelVersionIds': ['missing-model-version'],
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
      final downloads = <WorkflowVersionDownloadResult>[];
      final client = sdk(onWorkflowDownload: downloads.add);

      final result = await client.sync();

      expect(result.status, SyncStatus.updated);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.updated,
        SyncResourceStatus.invalidRemoteResource,
      ]);
      expect(downloads, isEmpty);
      expect(requests.single.uri.path, '/sdk/sync');
    },
  );

  test(
    'keeps a valid local resource when its remote update is invalid',
    () async {
      final inventory = File(
        '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
      );
      await inventory.writeAsString(_manifest(workflowVersion: '1.0.0'));
      final before = await inventory.readAsString();
      final client = sdk();
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
        SyncResourceStatus.invalidRemoteResource,
        SyncResourceStatus.upToDate,
      ]);
      expect(
        result.resources.first.message,
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

  test(
    'keeps the last valid workflow when a new version fails validation',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      responseBody = _manifest(workflowVersion: '2.0.0');
      workflowResponseBody = _cyclicWorkflowDefinition();
      final downloads = <WorkflowVersionDownloadResult>[];
      final rejectingClient = sdk(onWorkflowDownload: downloads.add);

      final result = await rejectingClient.sync();

      // Only the workflow 2.0.0 was a candidate change, validation rejected
      // it, and nothing was installed: the sync reports `upToDate`.
      expect(result.status, SyncStatus.upToDate);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.invalidWorkflow,
      ]);
      final rejected = result.resources.last;
      expect(rejected.resourceVersionId, 'workflow-version-2.0.0');
      expect(rejected.version, '2.0.0');
      expect(
        rejected.message,
        'La actualización de Clasificar hoja no es compatible. '
        'Se mantuvo la última versión válida.',
      );
      expect(rejected.message, isNot(contains('condition-1')));
      expect(jsonDecode(await inventory.readAsString())['workflows'], [
        {
          'workflowId': 'workflow-1',
          'workflowVersionId': 'workflow-version-1.0.0',
          'name': 'Clasificar hoja',
          'version': '1.0.0',
          'modelVersionIds': ['model-version-1'],
        },
      ]);
      expect(
        await File(downloads.single.temporaryDefinition!).exists(),
        isFalse,
      );
      expect(
        await installedDefinitionFile('workflow-version-1.0.0').exists(),
        isTrue,
      );
      expect(
        await installedDefinitionFile('workflow-version-2.0.0').exists(),
        isFalse,
      );

      await rejectingClient.sync();
      expect(downloads, hasLength(2));
    },
  );

  test(
    'commits other resources when a never-installed workflow fails validation',
    () async {
      workflowResponseBody = _unknownNodeTypeWorkflowDefinition();

      final result = await sdk().sync();

      expect(result.status, SyncStatus.updated);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.updated,
        SyncResourceStatus.invalidWorkflow,
      ]);
      // Nothing was previously installed for this workflow, so the rejection
      // says so instead of claiming a valid version was kept.
      expect(
        result.resources.last.message,
        'La actualización de Clasificar hoja no es compatible. '
        'No se instaló ninguna versión.',
      );
      final inventory = await File(
        '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
      ).readAsString();
      expect(jsonDecode(inventory), {
        'workflows': [],
        'models': [
          {
            'modelVersionId': 'model-version-1',
            'version': '1.0.0',
            'sha256': 'a' * 64,
          },
        ],
      });
      expect(
        await installedDefinitionFile('workflow-version-1.0.0').exists(),
        isFalse,
      );
      final leftovers = await storageDirectory
          .list(recursive: true)
          .where((entry) => entry is File && entry.path.endsWith('.part'))
          .toList();
      expect(leftovers, isEmpty);
    },
  );

  test(
    'keeps the local inventory when a new workflow becomes unavailable',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      final before = await inventory.readAsString();
      responseBody = _manifest(workflowVersion: '2.0.0');
      final downloads = <WorkflowVersionDownloadResult>[];
      workflowStatusCode = HttpStatus.notFound;

      final unavailableClient = sdk(onWorkflowDownload: downloads.add);

      expect((await unavailableClient.sync()).status, SyncStatus.error);
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
    // The definition promoted this run is removed with the uncommitted
    // inventory; the previously installed one stays.
    expect(
      await installedDefinitionFile('workflow-version-2.0.0').exists(),
      isFalse,
    );
    expect(
      await installedDefinitionFile('workflow-version-1.0.0').exists(),
      isTrue,
    );
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

String _validWorkflowDefinition() => jsonEncode({
  'nodes': [
    {
      'id': 'input-1',
      'type': 'input.image',
      'outputs': {'imagen': 'image'},
    },
    {
      'id': 'model-1',
      'type': 'model.tflite',
      'modelVersionId': 'model-version-1',
      'modelName': 'Clasificador',
      'version': '1.0.0',
      'inputs': {
        'image': {
          'type': 'image',
          'width': 224,
          'height': 224,
          'channels': 3,
          'normalization': 'zero_to_one',
        },
      },
      'outputs': {
        'result': {
          'type': 'classification',
          'labels': ['perro', 'gato'],
        },
      },
    },
    {
      'id': 'output-1',
      'type': 'output',
      'name': 'Resultado',
      'sourceNodeId': 'model-1',
      'sourcePort': 'result',
      'resultType': 'classification',
    },
  ],
  'connections': [
    {
      'sourceNodeId': 'input-1',
      'sourcePort': 'imagen',
      'targetNodeId': 'model-1',
      'targetPort': 'image',
    },
  ],
});

String _cyclicWorkflowDefinition() => jsonEncode({
  'nodes': [
    {
      'id': 'condition-1',
      'type': 'condition',
      'sourceNodeId': 'condition-1',
      'label': 'perro',
      'operator': 'gte',
      'threshold': 0.8,
      'branches': {'true': 'Verdadero', 'false': 'Falso'},
    },
  ],
  'connections': [],
});

String _unknownNodeTypeWorkflowDefinition() => jsonEncode({
  'nodes': [
    {'id': 'capture-1', 'type': 'dataset.capture'},
  ],
  'connections': [],
});

class _RecordingHttpClient implements HttpClient {
  _RecordingHttpClient(this._delegate);

  final HttpClient _delegate;
  String Function(Uri uri)? recordedFindProxy;

  @override
  Future<HttpClientRequest> postUrl(Uri url) => _delegate.postUrl(url);

  @override
  Future<HttpClientRequest> getUrl(Uri url) => _delegate.getUrl(url);

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
