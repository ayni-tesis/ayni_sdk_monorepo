// US-066: a workflow that reaches `dataset.capture` creates local evidence
// without delaying the result, and only with the app's consent. US-067: the
// evidence keeps its image optimized with the collection policy's limits.
// US-068: the evidence waits in a local queue, which a full device skips.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/collection_policy_store.dart';
import 'package:ayni_sdk/src/evidence_image_optimizer.dart';
import 'package:ayni_sdk/src/evidence_store.dart';
import 'package:ayni_sdk/src/telemetry_policy_store.dart';
import 'package:ayni_sdk/src/trace_outbox_store.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:image/image.dart' as img;
import 'package:test/test.dart';

import 'support/workflow_install.dart';

const _optimizing = 'Optimizando';
const _prepared = 'Evidencia preparada para envío.';
const _queued = 'Evidencia guardada para envío posterior.';
const _discarded =
    'No se pudo preparar una evidencia. El resultado del análisis no se vio '
    'afectado.';
const _storageFull =
    'No se pudo guardar una imagen para el dataset; el análisis se completó '
    'normalmente.';

const _savedEvents = [
  EvidenceEvent.evidenceOptimizing,
  EvidenceEvent.evidencePrepared,
  EvidenceEvent.evidenceQueued,
];

void main() {
  late Directory storageDirectory;
  late Directory evidenceDirectory;

  setUp(() {
    AyniSdk.resetForTesting();
    AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
    storageDirectory = Directory.systemTemp.createTempSync('ayni-evidence-');
    evidenceDirectory = Directory('${storageDirectory.path}/evidence');
  });

  tearDown(() {
    AyniSdk.resetForTesting();
    storageDirectory.deleteSync(recursive: true);
  });

  Future<void> install({
    Map<String, Object?>? definition,
    String? inventory,
    CollectionPolicy? policy = const CollectionPolicy(
      maxImageSize: 1024,
      imageQuality: 80,
    ),
  }) async {
    if (policy != null) {
      await CollectionPolicyStore(storageDirectory).write(policy);
    }
    const bytes = 'deterministic test model';
    final modelDirectory = Directory(
      '${storageDirectory.path}/model-version-1',
    );
    await modelDirectory.create(recursive: true);
    await File(
      '${modelDirectory.path}/model-version-1.tflite',
    ).writeAsString(bytes);
    await File('${modelDirectory.path}/model-version-1.json').writeAsString(
      jsonEncode({
        'modelId': 'model-version-1',
        'modelVersionId': 'model-version-1',
        'sha256': crypto.sha256.convert(utf8.encode(bytes)).toString(),
      }),
    );
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: inventory ?? _inventory(),
      workflowVersionId: 'workflow-version-1',
      definitionJson: jsonEncode(definition ?? _captureDefinition()),
    );
  }

  AyniSdk sdk({
    void Function(String message)? onProgress,
    List<double> scores = const [0.2, 0.8],
    EvidenceImageOptimizer? evidenceImageOptimizer,
    EvidenceFileWriter? evidenceFileWriter,
    Uri? serverUrl,
  }) => createAyniSdkForTesting(
    serverUrl: serverUrl ?? Uri.parse('https://sdk.example.test'),
    credential: 'ayni_sk_test',
    storageDirectory: storageDirectory,
    allowInsecureLoopback: serverUrl != null,
    onProgress: onProgress,
    evidenceImageOptimizer: evidenceImageOptimizer,
    evidenceFileWriter: evidenceFileWriter,
    workflowInferenceRunner:
        ({
          required modelPath,
          required inputBytes,
          required acceptedInputShapes,
        }) async => (
          error: null,
          outputs: [
            (shape: [1, scores.length], values: Float32List.fromList(scores)),
          ],
        ),
  );

  Uint8List png({int width = 2, int height = 2}) => Uint8List.fromList(
    img.encodePng(img.Image(width: width, height: height)),
  );

  List<Directory> savedEvidence() => evidenceDirectory.existsSync()
      ? evidenceDirectory.listSync().whereType<Directory>().toList()
      : const [];

  /// Runs the capture workflow with consent and waits for its last event.
  Future<(WorkflowResult, List<EvidenceEvent>)> runAndWait(
    AyniSdk client,
    Uint8List input,
  ) async {
    final events = <EvidenceEvent>[];
    final done = Completer<void>();
    final result = await client.run(
      'workflow-1',
      input,
      evidenceConsent: true,
      onEvidence: (event) {
        events.add(event);
        if (_lastEvents.contains(event)) done.complete();
      },
    );
    await done.future;
    return (result, events);
  }

  img.Image savedImage(Directory evidence) {
    final image = img.decodeJpg(
      File('${evidence.path}/image').readAsBytesSync(),
    );
    expect(image, isNotNull, reason: 'the evidence image must be a JPEG');
    return image!;
  }

  group('with the consent of the app', () {
    test(
      'creates evidence with the image, result, workflow version and model',
      () async {
        await install();
        final progress = <String>[];

        final (result, events) = await runAndWait(
          sdk(onProgress: progress.add),
          png(),
        );

        expect(
          (result.outputs['Resultado']! as ClassificationResult).label,
          'gato',
        );
        expect(events, _savedEvents);
        expect(progress.where((message) => message != _usingLocal), [
          _optimizing,
          _prepared,
          _queued,
        ]);
        final evidence = savedEvidence().single;
        final image = savedImage(evidence);
        expect((image.width, image.height), (2, 2));
        final record =
            jsonDecode(
                  File('${evidence.path}/evidence.json').readAsStringSync(),
                )
                as Map;
        expect(
          record['evidenceId'],
          evidence.path.split(Platform.pathSeparator).last,
        );
        expect(record, containsPair('evidenceSchemaVersion', 1));
        expect(record, containsPair('workflowId', 'workflow-1'));
        expect(record, containsPair('workflowVersionId', 'workflow-version-1'));
        expect(record, containsPair('workflowVersion', '1.0.0'));
        expect(record, containsPair('captureNodeId', 'capture-1'));
        expect(record['model'], {
          'modelVersionId': 'model-version-1',
          'version': '2.0.0',
          'sha256': 'b' * 64,
        });
        expect(record['result'], {
          'type': 'classification',
          'nodeId': 'model-1',
          'label': 'gato',
          'confidence': closeTo(0.8, 1e-6),
          'confidences': {
            'perro': closeTo(0.2, 1e-6),
            'gato': closeTo(0.8, 1e-6),
          },
        });
        expect(DateTime.parse(record['capturedAt'] as String).isUtc, isTrue);
        expect(record['image'], {
          'mediaType': 'image/jpeg',
          'width': 2,
          'height': 2,
          'maxImageSize': 1024,
          'imageQuality': 80,
        });
      },
    );

    test('keeps the image reduced and compressed with the size and quality of '
        'the collection policy', () async {
      await install(
        policy: const CollectionPolicy(maxImageSize: 128, imageQuality: 40),
      );
      final input = png(width: 400, height: 200);

      await runAndWait(sdk(), input);

      final evidence = savedEvidence().single;
      final image = savedImage(evidence);
      expect((image.width, image.height), (128, 64));
      final record =
          jsonDecode(File('${evidence.path}/evidence.json').readAsStringSync())
              as Map;
      expect(record['image'], {
        'mediaType': 'image/jpeg',
        'width': 128,
        'height': 64,
        'maxImageSize': 128,
        'imageQuality': 40,
      });
    });

    test('does not modify the image the workflow used', () async {
      await install(
        policy: const CollectionPolicy(maxImageSize: 128, imageQuality: 40),
      );
      final input = png(width: 400, height: 200);
      final original = Uint8List.fromList(input);

      final (result, _) = await runAndWait(sdk(), input);

      expect(input, orderedEquals(original));
      expect(
        (result.outputs['Resultado']! as ClassificationResult).label,
        'gato',
      );
    });

    test('returns the result without waiting for the evidence', () async {
      await install();
      final order = <String>[];
      final queued = Completer<void>();

      await sdk().run(
        'workflow-1',
        png(),
        evidenceConsent: true,
        onEvidence: (event) {
          order.add(event.name);
          if (event == EvidenceEvent.evidenceQueued) queued.complete();
        },
      );
      order.add('result');
      await queued.future;

      expect(order, ['result', ..._savedEvents.map((event) => event.name)]);
    });

    test(
      'keeps the image the app passed even if it changes it later',
      () async {
        await install();
        final done = Completer<void>();
        final events = <EvidenceEvent>[];
        final input = png(width: 6, height: 3);

        await sdk().run(
          'workflow-1',
          input,
          evidenceConsent: true,
          onEvidence: (event) {
            events.add(event);
            if (event == EvidenceEvent.evidenceQueued ||
                event == EvidenceEvent.evidenceDiscarded) {
              done.complete();
            }
          },
        );
        // Zeros are not an image: optimizing them would fail.
        input.fillRange(0, input.length, 0);
        await done.future;

        expect(events, _savedEvents);
        final image = savedImage(savedEvidence().single);
        expect((image.width, image.height), (6, 3));
      },
    );

    test(
      'still returns the result when the evidence cannot be saved',
      () async {
        await install();
        File(evidenceDirectory.path).writeAsStringSync('not a directory');
        final progress = <String>[];

        final (result, events) = await runAndWait(
          sdk(onProgress: progress.add),
          png(),
        );

        expect(result.outputs, contains('Resultado'));
        expect(events, [
          EvidenceEvent.evidenceOptimizing,
          EvidenceEvent.evidencePrepared,
          EvidenceEvent.evidenceDiscarded,
        ]);
        expect(progress, contains(_discarded));
        expect(progress, isNot(contains(_queued)));
      },
    );

    group('when the image cannot be optimized', () {
      test('discards that evidence without leaving files or affecting the '
          'result', () async {
        await install();
        final progress = <String>[];

        final (result, events) = await runAndWait(
          sdk(
            onProgress: progress.add,
            evidenceImageOptimizer: _failingOptimizer,
          ),
          png(),
        );

        expect(
          (result.outputs['Resultado']! as ClassificationResult).label,
          'gato',
        );
        expect(events, [
          EvidenceEvent.evidenceOptimizing,
          EvidenceEvent.evidenceDiscarded,
        ]);
        expect(progress.where((message) => message != _usingLocal), [
          _optimizing,
          _discarded,
        ]);
        expect(
          evidenceDirectory.existsSync()
              ? evidenceDirectory.listSync()
              : const <FileSystemEntity>[],
          isEmpty,
        );
      });

      test('keeps the other local resources', () async {
        await install();
        await runAndWait(sdk(), png());
        final kept = savedEvidence().single;
        final inventory = File(
          '${storageDirectory.path}/sync-inventory.json',
        ).readAsStringSync();
        final policy = File(
          '${storageDirectory.path}/diagnostics/collection-policy.json',
        ).readAsStringSync();

        final (result, _) = await runAndWait(
          sdk(evidenceImageOptimizer: _failingOptimizer),
          png(),
        );

        expect(result.outputs, contains('Resultado'));
        expect(savedEvidence().map((evidence) => evidence.path), [kept.path]);
        expect(savedImage(kept).width, 2);
        expect(
          File(
            '${storageDirectory.path}/sync-inventory.json',
          ).readAsStringSync(),
          inventory,
        );
        expect(
          File(
            '${storageDirectory.path}/diagnostics/collection-policy.json',
          ).readAsStringSync(),
          policy,
        );
        expect(
          File(
            '${storageDirectory.path}/model-version-1/model-version-1.tflite',
          ).existsSync(),
          isTrue,
        );
      });

      test('discards it while the SDK has no collection policy', () async {
        await install(policy: null);

        final (result, events) = await runAndWait(sdk(), png());

        expect(result.outputs, contains('Resultado'));
        expect(events, [
          EvidenceEvent.evidenceOptimizing,
          EvidenceEvent.evidenceDiscarded,
        ]);
        expect(evidenceDirectory.existsSync(), isFalse);
      });
    });

    test('creates no evidence when the workflow fails', () async {
      await install();
      final events = <EvidenceEvent>[];

      await expectLater(
        sdk(scores: const [0.2, 1.5]).run(
          'workflow-1',
          png(),
          evidenceConsent: true,
          onEvidence: events.add,
        ),
        throwsA(isA<WorkflowError>()),
      );
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(events, isEmpty);
      expect(evidenceDirectory.existsSync(), isFalse);
    });

    test('creates no evidence when the capture is not reached', () async {
      // The capture's model feeds no output, so the workflow never runs it.
      final definition = _captureDefinition();
      final nodes = definition['nodes'] as List;
      final model = nodes.cast<Map>().firstWhere(
        (node) => node['id'] == 'model-1',
      );
      nodes.add({
        ...model,
        'id': 'model-2',
        'modelVersionId': 'model-version-2',
      });
      (definition['connections'] as List)
        ..removeWhere(
          (connection) => (connection as Map)['sourceNodeId'] == 'model-1',
        )
        ..addAll([
          {
            'sourceNodeId': 'input-1',
            'sourcePort': 'imagen',
            'targetNodeId': 'model-2',
            'targetPort': 'image',
          },
          {
            'sourceNodeId': 'model-2',
            'sourcePort': 'result',
            'targetNodeId': 'capture-1',
            'targetPort': 'resultado',
          },
        ]);
      // model-2's file is not installed: the run must not even need it.
      await install(
        definition: definition,
        inventory: _inventory(withUnusedModel: true),
      );
      final events = <EvidenceEvent>[];
      var inferences = 0;
      final client = createAyniSdkForTesting(
        serverUrl: Uri.parse('https://sdk.example.test'),
        credential: 'ayni_sk_test',
        storageDirectory: storageDirectory,
        workflowInferenceRunner:
            ({
              required modelPath,
              required inputBytes,
              required acceptedInputShapes,
            }) async {
              inferences++;
              return (
                error: null,
                outputs: [
                  (shape: [1, 2], values: Float32List.fromList([0.2, 0.8])),
                ],
              );
            },
      );

      final result = await client.run(
        'workflow-1',
        png(),
        evidenceConsent: true,
        onEvidence: events.add,
      );
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(result.outputs, contains('Resultado'));
      expect(inferences, 1);
      expect(events, isEmpty);
      expect(evidenceDirectory.existsSync(), isFalse);
    });

    test('records the capture node in the trace without the image', () async {
      await install();
      await TelemetryPolicyStore(
        storageDirectory,
      ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));

      final result = await sdk().run(
        'workflow-1',
        png(),
        traceContext: WorkflowTraceContext(runId: 'run-1', repetition: 1),
      );

      final capture = result.trace!.nodes.singleWhere(
        (node) => node.nodeId == 'capture-1',
      );
      expect(capture.type, 'dataset.capture');
      expect(capture.status, 'completed');
    });
  });

  group('capture behind a condition (US-074)', () {
    // The capture hangs from the `true` branch of `gato < 0.9`: only
    // low-confidence predictions are kept for the dataset.
    test('creates the evidence when the result meets the condition', () async {
      await install(definition: _gatedCaptureDefinition());

      final (result, events) = await runAndWait(sdk(), png());

      expect(
        (result.outputs['Resultado']! as ClassificationResult).label,
        'gato',
      );
      expect(events, _savedEvents);
      final record =
          jsonDecode(
                File(
                  '${savedEvidence().single.path}/evidence.json',
                ).readAsStringSync(),
              )
              as Map;
      expect(record, containsPair('captureNodeId', 'capture-1'));
    });

    test('follows the branch the capture hangs from', () async {
      // `gato >= 0.9` is false for 0.8, and the capture hangs from `false`.
      await install(
        definition: _gatedCaptureDefinition(operator: 'gte', branch: 'false'),
      );

      final (_, events) = await runAndWait(sdk(), png());

      expect(events, _savedEvents);
      expect(savedEvidence(), hasLength(1));
    });

    test('creates no evidence when the result does not meet the condition, '
        'and keeps the result and the allowed telemetry', () async {
      await install(definition: _gatedCaptureDefinition());
      await TelemetryPolicyStore(
        storageDirectory,
      ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));
      final events = <EvidenceEvent>[];

      final result = await sdk(scores: const [0.05, 0.95]).run(
        'workflow-1',
        png(),
        evidenceConsent: true,
        onEvidence: events.add,
        traceContext: WorkflowTraceContext(runId: 'run-1', repetition: 1),
      );
      await Future<void>.delayed(const Duration(milliseconds: 50));

      final classification =
          result.outputs['Resultado']! as ClassificationResult;
      expect(classification.label, 'gato');
      expect(classification.confidence, closeTo(0.95, 1e-6));
      expect(result.outputs.keys, ['Resultado']);
      expect(events, isEmpty);
      expect(evidenceDirectory.existsSync(), isFalse);
      final nodes = {
        for (final node in result.trace!.nodes) node.nodeId: node.status,
      };
      expect(nodes['condition-1'], 'completed');
      expect(nodes['capture-1'], 'skipped');
      final queued = await TraceOutboxStore(storageDirectory).pending();
      final queuedCapture = (queued.single['nodes']! as List)
          .cast<Map>()
          .singleWhere((node) => node['nodeId'] == 'capture-1');
      expect(queuedCapture['status'], 'skipped');
    });

    test('evaluates a condition that no output reads', () async {
      // The condition only decides the capture: its unused branch must not
      // fail the run as a branch that reaches no output.
      await install(
        definition: _gatedCaptureDefinition(operator: 'gte', branch: 'false'),
      );

      final result = await sdk(
        scores: const [0.05, 0.95],
      ).run('workflow-1', png(), evidenceConsent: true);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(result.outputs, contains('Resultado'));
      expect(evidenceDirectory.existsSync(), isFalse);
    });

    test('creates no evidence without the consent of the app', () async {
      await install(definition: _gatedCaptureDefinition());

      final result = await sdk().run('workflow-1', png());
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(result.outputs, contains('Resultado'));
      expect(evidenceDirectory.existsSync(), isFalse);
    });
  });

  group('local queue (US-068)', () {
    test('leaves the evidence pending on the device, without a connection '
        'and across a restart', () async {
      await install();
      final offline = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final serverUrl = Uri.parse('http://127.0.0.1:${offline.port}');
      await offline.close(force: true);
      final client = sdk(serverUrl: serverUrl);

      await runAndWait(client, png());
      final pending = savedEvidence().single;
      expect(await client.pendingEvidenceCount(), 1);

      expect((await client.sync()).status, SyncStatus.offline);
      expect(await client.pendingEvidenceCount(), 1);

      final restarted = sdk(serverUrl: serverUrl);
      expect(await restarted.pendingEvidenceCount(), 1);
      expect(savedEvidence().map((evidence) => evidence.path), [pending.path]);
      expect(File('${pending.path}/image').existsSync(), isTrue);
      expect(File('${pending.path}/evidence.json').existsSync(), isTrue);
    });

    test('reports evidenceQueued only once the evidence is pending in the '
        'queue', () async {
      await install();
      final release = Completer<void>();
      final counts = <EvidenceEvent, Future<int>>{};
      late final AyniSdk client;
      client = sdk(
        evidenceFileWriter: (file, bytes) async {
          await release.future;
          await file.writeAsBytes(bytes, flush: true);
        },
      );
      final prepared = Completer<void>();
      final queued = Completer<void>();

      await client.run(
        'workflow-1',
        png(),
        evidenceConsent: true,
        onEvidence: (event) {
          counts[event] = client.pendingEvidenceCount();
          if (event == EvidenceEvent.evidencePrepared) prepared.complete();
          if (event == EvidenceEvent.evidenceQueued) queued.complete();
        },
      );
      await prepared.future;
      expect(await counts[EvidenceEvent.evidencePrepared], 0);
      release.complete();
      await queued.future;

      expect(await counts[EvidenceEvent.evidenceQueued], 1);
    });

    test(
      'does not block later runs while an evidence is being saved',
      () async {
        await install();
        final release = Completer<void>();
        final client = sdk(
          evidenceFileWriter: (file, bytes) async {
            await release.future;
            await file.writeAsBytes(bytes, flush: true);
          },
        );
        var queued = 0;
        final bothQueued = Completer<void>();
        void onEvidence(EvidenceEvent event) {
          if (event == EvidenceEvent.evidenceQueued && ++queued == 2) {
            bothQueued.complete();
          }
        }

        await client.run(
          'workflow-1',
          png(),
          evidenceConsent: true,
          onEvidence: onEvidence,
        );
        final second = await client.run(
          'workflow-1',
          png(),
          evidenceConsent: true,
          onEvidence: onEvidence,
        );

        expect(
          (second.outputs['Resultado']! as ClassificationResult).label,
          'gato',
        );
        expect(await client.pendingEvidenceCount(), 0);
        release.complete();
        await bothQueued.future;
        expect(await client.pendingEvidenceCount(), 2);
      },
    );

    group('when the device has no space left', () {
      test('discards that evidence without partial files and reports '
          'evidenceStorageFull, without failing the inference', () async {
        await install();
        final progress = <String>[];
        var writes = 0;

        final (result, events) = await runAndWait(
          sdk(
            onProgress: progress.add,
            evidenceFileWriter: (file, bytes) async {
              writes++;
              await file.writeAsBytes(bytes.sublist(0, 1), flush: true);
              if (writes == 2) throw _noSpace(file.path);
            },
          ),
          png(),
        );

        expect(
          (result.outputs['Resultado']! as ClassificationResult).label,
          'gato',
        );
        expect(events, [
          EvidenceEvent.evidenceOptimizing,
          EvidenceEvent.evidencePrepared,
          EvidenceEvent.evidenceStorageFull,
        ]);
        expect(EvidenceEvent.evidenceStorageFull.message, _storageFull);
        expect(progress.where((message) => message != _usingLocal), [
          _optimizing,
          _prepared,
          _storageFull,
        ]);
        expect(evidenceDirectory.listSync(), isEmpty);
      });

      test('keeps the evidence already pending', () async {
        await install();
        final client = sdk();
        await runAndWait(client, png());
        final kept = savedEvidence().single;

        final (_, events) = await runAndWait(
          sdk(
            evidenceFileWriter: (file, bytes) async =>
                throw _noSpace(file.path),
          ),
          png(),
        );

        expect(events.last, EvidenceEvent.evidenceStorageFull);
        expect(savedEvidence().map((evidence) => evidence.path), [kept.path]);
        expect(await client.pendingEvidenceCount(), 1);
      });
    });
  });

  group('without the consent of the app', () {
    test('returns the result and keeps no image', () async {
      await install();
      final events = <EvidenceEvent>[];
      final progress = <String>[];

      final result = await sdk(
        onProgress: progress.add,
      ).run('workflow-1', png(), onEvidence: events.add);
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(
        (result.outputs['Resultado']! as ClassificationResult).label,
        'gato',
      );
      expect(events, isEmpty);
      expect(progress, isNot(contains(_optimizing)));
      expect(progress, isNot(contains(_queued)));
      expect(evidenceDirectory.existsSync(), isFalse);
    });
  });

  group('clearPendingEvidence', () {
    test(
      'also drops the evidence of a run active when it was called',
      () async {
        await install();
        final inferenceStarted = Completer<void>();
        final releaseInference = Completer<void>();
        final client = createAyniSdkForTesting(
          serverUrl: Uri.parse('https://sdk.example.test'),
          credential: 'ayni_sk_test',
          storageDirectory: storageDirectory,
          workflowInferenceRunner:
              ({
                required modelPath,
                required inputBytes,
                required acceptedInputShapes,
              }) async {
                inferenceStarted.complete();
                await releaseInference.future;
                return (
                  error: null,
                  outputs: [
                    (shape: [1, 2], values: Float32List.fromList([0.2, 0.8])),
                  ],
                );
              },
        );
        final events = <EvidenceEvent>[];

        final running = client.run(
          'workflow-1',
          png(),
          evidenceConsent: true,
          onEvidence: events.add,
        );
        await inferenceStarted.future;
        await client.clearPendingEvidence();
        releaseInference.complete();
        final result = await running;
        await client.clearPendingEvidence();

        expect(result.outputs, contains('Resultado'));
        expect(events, isEmpty);
        expect(evidenceDirectory.existsSync(), isFalse);
      },
    );

    test('deletes the saved evidence after the saves in progress', () async {
      await install();
      final client = sdk();
      await runAndWait(client, png());
      final events = <EvidenceEvent>[];
      await client.run(
        'workflow-1',
        png(),
        evidenceConsent: true,
        onEvidence: events.add,
      );

      await client.clearPendingEvidence();

      expect(evidenceDirectory.existsSync(), isFalse);
      expect(events, _savedEvents);
    });

    test('does nothing when there is no evidence', () async {
      await sdk().clearPendingEvidence();

      expect(evidenceDirectory.existsSync(), isFalse);
    });
  });
}

const _usingLocal = 'Usando recursos guardados en este dispositivo.';

/// The events that end the work on one evidence.
const _lastEvents = {
  EvidenceEvent.evidenceQueued,
  EvidenceEvent.evidenceDiscarded,
  EvidenceEvent.evidenceStorageFull,
};

/// The error a write fails with when the device has no space left.
FileSystemException _noSpace(String path) => FileSystemException(
  'Cannot write file',
  path,
  OSError('No space left on device', Platform.isWindows ? 112 : 28),
);

OptimizedEvidenceImage _failingOptimizer(
  Uint8List image,
  CollectionPolicy policy,
) => throw const FormatException('The image cannot be optimized.');

String _inventory({bool withUnusedModel = false}) => jsonEncode({
  'workflows': [
    {
      'workflowId': 'workflow-1',
      'workflowVersionId': 'workflow-version-1',
      'name': 'Clasificar hoja',
      'version': '1.0.0',
      'modelVersionIds': [
        'model-version-1',
        if (withUnusedModel) 'model-version-2',
      ],
    },
  ],
  'models': [
    {
      'modelVersionId': 'model-version-1',
      'version': '2.0.0',
      'sha256': 'b' * 64,
    },
    if (withUnusedModel)
      {
        'modelVersionId': 'model-version-2',
        'version': '1.0.0',
        'sha256': 'c' * 64,
      },
  ],
});

Map<String, Object?> _captureDefinition() => {
  'schemaVersion': '3',
  'nodes': <Object?>[
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
      'version': '2.0.0',
      'inputs': {
        'image': {
          'type': 'image',
          'width': 4,
          'height': 4,
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
    {
      'id': 'capture-1',
      'type': 'dataset.capture',
      'inputs': {'imagen': 'image', 'resultado': 'inferenceResult'},
    },
  ],
  'connections': <Object?>[
    {
      'sourceNodeId': 'input-1',
      'sourcePort': 'imagen',
      'targetNodeId': 'model-1',
      'targetPort': 'image',
    },
    {
      'sourceNodeId': 'input-1',
      'sourcePort': 'imagen',
      'targetNodeId': 'capture-1',
      'targetPort': 'imagen',
    },
    {
      'sourceNodeId': 'model-1',
      'sourcePort': 'result',
      'targetNodeId': 'capture-1',
      'targetPort': 'resultado',
    },
  ],
};

/// [_captureDefinition] with its capture behind the [branch] of a condition
/// on the confidence of `gato` that no output reads (US-074).
Map<String, Object?> _gatedCaptureDefinition({
  String operator = 'lt',
  String branch = 'true',
}) {
  final definition = _captureDefinition();
  (definition['nodes'] as List).add({
    'id': 'condition-1',
    'type': 'condition',
    'sourceNodeId': 'model-1',
    'label': 'gato',
    'operator': operator,
    'threshold': 0.9,
    'branches': {'true': 'Verdadero', 'false': 'Falso'},
  });
  (definition['connections'] as List).add({
    'sourceNodeId': 'condition-1',
    'sourcePort': branch,
    'targetNodeId': 'capture-1',
    'targetPort': 'condicion',
  });
  return definition;
}
