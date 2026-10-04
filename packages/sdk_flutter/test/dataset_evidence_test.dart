// US-066: a workflow that reaches `dataset.capture` creates local evidence
// without delaying the result, and only with the app's consent.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/telemetry_policy_store.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:image/image.dart' as img;
import 'package:test/test.dart';

import 'support/workflow_install.dart';

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
  }) async {
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
  }) => createAyniSdkForTesting(
    serverUrl: Uri.parse('https://sdk.example.test'),
    credential: 'ayni_sk_test',
    storageDirectory: storageDirectory,
    onProgress: onProgress,
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

  Uint8List png() =>
      Uint8List.fromList(img.encodePng(img.Image(width: 2, height: 2)));

  List<Directory> savedEvidence() => evidenceDirectory.existsSync()
      ? evidenceDirectory.listSync().whereType<Directory>().toList()
      : const [];

  group('with the consent of the app', () {
    test(
      'creates evidence with the image, result, workflow version and model',
      () async {
        await install();
        final queued = Completer<EvidenceEvent>();
        final progress = <String>[];
        final input = png();

        final result = await sdk(onProgress: progress.add).run(
          'workflow-1',
          input,
          evidenceConsent: true,
          onEvidence: queued.complete,
        );

        expect(
          (result.outputs['Resultado']! as ClassificationResult).label,
          'gato',
        );
        expect(await queued.future, EvidenceEvent.evidenceQueued);
        expect(progress, contains('Evidencia guardada para envío posterior.'));
        final evidence = savedEvidence().single;
        expect(
          File('${evidence.path}/image').readAsBytesSync(),
          orderedEquals(input),
        );
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
      },
    );

    test('returns the result without waiting for the evidence', () async {
      await install();
      final order = <String>[];
      final queued = Completer<void>();

      await sdk().run(
        'workflow-1',
        png(),
        evidenceConsent: true,
        onEvidence: (_) {
          order.add('evidence');
          queued.complete();
        },
      );
      order.add('result');
      await queued.future;

      expect(order, ['result', 'evidence']);
    });

    test(
      'keeps the image the app passed even if it changes it later',
      () async {
        await install();
        final queued = Completer<void>();
        final input = png();
        final original = Uint8List.fromList(input);

        await sdk().run(
          'workflow-1',
          input,
          evidenceConsent: true,
          onEvidence: (_) => queued.complete(),
        );
        input.fillRange(0, input.length, 0);
        await queued.future;

        expect(
          File('${savedEvidence().single.path}/image').readAsBytesSync(),
          orderedEquals(original),
        );
      },
    );

    test(
      'still returns the result when the evidence cannot be saved',
      () async {
        await install();
        File(evidenceDirectory.path).writeAsStringSync('not a directory');
        final events = <EvidenceEvent>[];
        final progress = <String>[];
        final client = sdk(onProgress: progress.add);

        final result = await client.run(
          'workflow-1',
          png(),
          evidenceConsent: true,
          onEvidence: events.add,
        );
        // Clearing runs after the failed save, so awaiting it awaits the save.
        await client.clearPendingEvidence();

        expect(result.outputs, contains('Resultado'));
        expect(events, isEmpty);
        expect(
          progress,
          isNot(contains('Evidencia guardada para envío posterior.')),
        );
      },
    );

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
      expect(
        progress,
        isNot(contains('Evidencia guardada para envío posterior.')),
      );
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
      final first = Completer<void>();
      await client.run(
        'workflow-1',
        png(),
        evidenceConsent: true,
        onEvidence: (_) => first.complete(),
      );
      await first.future;
      final events = <EvidenceEvent>[];
      await client.run(
        'workflow-1',
        png(),
        evidenceConsent: true,
        onEvidence: events.add,
      );

      await client.clearPendingEvidence();

      expect(evidenceDirectory.existsSync(), isFalse);
      expect(events, [EvidenceEvent.evidenceQueued]);
    });

    test('does nothing when there is no evidence', () async {
      await sdk().clearPendingEvidence();

      expect(evidenceDirectory.existsSync(), isFalse);
    });
  });
}

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
