import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart';
import 'package:ayni_sdk/src/consent_receipt_store.dart';
import 'package:ayni_sdk/src/model_artifact_installer.dart';
import 'package:ayni_sdk/src/sdk_internal.dart';
import 'package:ayni_sdk/src/workflow_version_downloader.dart';
import 'package:test/test.dart';

import 'support/workflow_install.dart';

void main() {
  late Directory storageDirectory;
  late HttpServer server;
  late HttpServer artifactServer;
  late int statusCode;
  int? workflowStatusCode;
  int? modelManifestStatusCode;
  late int consentStatusCode;
  late String telemetryPolicyResponseBody;
  int? telemetryPolicyStatusCode;
  var stallConsentResponse = false;
  late String responseBody;
  late String workflowResponseBody;
  late String modelManifestResponseBody;
  late Map<String, String> modelManifestResponses;
  late List<int> modelArtifactBytes;
  Uri? redirectUrl;
  Duration? responseDelay;
  final requests = <HttpRequest>[];
  final consentBodies = <Map<String, Object?>>[];

  // Two files per download: the downloader streams the definition into its
  // own `.part` attempt file (reported as `temporaryDefinition` and validated
  // there), and only a valid definition is renamed to the installed path
  // below. The installed path comes from the production builder, not a
  // re-implemented base64Url encoding.
  File installedDefinitionFile(String versionId) =>
      installedWorkflowDefinitionFile(storageDirectory, versionId);

  setUp(() async {
    AyniSdk.resetForTesting();
    AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
    requests.clear();
    consentBodies.clear();
    storageDirectory = await Directory.systemTemp.createTemp('ayni-sdk-test-');
    statusCode = HttpStatus.ok;
    workflowStatusCode = null;
    modelManifestStatusCode = null;
    consentStatusCode = HttpStatus.created;
    telemetryPolicyResponseBody = '{"enabled":false,"retentionDays":30}';
    telemetryPolicyStatusCode = null;
    stallConsentResponse = false;
    modelManifestResponses = {};
    responseBody = _manifest(workflowVersion: '1.0.0');
    workflowResponseBody = _validWorkflowDefinition();
    modelArtifactBytes = utf8.encode('tflite-model-artifact-content');
    final artifactSha256 = sha256.convert(modelArtifactBytes).toString();
    redirectUrl = null;
    responseDelay = null;
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    artifactServer = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    modelManifestResponseBody = jsonEncode({
      'modelVersionId': 'model-version-1',
      'version': '1.0.0',
      'sha256': artifactSha256,
      'sizeBytes': modelArtifactBytes.length,
      'downloadUrl':
          'http://${InternetAddress.loopbackIPv4.address}:${artifactServer.port}/model.tflite',
      'downloadUrlExpiresAt': DateTime.now()
          .add(const Duration(hours: 1))
          .toUtc()
          .toIso8601String(),
    });
    unawaited(
      server.forEach((request) async {
        requests.add(request);
        if (responseDelay != null) await Future<void>.delayed(responseDelay!);
        try {
          final isWorkflow = request.uri.path.startsWith(
            '/sdk/workflow-versions/',
          );
          final isModelManifest = request.uri.path.startsWith(
            '/sdk/model-versions/',
          );
          if (request.uri.path == '/sdk/telemetry-policy') {
            request.response.statusCode =
                telemetryPolicyStatusCode ?? statusCode;
            request.response.write(telemetryPolicyResponseBody);
          } else if (request.uri.path == '/sdk/consents') {
            final body =
                jsonDecode(await utf8.decoder.bind(request).join()) as Map;
            consentBodies.add(Map<String, Object?>.from(body));
            request.response.statusCode = consentStatusCode;
            request.response.write(
              jsonEncode({
                'receiptId': body['receiptId'],
                'receivedAt': '2026-09-30T12:01:00.000Z',
              }),
            );
            if (stallConsentResponse) {
              unawaited(
                Future<void>.delayed(const Duration(milliseconds: 500)).then((
                  _,
                ) async {
                  try {
                    await request.response.close();
                  } on HttpException {}
                }),
              );
              return;
            }
          } else if (isWorkflow) {
            request.response.statusCode = workflowStatusCode ?? statusCode;
            request.response.write(workflowResponseBody);
          } else if (isModelManifest) {
            final segments = request.uri.pathSegments;
            final mvId = segments.length >= 3 ? segments[2] : '';
            final body =
                modelManifestResponses[mvId] ?? modelManifestResponseBody;
            final status = modelManifestStatusCode ?? statusCode;
            request.response.statusCode = status;
            // Like apps/server/src/sdk-model-versions.ts, a successful
            // response wraps the manifest: `{ "manifest": { ... } }`.
            request.response.write(
              status >= 200 && status < 300 ? '{"manifest":$body}' : body,
            );
          } else {
            request.response.statusCode = statusCode;
            if (redirectUrl != null) {
              request.response.headers.set(
                HttpHeaders.locationHeader,
                redirectUrl!.toString(),
              );
            }
            request.response.write(responseBody);
          }
          await request.response.close();
        } on HttpException {
          // The timed-out client has already closed its response stream.
        }
      }),
    );
    unawaited(
      artifactServer.forEach((request) async {
        try {
          request.response.statusCode = HttpStatus.ok;
          request.response.headers.set(
            HttpHeaders.contentTypeHeader,
            'application/octet-stream',
          );
          request.response.add(modelArtifactBytes);
          await request.response.close();
        } on HttpException {}
      }),
    );
  });

  tearDown(() async {
    AyniSdk.resetForTesting();
    ConsentReceiptStore.beforeRemoveForTesting = null;
    await server.close(force: true);
    await artifactServer.close(force: true);
    await storageDirectory.delete(recursive: true);
  });

  AyniSdk sdk({
    Duration? timeout,
    Future<void> Function()? onBeforeInventoryPersist,
    Future<void> Function()? onBeforeConsentReceiptRemoval,
    void Function(String message)? onProgress,
    void Function(WorkflowVersionDownloadResult result)? onWorkflowDownload,
  }) => createAyniSdkForTesting(
    serverUrl: Uri.parse(
      'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
    ),
    credential: 'ayni_sk_test',
    storageDirectory: storageDirectory,
    syncTimeout: timeout ?? const Duration(seconds: 30),
    allowInsecureLoopback: true,
    onBeforeInventoryPersist: onBeforeInventoryPersist,
    onBeforeConsentReceiptRemoval: onBeforeConsentReceiptRemoval,
    onProgress: onProgress,
    onWorkflowDownload: onWorkflowDownload,
  );

  Future<SyncStatus> syncStatus(AyniSdk client) async =>
      (await client.sync()).status;

  group('recordConsent', () {
    const subjectId = '550e8400-e29b-41d4-a716-446655440000';

    test('sends a minimal receipt for one explicit purpose', () async {
      final client = sdk();

      final result = await client.recordConsent(
        subjectId: subjectId,
        purpose: ConsentPurpose.modelImprovement,
        decision: ConsentDecision.accepted,
        noticeVersion: '1.0.0',
      );

      expect(result.status, ConsentStatus.synced);
      expect(requests.map((request) => request.uri.path), ['/sdk/consents']);
      expect(
        requests.single.headers.value(HttpHeaders.authorizationHeader),
        'Bearer ayni_sk_test',
      );
      expect(consentBodies.single, {
        'receiptId': isA<String>().having((id) => id.length, 'UUID length', 36),
        'subjectId': subjectId,
        'purpose': 'ayniModelImprovement',
        'decision': 'accepted',
        'noticeVersion': '1.0.0',
        'decidedAt': isA<String>(),
      });
      expect(consentBodies.single, isNot(contains('email')));
    });

    test(
      'queues an offline receipt and sends it before the next sync manifest',
      () async {
        consentStatusCode = HttpStatus.serviceUnavailable;
        final result = await sdk().recordConsent(
          subjectId: subjectId,
          purpose: ConsentPurpose.sdkImprovement,
          decision: ConsentDecision.accepted,
          noticeVersion: '1.0.0',
        );
        expect(result.status, ConsentStatus.pending);
        consentStatusCode = HttpStatus.created;
        requests.clear();

        expect(await syncStatus(sdk()), SyncStatus.updated);
        expect(requests.map((request) => request.uri.path), [
          '/sdk/telemetry-policy',
          '/sdk/consents',
          '/sdk/sync',
          '/sdk/workflow-versions/workflow-version-1.0.0',
          '/sdk/model-versions/model-version-1/manifest',
        ]);
      },
    );

    test(
      'continues required sync while a consent receipt remains pending',
      () async {
        consentStatusCode = HttpStatus.serviceUnavailable;
        final client = sdk();
        await client.recordConsent(
          subjectId: subjectId,
          purpose: ConsentPurpose.modelImprovement,
          decision: ConsentDecision.accepted,
          noticeVersion: '1.0.0',
        );
        requests.clear();

        expect(await syncStatus(client), SyncStatus.updated);
        expect(requests.map((request) => request.uri.path), [
          '/sdk/telemetry-policy',
          '/sdk/consents',
          '/sdk/sync',
          '/sdk/workflow-versions/workflow-version-1.0.0',
          '/sdk/model-versions/model-version-1/manifest',
        ]);
      },
    );

    test('keeps sync available when consent acknowledgement stalls', () async {
      consentStatusCode = HttpStatus.serviceUnavailable;
      await sdk().recordConsent(
        subjectId: subjectId,
        purpose: ConsentPurpose.modelImprovement,
        decision: ConsentDecision.accepted,
        noticeVersion: '1.0.0',
      );
      consentStatusCode = HttpStatus.created;
      stallConsentResponse = true;
      requests.clear();

      expect(
        await syncStatus(sdk(timeout: const Duration(milliseconds: 900))),
        SyncStatus.updated,
      );
      expect(
        requests.map((request) => request.uri.path),
        containsAllInOrder(['/sdk/consents', '/sdk/sync']),
      );
    });

    test(
      'retains serialization until timed-out receipt cleanup completes',
      () async {
        final removeStarted = Completer<void>();
        final releaseRemove = Completer<void>();
        var pauseFirstRemoval = true;
        final client = sdk(
          timeout: const Duration(milliseconds: 100),
          onBeforeConsentReceiptRemoval: () async {
            if (pauseFirstRemoval) {
              pauseFirstRemoval = false;
              removeStarted.complete();
              await releaseRemove.future;
            }
          },
        );
        final first = client.recordConsent(
          subjectId: subjectId,
          purpose: ConsentPurpose.modelImprovement,
          decision: ConsentDecision.accepted,
          noticeVersion: '1.0.0',
        );
        await removeStarted.future.timeout(const Duration(seconds: 2));

        expect((await first).status, ConsentStatus.pending);
        var secondCompleted = false;
        final second = client
            .recordConsent(
              subjectId: subjectId,
              purpose: ConsentPurpose.sdkImprovement,
              decision: ConsentDecision.accepted,
              noticeVersion: '1.0.0',
            )
            .then((result) {
              secondCompleted = true;
              return result;
            });
        await Future<void>.delayed(const Duration(milliseconds: 20));
        expect(secondCompleted, isFalse);
        expect(
          jsonDecode(
            await File(
              '${storageDirectory.path}${Platform.pathSeparator}consent-receipts.json',
            ).readAsString(),
          ),
          hasLength(1),
        );

        releaseRemove.complete();
        expect((await second).status, ConsentStatus.synced);
      },
    );

    test(
      'serializes receipt mutations across SDK instances sharing storage',
      () async {
        consentStatusCode = HttpStatus.serviceUnavailable;
        final first = sdk();
        final second = sdk();

        await Future.wait([
          first.recordConsent(
            subjectId: subjectId,
            purpose: ConsentPurpose.modelImprovement,
            decision: ConsentDecision.accepted,
            noticeVersion: '1.0.0',
          ),
          second.recordConsent(
            subjectId: subjectId,
            purpose: ConsentPurpose.sdkImprovement,
            decision: ConsentDecision.accepted,
            noticeVersion: '1.0.0',
          ),
        ]);

        final receipts =
            jsonDecode(
                  await File(
                    '${storageDirectory.path}${Platform.pathSeparator}consent-receipts.json',
                  ).readAsString(),
                )
                as List;
        expect(receipts, hasLength(2));
      },
    );

    test('records a declined choice as its own purpose decision', () async {
      final result = await sdk().recordConsent(
        subjectId: subjectId,
        purpose: ConsentPurpose.modelImprovement,
        decision: ConsentDecision.declined,
        noticeVersion: '1.0.0',
      );

      expect(result.status, ConsentStatus.synced);
      expect(consentBodies.single['purpose'], 'ayniModelImprovement');
      expect(consentBodies.single['decision'], 'declined');
    });

    test('rejects a direct identifier before sending anything', () async {
      final client = sdk();

      expect(
        () => client.recordConsent(
          subjectId: 'person@example.test',
          purpose: ConsentPurpose.modelImprovement,
          decision: ConsentDecision.accepted,
          noticeVersion: '1.0.0',
        ),
        throwsArgumentError,
      );
      expect(requests, isEmpty);
    });
  });

  Future<File> seedInventory(AyniSdk client) async {
    expect(await syncStatus(client), SyncStatus.updated);
    return File(
      '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
    );
  }

  test(
    'run preflights every cached model before opening an interpreter',
    () async {
      final client = sdk();
      await installWorkflowFiles(
        storageDirectory: storageDirectory,
        inventoryJson: _manifest(workflowVersion: '1.0.0'),
        workflowVersionId: 'workflow-version-1.0.0',
        definitionJson: _validWorkflowDefinition(),
      );
      await expectLater(
        client.run(
          'workflow-1',
          Uint8List.fromList(img.encodePng(img.Image(width: 1, height: 1))),
        ),
        throwsA(
          isA<WorkflowError>().having(
            (e) => e.category,
            'category',
            WorkflowErrorCategory.modelNotAvailable,
          ),
        ),
      );
    },
  );

  test(
    'run rejects installed workflow with unsupported schema version before model inference (US-098)',
    () async {
      final client = sdk();
      await installWorkflowFiles(
        storageDirectory: storageDirectory,
        inventoryJson: _manifest(workflowVersion: '1.0.0'),
        workflowVersionId: 'workflow-version-1.0.0',
        definitionJson: _unsupportedSchemaWorkflowDefinition(
          schemaVersion: '3',
        ),
      );
      await expectLater(
        client.run(
          'workflow-1',
          Uint8List.fromList(img.encodePng(img.Image(width: 1, height: 1))),
        ),
        throwsA(
          isA<WorkflowError>().having(
            (e) => e.category,
            'category',
            WorkflowErrorCategory.invalidWorkflow,
          ),
        ),
      );
    },
  );

  test('attributes TFLite load failures to the model node', () async {
    final client = sdk();
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _manifest(workflowVersion: '1.0.0'),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: _validWorkflowDefinition(),
    );
    final modelDirectory = Directory(
      '${storageDirectory.path}/model-version-1',
    );
    await modelDirectory.create();
    final artifact = File('${modelDirectory.path}/model-version-1.tflite');
    final bytes = utf8.encode('not a tflite model');
    await artifact.writeAsBytes(bytes);
    await File('${modelDirectory.path}/model-version-1.json').writeAsString(
      jsonEncode({
        'modelId': 'model-version-1',
        'modelVersionId': 'model-version-1',
        'sha256': sha256.convert(bytes).toString(),
      }),
    );
    await expectLater(
      client.run(
        'workflow-1',
        Uint8List.fromList(img.encodePng(img.Image(width: 1, height: 1))),
      ),
      throwsA(
        isA<WorkflowError>().having(
          (e) => (e.category, e.nodeId, e.modelVersionId),
          'model error context',
          (WorkflowErrorCategory.runtimeError, 'model-1', 'model-version-1'),
        ),
      ),
    );
  });

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

      expect(messages, [
        'Descargando workflow Clasificar hoja…',
        'Descargando modelos para Clasificar hoja…',
      ]);
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
        '/sdk/telemetry-policy',
        '/sdk/sync',
        '/sdk/workflow-versions/workflow-version-1.0.0',
        '/sdk/model-versions/model-version-1/manifest',
        '/sdk/telemetry-policy',
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

      expect(result.status, SyncStatus.error);
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

      expect(result.status, SyncStatus.error);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.updated,
        SyncResourceStatus.invalidRemoteResource,
      ]);
      expect(downloads, isEmpty);
      expect(requests.last.uri.path, '/sdk/sync');
    },
  );

  test(
    'rejects model hash conflicts when an installed workflow record changes',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      final local = jsonDecode(await inventory.readAsString()) as Map;
      (local['models'] as List).add({
        'modelVersionId': 'model-version-2',
        'version': '1.0.0',
        'sha256': 'c' * 64,
      });
      await inventory.writeAsString(jsonEncode(local));
      final before = await inventory.readAsString();
      final requestsBeforeSync = requests.length;

      Future<SyncResult> syncWithWorkflow({
        required String version,
        required List<String> modelVersionIds,
      }) async {
        responseBody = jsonEncode({
          'workflows': [
            {
              'workflowId': 'workflow-1',
              'workflowVersionId': 'workflow-version-1.0.0',
              'name': 'Clasificar hoja',
              'version': version,
              'modelVersionIds': modelVersionIds,
            },
          ],
          'models': [
            {
              'modelVersionId': 'model-version-1',
              'version': '1.0.0',
              'sha256': 'a' * 64,
            },
            {
              'modelVersionId': 'model-version-2',
              'version': '1.0.0',
              'sha256': 'd' * 64,
            },
          ],
        });
        return client.sync();
      }

      final dependencyChange = await syncWithWorkflow(
        version: '1.0.0',
        modelVersionIds: ['model-version-1', 'model-version-2'],
      );

      expect(dependencyChange.status, SyncStatus.error);
      expect(dependencyChange.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.invalidRemoteResource,
        SyncResourceStatus.invalidRemoteResource,
      ]);
      expect(
        dependencyChange.resources[1].message,
        'La actualización no coincide con la versión instalada; '
        'se conservará la copia local.',
      );
      expect(await inventory.readAsString(), before);

      final versionChange = await syncWithWorkflow(
        version: '2.0.0',
        modelVersionIds: ['model-version-1', 'model-version-2'],
      );
      expect(versionChange.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.invalidRemoteResource,
        SyncResourceStatus.invalidRemoteResource,
      ]);
      expect(await inventory.readAsString(), before);
      expect(requests.length, requestsBeforeSync + 4);
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

      expect(result.status, SyncStatus.error);
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
    'returns unsupportedWorkflowVersion and keeps previous version when remote workflow has unsupported schema version (US-098)',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      responseBody = _manifest(workflowVersion: '2.0.0');
      workflowResponseBody = _unsupportedSchemaWorkflowDefinition(
        schemaVersion: '3',
      );
      final downloads = <WorkflowVersionDownloadResult>[];
      final rejectingClient = sdk(onWorkflowDownload: downloads.add);

      final result = await rejectingClient.sync();

      // Only the workflow 2.0.0 was a candidate change, validation rejected
      // it, and nothing was installed: the sync reports `upToDate`.
      expect(result.status, SyncStatus.upToDate);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.unsupportedWorkflowVersion,
      ]);
      final rejected = result.resources.last;
      expect(rejected.resourceVersionId, 'workflow-version-2.0.0');
      expect(rejected.version, '2.0.0');
      expect(
        rejected.message,
        'Este workflow requiere una versión más reciente del SDK. '
        'Se conservará la última versión compatible.',
      );
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
    },
  );

  test(
    'commits other resources when a never-installed workflow has unsupported schema version (US-098)',
    () async {
      workflowResponseBody = _unsupportedSchemaWorkflowDefinition(
        schemaVersion: '3',
      );

      final result = await sdk().sync();

      expect(result.status, SyncStatus.updated);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.updated,
        SyncResourceStatus.unsupportedWorkflowVersion,
      ]);
      expect(
        result.resources.last.message,
        'Este workflow requiere una versión más reciente del SDK. '
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

      final result = await unavailableClient.sync();
      expect(result.status, SyncStatus.error);
      final failedWorkflow = result.resources.singleWhere(
        (resource) => resource.type == SyncResourceType.workflow,
      );
      expect(failedWorkflow.status, SyncResourceStatus.workflowUnavailable);
      expect(failedWorkflow.resourceVersionId, 'workflow-version-2.0.0');
      expect(failedWorkflow.previousVersionRetained, isTrue);
      expect(
        failedWorkflow.message,
        'El workflow ya no está disponible. Se mantuvo la versión anterior.',
      );
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
    expect(requests.map((request) => request.uri.path), [
      '/sdk/telemetry-policy',
      '/sdk/sync',
    ]);
    expect(
      requests.every(
        (request) =>
            request.headers.value(HttpHeaders.authorizationHeader) ==
            'Bearer ayni_sk_test',
      ),
      isTrue,
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
      final retryReachedPersistence = Completer<void>();
      var firstPersistence = true;
      final client = sdk(
        timeout: const Duration(seconds: 1),
        onBeforeInventoryPersist: () async {
          if (firstPersistence) {
            firstPersistence = false;
            startedPersisting.complete();
            await releasePersistence.future;
          } else {
            retryReachedPersistence.complete();
          }
        },
      );
      final sync = client.sync();
      await startedPersisting.future.timeout(const Duration(seconds: 2));

      expect((await sync).status, SyncStatus.error);
      final retry = client.sync();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(retryReachedPersistence.isCompleted, isFalse);
      releasePersistence.complete();
      expect((await retry).status, SyncStatus.updated);
      expect(retryReachedPersistence.isCompleted, isTrue);
      expect(await inventory.readAsString(), isNot(before));
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
    invalidServer.listen((socket) async {
      socket.add('not an HTTP response'.codeUnits);
      await socket.close();
    });
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

  test(
    'keeps the previous version when promotion fails due to storage error',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      responseBody = _manifest(workflowVersion: '2.0.0');

      // Place a non-empty directory at the target path so that the
      // atomic rename (promote) fails and cannot recover by deleting
      // and retrying.
      final installedPath = installedDefinitionFile(
        'workflow-version-2.0.0',
      ).path;
      final blocker = Directory(installedPath);
      await blocker.create(recursive: true);
      await File(
        '${blocker.path}${Platform.pathSeparator}blocker.txt',
      ).writeAsString('blocked');

      final result = await client.sync();

      expect(result.status, SyncStatus.error);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.installationFailed,
      ]);
      final failed = result.resources.last;
      expect(failed.resourceVersionId, 'workflow-version-2.0.0');
      expect(failed.version, '2.0.0');
      expect(failed.name, 'Clasificar hoja');
      expect(failed.previousVersionRetained, isTrue);
      expect(
        failed.message,
        'No se pudo guardar la actualización. Se mantuvo la versión anterior.',
      );
      expect(
        await inventory.readAsString(),
        contains('workflow-version-1.0.0'),
      );
      expect(
        await installedDefinitionFile('workflow-version-1.0.0').exists(),
        isTrue,
      );
      // The blocker directory is not a valid workflow definition file.
      expect(
        installedDefinitionFile('workflow-version-2.0.0').existsSync(),
        isFalse,
      );
      // No .part files should remain.
      final leftovers = await storageDirectory
          .list(recursive: true)
          .where((entry) => entry is File && entry.path.endsWith('.part'))
          .toList();
      expect(leftovers, isEmpty);
    },
  );

  test(
    'reports installation failure without previous version when storage fails',
    () async {
      // Seed no prior inventory.  Place a blocker at the only workflow's
      // installed path so that promotion fails for a never-installed workflow.
      final installedPath = installedDefinitionFile(
        'workflow-version-1.0.0',
      ).path;
      final blocker = Directory(installedPath);
      await blocker.create(recursive: true);
      await File(
        '${blocker.path}${Platform.pathSeparator}blocker.txt',
      ).writeAsString('blocked');

      final result = await sdk().sync();

      expect(result.status, SyncStatus.error);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.installationFailed,
      ]);
      final failed = result.resources.last;
      expect(failed.previousVersionRetained, isFalse);
      expect(
        failed.message,
        'No se pudo guardar la actualización. No se instaló ninguna versión.',
      );
      final leftovers = await storageDirectory
          .list(recursive: true)
          .where((entry) => entry is File && entry.path.endsWith('.part'))
          .toList();
      expect(leftovers, isEmpty);
    },
  );

  test('installs a validated workflow as an atomic unit', () async {
    final client = sdk();
    await seedInventory(client);

    // The installed definition file must not exist before the second sync.
    expect(
      await installedDefinitionFile('workflow-version-1.0.0').exists(),
      isTrue,
    );

    // A new version is available.
    responseBody = _manifest(workflowVersion: '2.0.0');
    final result = await client.sync();

    expect(result.status, SyncStatus.updated);
    expect(result.resources.map((r) => r.status), [
      SyncResourceStatus.upToDate,
      SyncResourceStatus.updated,
    ]);

    // The new definition is fully installed (not partially available).
    expect(
      await installedDefinitionFile('workflow-version-2.0.0').exists(),
      isTrue,
    );
    expect(
      await installedDefinitionFile('workflow-version-2.0.0').readAsString(),
      workflowResponseBody,
    );

    // The previous version is still present.
    expect(
      await installedDefinitionFile('workflow-version-1.0.0').exists(),
      isTrue,
    );

    // No .part files remain after a successful install.
    final leftovers = await storageDirectory
        .list(recursive: true)
        .where((entry) => entry is File && entry.path.endsWith('.part'))
        .toList();
    expect(leftovers, isEmpty);
  });

  // ── US-044: Synchronize model dependencies of a workflow ─────────────

  test(
    'downloads and installs model dependencies for a new workflow',
    () async {
      final messages = <String>[];
      final client = sdk(onProgress: messages.add);

      final result = await client.sync();

      expect(result.status, SyncStatus.updated);
      expect(result.resources.map((r) => r.status), [
        SyncResourceStatus.updated,
        SyncResourceStatus.updated,
      ]);
      expect(messages, contains('Descargando modelos para Clasificar hoja…'));

      final installer = ModelArtifactInstaller(
        storageDirectory: storageDirectory,
      );
      expect(
        await installer.isVersionAvailable(
          modelId: 'model-version-1',
          modelVersionId: 'model-version-1',
        ),
        isTrue,
      );

      expect(
        await installedDefinitionFile('workflow-version-1.0.0').exists(),
        isTrue,
      );
    },
  );

  test(
    'skips model download when the model is already available locally',
    () async {
      final client = sdk();
      await client.sync();

      final manifestRequests = requests
          .where((r) => r.uri.path.startsWith('/sdk/model-versions/'))
          .length;
      expect(manifestRequests, 1);

      final secondResult = await client.sync();
      expect(secondResult.status, SyncStatus.upToDate);

      final secondManifestRequests = requests
          .where((r) => r.uri.path.startsWith('/sdk/model-versions/'))
          .length;
      expect(secondManifestRequests, manifestRequests);
    },
  );

  test('rejects a workflow when its model dependency download fails', () async {
    modelManifestStatusCode = HttpStatus.internalServerError;
    final client = sdk();

    final result = await client.sync();

    expect(result.status, SyncStatus.error);
    expect(result.resources, hasLength(1));
    final workflow = result.resources.single;
    expect(workflow.type, SyncResourceType.workflow);
    expect(workflow.status, SyncResourceStatus.dependencyFailed);
    expect(workflow.resourceVersionId, 'workflow-version-1.0.0');
    expect(workflow.name, 'Clasificar hoja');
    expect(
      workflow.message,
      'No se pudo preparar Clasificar hoja: model-version-1.',
    );
    expect(
      await installedDefinitionFile('workflow-version-1.0.0').exists(),
      isFalse,
    );
  });

  test(
    'rejects a workflow when the manifest response has no manifest',
    () async {
      modelManifestResponseBody = 'null';
      final client = sdk();

      final result = await client.sync();

      expect(result.status, SyncStatus.error);
      final workflow = result.resources.last;
      expect(workflow.type, SyncResourceType.workflow);
      expect(workflow.status, SyncResourceStatus.dependencyFailed);
      expect(
        workflow.message,
        'No se pudo preparar Clasificar hoja: model-version-1.',
      );
      expect(
        await installedDefinitionFile('workflow-version-1.0.0').exists(),
        isFalse,
      );
    },
  );

  test('rejects a workflow when model integrity verification fails', () async {
    modelManifestResponseBody = jsonEncode({
      'modelVersionId': 'model-version-1',
      'version': '1.0.0',
      'sha256': 'bad' * 22,
      'sizeBytes': modelArtifactBytes.length,
      'downloadUrl':
          'http://${InternetAddress.loopbackIPv4.address}:${artifactServer.port}/model.tflite',
      'downloadUrlExpiresAt': DateTime.now()
          .add(const Duration(hours: 1))
          .toUtc()
          .toIso8601String(),
    });
    final client = sdk();

    final result = await client.sync();

    expect(result.status, SyncStatus.error);
    final workflow = result.resources.last;
    expect(workflow.status, SyncResourceStatus.dependencyFailed);
    expect(
      workflow.message,
      'No se pudo preparar Clasificar hoja: model-version-1.',
    );
    expect(
      await installedDefinitionFile('workflow-version-1.0.0').exists(),
      isFalse,
    );
  });

  test(
    'rejects a workflow when model artifact download returns wrong size',
    () async {
      modelManifestResponseBody = jsonEncode({
        'modelVersionId': 'model-version-1',
        'version': '1.0.0',
        'sha256': sha256.convert(modelArtifactBytes).toString(),
        'sizeBytes': modelArtifactBytes.length + 100,
        'downloadUrl':
            'http://${InternetAddress.loopbackIPv4.address}:${artifactServer.port}/model.tflite',
        'downloadUrlExpiresAt': DateTime.now()
            .add(const Duration(hours: 1))
            .toUtc()
            .toIso8601String(),
      });
      final client = sdk();

      final result = await client.sync();

      expect(result.status, SyncStatus.error);
      final workflow = result.resources.last;
      expect(workflow.status, SyncResourceStatus.dependencyFailed);
    },
  );

  test(
    'rolls back newly installed model metadata when a later dependency fails',
    () async {
      final client = sdk();
      await seedInventory(client);
      final staleArtifact = File(
        '${storageDirectory.path}${Platform.pathSeparator}'
        'model-version-2${Platform.pathSeparator}model-version-2.tflite',
      );
      await staleArtifact.parent.create(recursive: true);
      await staleArtifact.writeAsString('stale artifact');

      workflowResponseBody = _validWorkflowDefinition().replaceAll(
        'model-version-1',
        'model-version-2',
      );
      responseBody = jsonEncode({
        'workflows': [
          {
            'workflowId': 'workflow-1',
            'workflowVersionId': 'workflow-version-2.0.0',
            'name': 'Clasificar hoja',
            'version': '2.0.0',
            'modelVersionIds': ['model-version-2', 'model-version-3'],
          },
        ],
        'models': [
          {
            'modelVersionId': 'model-version-1',
            'version': '1.0.0',
            'sha256': 'a' * 64,
          },
          {
            'modelVersionId': 'model-version-2',
            'version': '1.0.0',
            'sha256': sha256.convert(modelArtifactBytes).toString(),
          },
          {
            'modelVersionId': 'model-version-3',
            'version': '1.0.0',
            'sha256': 'c' * 64,
          },
        ],
      });
      modelManifestResponses['model-version-2'] = jsonEncode({
        'modelVersionId': 'model-version-2',
        'version': '1.0.0',
        'sha256': sha256.convert(modelArtifactBytes).toString(),
        'sizeBytes': modelArtifactBytes.length,
        'downloadUrl':
            'http://${InternetAddress.loopbackIPv4.address}:${artifactServer.port}/model.tflite',
        'downloadUrlExpiresAt': DateTime.now()
            .add(const Duration(hours: 1))
            .toUtc()
            .toIso8601String(),
      });
      modelManifestResponses['model-version-3'] = 'null';

      final result = await client.sync();

      expect(result.status, SyncStatus.error);
      expect(result.resources.map((r) => r.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.dependencyFailed,
      ]);
      expect(result.resources.map((resource) => resource.resourceVersionId), [
        'model-version-1',
        'workflow-version-2.0.0',
      ]);
      final failed = result.resources.last;
      expect(failed.previousVersionRetained, isTrue);
      expect(
        failed.message,
        'No se pudo preparar Clasificar hoja: model-version-3. '
        'Se mantuvo la última versión válida.',
      );
      expect(
        await installedDefinitionFile('workflow-version-1.0.0').exists(),
        isTrue,
      );
      expect(
        await installedDefinitionFile('workflow-version-2.0.0').exists(),
        isFalse,
      );
      expect(
        await ModelArtifactInstaller(
          storageDirectory: storageDirectory,
        ).isVersionAvailable(
          modelId: 'model-version-2',
          modelVersionId: 'model-version-2',
        ),
        isFalse,
      );
      expect(await staleArtifact.exists(), isFalse);
      final inventory =
          jsonDecode(
                await File(
                  '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
                ).readAsString(),
              )
              as Map;
      final installedModelIds = (inventory['models'] as List)
          .map((model) => model['modelVersionId'])
          .toList();
      expect(installedModelIds, contains('model-version-1'));
      expect(installedModelIds, isNot(contains('model-version-2')));
      expect(installedModelIds, isNot(contains('model-version-3')));
    },
  );

  test(
    'restores prior model metadata and result when its reinstall fails',
    () async {
      final client = sdk();
      final inventory = await seedInventory(client);
      await Directory(
        '${storageDirectory.path}${Platform.pathSeparator}model-version-1',
      ).delete(recursive: true);
      responseBody = _manifest(workflowVersion: '2.0.0');
      modelManifestStatusCode = HttpStatus.internalServerError;

      final result = await client.sync();

      expect(result.status, SyncStatus.error);
      expect(result.resources.map((resource) => resource.status), [
        SyncResourceStatus.upToDate,
        SyncResourceStatus.dependencyFailed,
      ]);
      expect(result.resources.first.resourceVersionId, 'model-version-1');
      expect(result.resources.first.version, '1.0.0');
      expect(await inventory.readAsString(), contains('model-version-1'));
    },
  );

  test('persists a model installed by a later workflow after rollback', () async {
    final client = sdk();
    await seedInventory(client);
    workflowResponseBody = _validWorkflowDefinition().replaceAll(
      'model-version-1',
      'model-version-2',
    );
    responseBody = jsonEncode({
      'workflows': [
        {
          'workflowId': 'workflow-1',
          'workflowVersionId': 'workflow-version-2.0.0',
          'name': 'Clasificar hoja',
          'version': '2.0.0',
          'modelVersionIds': ['model-version-2', 'model-version-3'],
        },
        {
          'workflowId': 'workflow-2',
          'workflowVersionId': 'workflow-version-3.0.0',
          'name': 'Segundo workflow',
          'version': '1.0.0',
          'modelVersionIds': ['model-version-2'],
        },
      ],
      'models': [
        {
          'modelVersionId': 'model-version-2',
          'version': '1.0.0',
          'sha256': sha256.convert(modelArtifactBytes).toString(),
        },
        {
          'modelVersionId': 'model-version-3',
          'version': '1.0.0',
          'sha256': 'c' * 64,
        },
      ],
    });
    modelManifestResponses['model-version-2'] = jsonEncode({
      'modelVersionId': 'model-version-2',
      'version': '1.0.0',
      'sha256': sha256.convert(modelArtifactBytes).toString(),
      'sizeBytes': modelArtifactBytes.length,
      'downloadUrl':
          'http://${InternetAddress.loopbackIPv4.address}:${artifactServer.port}/model.tflite',
      'downloadUrlExpiresAt': DateTime.now()
          .add(const Duration(hours: 1))
          .toUtc()
          .toIso8601String(),
    });
    modelManifestResponses['model-version-3'] = 'null';

    final result = await client.sync();

    expect(result.status, SyncStatus.error);
    expect(result.resources.map((resource) => resource.resourceVersionId), [
      'model-version-2',
      'workflow-version-2.0.0',
      'workflow-version-3.0.0',
    ]);
    expect(result.resources.map((resource) => resource.status), [
      SyncResourceStatus.updated,
      SyncResourceStatus.dependencyFailed,
      SyncResourceStatus.updated,
    ]);
    final inventory =
        jsonDecode(
              await File(
                '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
              ).readAsString(),
            )
            as Map;
    final modelIds = (inventory['models'] as List)
        .map((model) => model['modelVersionId'])
        .toList();
    expect(modelIds, contains('model-version-2'));
    expect(modelIds, isNot(contains('model-version-3')));
    expect(
      await installedDefinitionFile('workflow-version-3.0.0').exists(),
      isTrue,
    );
  });

  test(
    'keeps valid local models when a dependency fails for a different workflow',
    () async {
      final client = sdk();
      await client.sync();

      final installer = ModelArtifactInstaller(
        storageDirectory: storageDirectory,
      );
      expect(
        await installer.isVersionAvailable(
          modelId: 'model-version-1',
          modelVersionId: 'model-version-1',
        ),
        isTrue,
      );

      responseBody = jsonEncode({
        'workflows': [
          {
            'workflowId': 'workflow-1',
            'workflowVersionId': 'workflow-version-1.0.0',
            'name': 'Clasificar hoja',
            'version': '1.0.0',
            'modelVersionIds': ['model-version-1'],
          },
          {
            'workflowId': 'workflow-2',
            'workflowVersionId': 'workflow-version-2.0.0',
            'name': 'Nuevo workflow',
            'version': '2.0.0',
            'modelVersionIds': ['model-version-2'],
          },
        ],
        'models': [
          {
            'modelVersionId': 'model-version-1',
            'version': '1.0.0',
            'sha256': 'a' * 64,
          },
          {
            'modelVersionId': 'model-version-2',
            'version': '1.0.0',
            'sha256': 'b' * 64,
          },
        ],
      });
      modelManifestStatusCode = HttpStatus.internalServerError;

      await client.sync();

      expect(
        await installer.isVersionAvailable(
          modelId: 'model-version-1',
          modelVersionId: 'model-version-1',
        ),
        isTrue,
      );
    },
  );

  test('cleans up model files when inventory persistence fails', () async {
    // Two models install successfully before inventory persistence fails.
    responseBody = jsonEncode({
      'workflows': [
        {
          'workflowId': 'workflow-1',
          'workflowVersionId': 'workflow-version-1.0.0',
          'name': 'Clasificar hoja',
          'version': '1.0.0',
          'modelVersionIds': ['model-version-1', 'model-version-2'],
        },
      ],
      'models': [
        {
          'modelVersionId': 'model-version-1',
          'version': '1.0.0',
          'sha256': sha256.convert(modelArtifactBytes).toString(),
        },
        {
          'modelVersionId': 'model-version-2',
          'version': '1.0.0',
          'sha256': sha256.convert(modelArtifactBytes).toString(),
        },
      ],
    });
    // model-version-2 uses the same valid test artifact as model-version-1.
    modelManifestResponses['model-version-2'] = jsonEncode({
      'modelVersionId': 'model-version-2',
      'version': '1.0.0',
      'sha256': sha256.convert(modelArtifactBytes).toString(),
      'sizeBytes': modelArtifactBytes.length,
      'downloadUrl':
          'http://${InternetAddress.loopbackIPv4.address}:${artifactServer.port}/model.tflite',
      'downloadUrlExpiresAt': DateTime.now()
          .add(const Duration(hours: 1))
          .toUtc()
          .toIso8601String(),
    });

    bool? modelAvailableAtPersist;
    final client = sdk(
      onBeforeInventoryPersist: () async {
        modelAvailableAtPersist =
            await ModelArtifactInstaller(
              storageDirectory: storageDirectory,
            ).isVersionAvailable(
              modelId: 'model-version-1',
              modelVersionId: 'model-version-1',
            );
        throw StateError('persistence failed');
      },
    );

    final result = await client.sync();

    expect(result.status, SyncStatus.error);
    expect(modelAvailableAtPersist, isTrue);

    // Both newly installed model versions are removed when persistence fails.
    final modelFiles = await storageDirectory
        .list(recursive: true)
        .where(
          (entry) =>
              entry is File &&
              (entry.path.contains('model-version-1') ||
                  entry.path.contains('model-version-2')) &&
              (entry.path.endsWith('.tflite') || entry.path.endsWith('.json')),
        )
        .toList();
    expect(modelFiles, isEmpty);
  });

  group('US-049: SDK initialization', () {
    test(
      'initializes successfully with valid HTTPS configuration (sync access)',
      () {
        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret_123',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.status, equals(InitializationStatus.ready));
        expect(result.message, equals('SDK listo.'));
        expect(result.isSuccess, isTrue);
        expect(result.isReady, isTrue);
        expect(result.sdk, isNotNull);
        expect(result.sdk, same(AyniSdk.instance));
        expect(AyniSdk.isInitialized, isTrue);
      },
    );

    test(
      'initializes successfully with initializeAsync as Future API',
      () async {
        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret_123',
          storageDirectory: storageDirectory,
        );

        final future = AyniSdk.initializeAsync(config);
        expect(future, isA<Future<AyniInitializationResult>>());

        final result = await future;
        expect(result.status, equals(InitializationStatus.ready));
        expect(result.message, equals('SDK listo.'));
        expect(result.isSuccess, isTrue);
        expect(result.isReady, isTrue);
        expect(result.sdk, isNotNull);
        expect(AyniSdk.isInitialized, isTrue);
      },
    );

    test('initialization result is a plain value', () {
      final config = AyniConfig(
        serverUrl: Uri.parse('https://api.ayni.dev'),
        credential: 'ayni_sk_valid_secret_123',
        storageDirectory: storageDirectory,
      );

      final result = AyniSdk.initialize(config);
      expect(result, isA<AyniInitializationResult>());
      expect(result, isNot(isA<Future>()));
      expect(result.status, equals(InitializationStatus.ready));
      expect(result.isSuccess, isTrue);
      expect(result.message, equals('SDK listo.'));
      expect(result.sdk, isNotNull);
    });

    test('allows loopback HTTP when allowInsecureLoopback is true', () {
      for (final host in ['localhost', '127.0.0.1', '[::1]']) {
        final config = AyniConfig(
          serverUrl: Uri.parse('http://$host:8080'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
          allowInsecureLoopback: true,
        );

        final result = AyniSdk.initialize(config);

        expect(
          result.status,
          equals(InitializationStatus.ready),
          reason: 'Failed for loopback host: $host',
        );
        expect(result.isSuccess, isTrue);
        expect(AyniSdk.isInitialized, isTrue);
        AyniSdk.resetForTesting();
        AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
      }
    });

    test('initialized instance can perform sync and operations', () async {
      final config = AyniConfig(
        serverUrl: Uri.parse(
          'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
        ),
        credential: 'ayni_sk_test_credential',
        storageDirectory: storageDirectory,
        allowInsecureLoopback: true,
      );

      final initResult = AyniSdk.initialize(config);
      expect(initResult.isSuccess, isTrue);

      final syncResult = await AyniSdk.instance.sync();
      expect(syncResult.status, equals(SyncStatus.updated));
      expect(requests, isNotEmpty);
    });

    test('rejects empty or whitespace credential', () {
      for (final emptyCredential in ['', '   ', '\t\n ']) {
        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: emptyCredential,
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(
          result.status,
          equals(InitializationStatus.incompleteConfiguration),
        );
        expect(
          result.message,
          equals('Revisa la configuración del SDK antes de continuar.'),
        );
        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
      }
    });

    test('rejects empty or whitespace storageDirectory path', () {
      for (final emptyPath in ['', '   ', '\t']) {
        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: Directory(emptyPath),
        );

        final result = AyniSdk.initialize(config);

        expect(
          result.status,
          equals(InitializationStatus.incompleteConfiguration),
        );
        expect(
          result.message,
          equals('Revisa la configuración del SDK antes de continuar.'),
        );
        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
      }
    });

    test('rejects insecure remote HTTP URL', () {
      final config = AyniConfig(
        serverUrl: Uri.parse('http://example.com/api'),
        credential: 'ayni_sk_valid_secret',
        storageDirectory: storageDirectory,
        allowInsecureLoopback: false,
      );

      final result = AyniSdk.initialize(config);

      expect(
        result.status,
        equals(InitializationStatus.incompleteConfiguration),
      );
      expect(
        result.message,
        equals('Revisa la configuración del SDK antes de continuar.'),
      );
      expect(result.isSuccess, isFalse);
      expect(result.sdk, isNull);
      expect(AyniSdk.isInitialized, isFalse);
    });

    test('rejects loopback HTTP when allowInsecureLoopback is false', () {
      for (final host in ['localhost', '127.0.0.1', '[::1]']) {
        final config = AyniConfig(
          serverUrl: Uri.parse('http://$host:8080'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
          allowInsecureLoopback: false,
        );

        final result = AyniSdk.initialize(config);

        expect(
          result.status,
          equals(InitializationStatus.incompleteConfiguration),
        );
        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
      }
    });

    test('rejects remote HTTP even when allowInsecureLoopback is true', () {
      final config = AyniConfig(
        serverUrl: Uri.parse('http://api.ayni.dev'),
        credential: 'ayni_sk_valid_secret',
        storageDirectory: storageDirectory,
        allowInsecureLoopback: true,
      );

      final result = AyniSdk.initialize(config);

      expect(
        result.status,
        equals(InitializationStatus.incompleteConfiguration),
      );
      expect(result.isSuccess, isFalse);
      expect(result.sdk, isNull);
      expect(AyniSdk.isInitialized, isFalse);
    });

    test('rejects serverUrl with empty host or unsupported scheme', () {
      for (final invalidUrl in [
        Uri.parse('https://'),
        Uri.parse('ftp://localhost:21'),
        Uri.parse('ws://localhost:8080'),
        Uri.parse('file:///tmp/path'),
      ]) {
        final config = AyniConfig(
          serverUrl: invalidUrl,
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
          allowInsecureLoopback: true,
        );

        final result = AyniSdk.initialize(config);

        expect(
          result.status,
          equals(InitializationStatus.incompleteConfiguration),
          reason: 'Failed for url: $invalidUrl',
        );
        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
      }
    });

    test('rejects non-positive syncTimeout', () {
      for (final timeout in [const Duration(seconds: -1), Duration.zero]) {
        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
          syncTimeout: timeout,
        );

        final result = AyniSdk.initialize(config);

        expect(
          result.status,
          equals(InitializationStatus.incompleteConfiguration),
          reason: 'Failed to reject syncTimeout: $timeout',
        );
        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
      }
    });

    test(
      'AyniConfig.isValid validates required fields and endpoint security',
      () {
        final validConfig = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
        );
        expect(validConfig.isValid, isTrue);

        expect(
          AyniConfig(
            serverUrl: Uri.parse('https://api.ayni.dev'),
            credential: '   ',
            storageDirectory: storageDirectory,
          ).isValid,
          isFalse,
        );
        expect(
          AyniConfig(
            serverUrl: Uri.parse('https://api.ayni.dev'),
            credential: 'ayni_sk_valid_secret',
            storageDirectory: Directory('   '),
          ).isValid,
          isFalse,
        );
        expect(
          AyniConfig(
            serverUrl: Uri.parse('http://insecure.dev'),
            credential: 'ayni_sk_valid_secret',
            storageDirectory: storageDirectory,
            allowInsecureLoopback: false,
          ).isValid,
          isFalse,
        );
        expect(
          AyniConfig(
            serverUrl: Uri.parse('http://localhost:8080'),
            credential: 'ayni_sk_valid_secret',
            storageDirectory: storageDirectory,
            allowInsecureLoopback: true,
          ).isValid,
          isTrue,
        );
        expect(
          AyniConfig(
            serverUrl: Uri.parse('https://api.ayni.dev'),
            credential: 'ayni_sk_valid_secret',
            storageDirectory: storageDirectory,
            syncTimeout: const Duration(seconds: -1),
          ).isValid,
          isFalse,
        );
        expect(
          AyniConfig(
            serverUrl: Uri.parse('https://api.ayni.dev'),
            credential: 'ayni_sk_valid_secret',
            storageDirectory: storageDirectory,
            syncTimeout: Duration.zero,
          ).isValid,
          isFalse,
        );
      },
    );

    test('does not expose credential in AyniConfig.toString()', () {
      const secret = 'ayni_sk_super_secret_never_leak_this';
      final config = AyniConfig(
        serverUrl: Uri.parse('https://api.ayni.dev'),
        credential: secret,
        storageDirectory: storageDirectory,
      );

      final asString = config.toString();

      expect(asString, isNot(contains(secret)));
      expect(asString, contains('[REDACTED]'));
    });

    test(
      'does not expose credential in AyniInitializationResult.toString() or message',
      () {
        const secret = 'ayni_sk_super_secret_never_leak_this';
        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: secret,
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.toString(), isNot(contains(secret)));
        expect(result.message, isNot(contains(secret)));

        final failedConfig = AyniConfig(
          serverUrl: Uri.parse('http://insecure.com'),
          credential: secret,
          storageDirectory: storageDirectory,
        );
        final failedResult = AyniSdk.initialize(failedConfig);

        expect(failedResult.toString(), isNot(contains(secret)));
        expect(failedResult.message, isNot(contains(secret)));
      },
    );

    test(
      'throws StateError when accessing AyniSdk.instance before initialization',
      () {
        expect(AyniSdk.isInitialized, isFalse);
        expect(
          () => AyniSdk.instance,
          throwsA(
            isA<StateError>().having(
              (e) => e.message,
              'message',
              contains('no está inicializado'),
            ),
          ),
        );
      },
    );

    test(
      'failed initialization does not leave a partially operative SDK instance',
      () {
        final invalidConfig = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: '',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(invalidConfig);

        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
        expect(() => AyniSdk.instance, throwsA(isA<StateError>()));
      },
    );

    test('failed re-initialization resets prior operative instance', () {
      final validConfig = AyniConfig(
        serverUrl: Uri.parse('https://api.ayni.dev'),
        credential: 'ayni_sk_valid_secret',
        storageDirectory: storageDirectory,
      );
      final firstResult = AyniSdk.initialize(validConfig);
      expect(firstResult.isSuccess, isTrue);
      expect(AyniSdk.isInitialized, isTrue);

      final invalidConfig = AyniConfig(
        serverUrl: Uri.parse('https://api.ayni.dev'),
        credential: '',
        storageDirectory: storageDirectory,
      );
      final secondResult = AyniSdk.initialize(invalidConfig);

      expect(secondResult.isSuccess, isFalse);
      expect(secondResult.sdk, isNull);
      expect(AyniSdk.isInitialized, isFalse);
      expect(() => AyniSdk.instance, throwsA(isA<StateError>()));
    });

    test('resetForTesting clears the instance', () {
      final validConfig = AyniConfig(
        serverUrl: Uri.parse('https://api.ayni.dev'),
        credential: 'ayni_sk_valid_secret',
        storageDirectory: storageDirectory,
      );
      AyniSdk.initialize(validConfig);
      expect(AyniSdk.isInitialized, isTrue);

      AyniSdk.resetForTesting();

      expect(AyniSdk.isInitialized, isFalse);
      expect(() => AyniSdk.instance, throwsA(isA<StateError>()));
    });

    test(
      'rejects Android devices below minimum required version API 26 (US-092)',
      () {
        AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 25);

        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.status, equals(InitializationStatus.unsupportedPlatform));
        expect(
          result.message,
          equals(
            'Este dispositivo Android no cumple el requisito mínimo del SDK.',
          ),
        );
        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
        expect(() => AyniSdk.instance, throwsA(isA<StateError>()));
      },
    );

    test(
      'accepts compatible Android version (API 26+) and initializes successfully (US-092)',
      () {
        AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);

        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.status, equals(InitializationStatus.ready));
        expect(result.message, equals('SDK listo.'));
        expect(result.isSuccess, isTrue);
        expect(result.sdk, isNotNull);
        expect(AyniSdk.isInitialized, isTrue);
        expect(AyniSdk.instance, isNotNull);
      },
    );

    test(
      'rejects unsupported non-mobile platform with generic message (US-091/092)',
      () {
        AyniSdk.setPlatformForTesting(
          isAndroid: false,
          isIos: false,
          isWeb: true,
        );

        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.status, equals(InitializationStatus.unsupportedPlatform));
        expect(
          result.message,
          equals('Esta plataforma no es compatible con ayni_sdk.'),
        );
        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
      },
    );

    test(
      'rejects Android with unreadable or null SDK version as unsupported (US-092)',
      () {
        AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: null);

        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.status, equals(InitializationStatus.unsupportedPlatform));
        expect(
          result.message,
          equals(
            'Este dispositivo Android no cumple el requisito mínimo del SDK.',
          ),
        );
        expect(result.isSuccess, isFalse);
      },
    );

    test(
      'AyniSdk.run rejects unsupported Android versions before model inference (US-092)',
      () async {
        final directSdk = sdk();

        AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 25);

        expect(
          () => directSdk.run('workflow-1', Uint8List(0)),
          throwsA(
            isA<UnsupportedError>().having(
              (e) => e.message,
              'message',
              equals(
                'Este dispositivo Android no cumple el requisito mínimo del SDK.',
              ),
            ),
          ),
        );
      },
    );

    test(
      'AyniSdk.run rejects non-mobile unsupported platform before execution',
      () async {
        final directSdk = sdk();

        AyniSdk.setPlatformForTesting(
          isAndroid: false,
          isIos: false,
          isWeb: true,
        );

        expect(
          () => directSdk.run('workflow-1', Uint8List(0)),
          throwsA(
            isA<UnsupportedError>().having(
              (e) => e.message,
              'message',
              equals('Esta plataforma no es compatible con ayni_sdk.'),
            ),
          ),
        );
      },
    );

    test(
      'rejects iOS devices below minimum required version iOS 11 (US-093)',
      () {
        AyniSdk.setPlatformForTesting(isIos: true, iosMajorVersion: 10);

        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.status, equals(InitializationStatus.unsupportedPlatform));
        expect(
          result.message,
          equals('Este dispositivo iOS no cumple el requisito mínimo del SDK.'),
        );
        expect(result.isSuccess, isFalse);
        expect(result.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
        expect(() => AyniSdk.instance, throwsA(isA<StateError>()));
      },
    );

    test(
      'accepts compatible iOS version (iOS 11+) and initializes successfully (US-093)',
      () {
        AyniSdk.setPlatformForTesting(isIos: true, iosMajorVersion: 11);

        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.status, equals(InitializationStatus.ready));
        expect(result.message, equals('SDK listo.'));
        expect(result.isSuccess, isTrue);
        expect(result.sdk, isNotNull);
        expect(AyniSdk.isInitialized, isTrue);
        expect(AyniSdk.instance, isNotNull);
      },
    );

    test(
      'rejects iOS with unreadable or null version as unsupported (US-093)',
      () {
        AyniSdk.setPlatformForTesting(isIos: true, iosMajorVersion: null);

        final config = AyniConfig(
          serverUrl: Uri.parse('https://api.ayni.dev'),
          credential: 'ayni_sk_valid_secret',
          storageDirectory: storageDirectory,
        );

        final result = AyniSdk.initialize(config);

        expect(result.status, equals(InitializationStatus.unsupportedPlatform));
        expect(
          result.message,
          equals('Este dispositivo iOS no cumple el requisito mínimo del SDK.'),
        );
        expect(result.isSuccess, isFalse);
      },
    );

    test(
      'AyniSdk.run rejects unsupported iOS versions before model inference (US-093)',
      () async {
        final directSdk = sdk();

        AyniSdk.setPlatformForTesting(isIos: true, iosMajorVersion: 10);

        expect(
          () => directSdk.run('workflow-1', Uint8List(0)),
          throwsA(
            isA<UnsupportedError>().having(
              (e) => e.message,
              'message',
              equals(
                'Este dispositivo iOS no cumple el requisito mínimo del SDK.',
              ),
            ),
          ),
        );
      },
    );

    test('does not initiate network operations during initialization', () {
      final config = AyniConfig(
        serverUrl: Uri.parse(
          'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
        ),
        credential: 'ayni_sk_valid_secret',
        storageDirectory: storageDirectory,
        allowInsecureLoopback: true,
      );

      final result = AyniSdk.initialize(config);

      expect(result.isSuccess, isTrue);
      expect(requests, isEmpty);
    });

    test(
      'does not initiate network operations during failed initialization',
      () {
        final invalidConfig = AyniConfig(
          serverUrl: Uri.parse(
            'http://${InternetAddress.loopbackIPv4.address}:${server.port}',
          ),
          credential: '',
          storageDirectory: storageDirectory,
          allowInsecureLoopback: true,
        );

        final result = AyniSdk.initialize(invalidConfig);

        expect(result.isSuccess, isFalse);
        expect(requests, isEmpty);
      },
    );

    test('supports typedef aliases AyniSdkConfig and InitializationResult', () {
      AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
      final AyniSdkConfig config = AyniConfig(
        serverUrl: Uri.parse('https://api.ayni.dev'),
        credential: 'ayni_sk_valid_secret',
        storageDirectory: storageDirectory,
      );
      final InitializationResult result = AyniSdk.initialize(config);
      expect(result.isSuccess, isTrue);
    });

    test('AyniSdk declares supported workflow schema versions (US-098)', () {
      expect(AyniSdk.supportedWorkflowSchemaVersions, equals({'1', '2'}));
    });
  });

  group('US-101: installation identity', () {
    AyniConfig configFor(Directory directory) => AyniConfig(
      serverUrl: Uri.parse('https://api.ayni.dev'),
      credential: 'ayni_sk_valid_secret_123',
      storageDirectory: directory,
    );

    test('initialization creates a persisted UUID v4', () {
      final result = AyniSdk.initialize(configFor(storageDirectory));
      final idFile = File('${storageDirectory.path}/installation-id');

      expect(result.status, equals(InitializationStatus.ready));
      expect(idFile.existsSync(), isTrue);
      expect(
        idFile.readAsStringSync(),
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
    });

    test('initialization reuses the installation UUID after reset', () {
      final idFile = File('${storageDirectory.path}/installation-id');
      AyniSdk.initialize(configFor(storageDirectory));
      final firstId = idFile.readAsStringSync();

      AyniSdk.resetForTesting();
      AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
      final result = AyniSdk.initialize(configFor(storageDirectory));

      expect(result.status, equals(InitializationStatus.ready));
      expect(idFile.readAsStringSync(), equals(firstId));
    });

    test('initialization replaces a corrupt installation UUID', () {
      final idFile = File('${storageDirectory.path}/installation-id')
        ..writeAsStringSync('not-a-uuid');

      final result = AyniSdk.initialize(configFor(storageDirectory));

      expect(result.status, equals(InitializationStatus.ready));
      expect(idFile.readAsStringSync(), isNot(equals('not-a-uuid')));
      expect(
        idFile.readAsStringSync(),
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
    });

    test(
      'initialization fails and resets the singleton when storage is a file',
      () {
        final storageBlocker = File('${storageDirectory.path}/storage-blocker')
          ..writeAsStringSync('not a directory');

        final result = AyniSdk.initialize(
          configFor(Directory(storageBlocker.path)),
        );

        expect(result.status, equals(InitializationStatus.error));
        expect(AyniSdk.isInitialized, isFalse);
        expect(() => AyniSdk.instance, throwsStateError);
      },
    );
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
  'schemaVersion': '1',
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
  'schemaVersion': '1',
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
  'schemaVersion': '1',
  'nodes': [
    {'id': 'capture-1', 'type': 'dataset.capture'},
  ],
  'connections': [],
});

String _unsupportedSchemaWorkflowDefinition({String schemaVersion = '2'}) =>
    jsonEncode({
      'schemaVersion': schemaVersion,
      'nodes': [
        {
          'id': 'input-1',
          'type': 'input.image',
          'outputs': {'imagen': 'image'},
        },
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
