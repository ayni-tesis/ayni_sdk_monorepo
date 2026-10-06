import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/workflow_execution.dart'
    show WorkflowCapture, WorkflowExecutor;
import 'package:ayni_sdk/src/telemetry_policy_store.dart';
import 'package:ayni_sdk/src/trace_outbox_store.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:image/image.dart' as img;
import 'package:test/test.dart';

import 'support/workflow_install.dart';

void main() {
  late Directory storageDirectory;

  setUp(() {
    AyniSdk.resetForTesting();
    AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
    storageDirectory = Directory.systemTemp.createTempSync(
      'ayni-typed-results-',
    );
  });

  tearDown(() {
    AyniSdk.resetForTesting();
    storageDirectory.deleteSync(recursive: true);
  });

  AyniSdk sdk() => AyniSdk(
    serverUrl: Uri.parse('https://sdk.example.test'),
    credential: 'ayni_sk_test',
    storageDirectory: storageDirectory,
  );

  Future<void> installWorkflow() => installWorkflowFiles(
    storageDirectory: storageDirectory,
    inventoryJson: _inventory(),
    workflowVersionId: 'workflow-version-1.0.0',
    definitionJson: _definition(),
  );

  Uint8List pngBytes() =>
      Uint8List.fromList(img.encodePng(img.Image(width: 1, height: 1)));

  Future<void> installTraceModelArtifact() async {
    const bytes = 'deterministic test model';
    final hash = crypto.sha256.convert(utf8.encode(bytes)).toString();
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
        'sha256': hash,
      }),
    );
  }

  group('policy-gated workflow traces', () {
    final context = WorkflowTraceContext(
      runId: 'validation-run-7',
      repetition: 3,
      condition: 'treatment',
      caseId: 'leaf-healthy-1',
      ramRange: '4–<8 GB',
      socModel: 'Client SoC',
      measurements: [
        TraceMeasurement(
          name: 'latency',
          value: 14.5,
          unit: 'ms',
          method: 'stopwatch',
          source: 'host-app',
          phase: 'workflow',
        ),
      ],
    );

    test('attaches a typed local trace to a successful run', () async {
      AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
      await installWorkflow();
      await installTraceModelArtifact();
      await TelemetryPolicyStore(
        storageDirectory,
      ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));
      final client = createAyniSdkForTesting(
        serverUrl: Uri.parse('https://sdk.example.test'),
        credential: 'ayni_sk_test',
        storageDirectory: storageDirectory,
        workflowInferenceRunner:
            ({
              required modelPath,
              required inputBytes,
              required acceptedInputShapes,
            }) async => (
              error: null,
              outputs: [
                (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
              ],
            ),
      );

      final result = await client.run(
        'workflow-1',
        pngBytes(),
        traceContext: context,
      );
      final trace = result.trace!;
      final json = trace.toJson();

      expect(trace.runId, 'validation-run-7');
      expect(trace.repetition, 3);
      expect(
        trace.traceId,
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
      expect(
        trace.installationId,
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
      expect(trace.workflowVersionId, 'workflow-version-1.0.0');
      expect(
        trace.outputs['Resultado'],
        containsPair('type', 'classification'),
      );
      expect(trace.models.single.sha256, 'a' * 64);
      expect(trace.profile.ramRange, '4–<8 GB');
      expect(trace.nodes.map((node) => node.status), everyElement('completed'));
      expect(
        trace.clientReportedFields,
        containsAll([
          'condition',
          'runId',
          'repetition',
          'caseId',
          'ramRange',
          'socModel',
          'measurements',
        ]),
      );
      expect(jsonEncode(json), isNot(contains(base64Encode(pngBytes()))));
      expect(json['traceSchemaVersion'], 1);
      expect(result.tracePersistenceFailed, isFalse);
      final queuedTraces = await TraceOutboxStore(storageDirectory).pending();
      expect(queuedTraces.single['traceId'], trace.traceId);
      expect(queuedTraces.single.containsKey('sent'), isFalse);
    });

    test(
      'reports trace persistence failure without failing local inference',
      () async {
        await installWorkflow();
        await installTraceModelArtifact();
        await TelemetryPolicyStore(
          storageDirectory,
        ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));
        await File(
          '${storageDirectory.path}/diagnostics/trace-outbox',
        ).writeAsString('block the outbox directory');
        final client = createAyniSdkForTesting(
          serverUrl: Uri.parse('https://sdk.example.test'),
          credential: 'ayni_sk_test',
          storageDirectory: storageDirectory,
          workflowInferenceRunner:
              ({
                required modelPath,
                required inputBytes,
                required acceptedInputShapes,
              }) async => (
                error: null,
                outputs: [
                  (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                ],
              ),
        );

        final result = await client.run(
          'workflow-1',
          pngBytes(),
          traceContext: context,
        );

        expect(result.outputs, contains('Resultado'));
        expect(result.trace, isNotNull);
        expect(result.tracePersistenceFailed, isTrue);
      },
    );

    test('keeps pending traces when telemetry is disabled', () async {
      await installWorkflow();
      await installTraceModelArtifact();
      final policy = TelemetryPolicyStore(storageDirectory);
      await policy.write(
        const TelemetryPolicy(enabled: true, retentionDays: 30),
      );
      final client = createAyniSdkForTesting(
        serverUrl: Uri.parse('https://sdk.example.test'),
        credential: 'ayni_sk_test',
        storageDirectory: storageDirectory,
        workflowInferenceRunner:
            ({
              required modelPath,
              required inputBytes,
              required acceptedInputShapes,
            }) async => (
              error: null,
              outputs: [
                (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
              ],
            ),
      );
      final first = await client.run(
        'workflow-1',
        pngBytes(),
        traceContext: context,
      );
      final firstTraceId = first.trace!.traceId;

      await policy.write(
        const TelemetryPolicy(enabled: false, retentionDays: 30),
      );
      final second = await client.run(
        'workflow-1',
        pngBytes(),
        traceContext: context,
      );

      expect(second.trace, isNull);
      expect(second.tracePersistenceFailed, isFalse);
      final pending = await TraceOutboxStore(storageDirectory).pending();
      expect(pending, hasLength(1));
      expect(pending.single['traceId'], firstTraceId);
    });

    test('attaches a sanitized trace to a typed execution error', () async {
      AyniSdk.setPlatformForTesting(isAndroid: true, androidSdkVersion: 26);
      await installWorkflow();
      await TelemetryPolicyStore(
        storageDirectory,
      ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));

      final error = await sdk()
          .run('workflow-1', pngBytes(), traceContext: context)
          .then<WorkflowError?>(
            (_) => null,
            onError: (Object error) => error is WorkflowError ? error : null,
          );

      expect(error?.category, WorkflowErrorCategory.modelNotAvailable);
      expect(error?.trace?.status, 'error');
      expect(error?.trace?.error, {
        'category': 'modelNotAvailable',
        'phase': 'modelResolution',
        'modelVersionId': 'model-version-1',
      });
      expect(error?.trace?.models, isEmpty);
      expect(error?.trace?.toJson().containsKey('input'), isFalse);
      expect(error?.tracePersistenceFailed, isFalse);
      final queuedTraces = await TraceOutboxStore(storageDirectory).pending();
      expect(queuedTraces.single['traceId'], error?.trace?.traceId);
    });

    test(
      'builds a control trace only with a cached enabled policy and makes no request',
      () async {
        final client = sdk();
        final disabled = await client.createClientExecutionTrace(
          context: context,
          workflowId: 'workflow-1',
          workflowVersionId: 'control-1',
          workflowVersion: '1.0.0',
          timestamp: DateTime.utc(2026, 10, 2),
          durationMs: 12,
          outputs: const {'Resultado': BooleanResult('condition-1', true)},
        );
        expect(disabled, isNull);

        await TelemetryPolicyStore(
          storageDirectory,
        ).write(const TelemetryPolicy(enabled: true, retentionDays: 90));
        final trace = await client.createClientExecutionTrace(
          context: context,
          workflowId: 'workflow-1',
          workflowVersionId: 'control-1',
          workflowVersion: '1.0.0',
          timestamp: DateTime.utc(2026, 10, 2),
          durationMs: 12,
          outputs: const {'Resultado': BooleanResult('condition-1', true)},
          models: [
            TraceModel(
              modelVersionId: 'model-1',
              version: '1.0.0',
              sha256: 'b' * 64,
            ),
          ],
        );

        expect(trace?.runId, 'validation-run-7');
        expect(trace?.outputs['Resultado'], {
          'type': 'boolean',
          'nodeId': 'condition-1',
          'value': true,
        });
        expect(trace?.profile.socModel, 'Client SoC');
        expect(trace?.toJson()['traceSchemaVersion'], 1);
      },
    );

    test(
      'represents a typed control failure without raw exception details',
      () async {
        await TelemetryPolicyStore(
          storageDirectory,
        ).write(const TelemetryPolicy(enabled: true, retentionDays: 7));

        final trace = await sdk().createClientExecutionTrace(
          context: context,
          workflowId: 'workflow-1',
          workflowVersionId: 'control-1',
          workflowVersion: '1.0.0',
          timestamp: DateTime.utc(2026, 10, 2),
          durationMs: 3,
          error: const WorkflowError(
            WorkflowErrorCategory.modelOutputInvalid,
            nodeId: 'model-1',
          ),
        );

        expect(trace?.status, 'error');
        expect(trace?.error, {
          'category': 'modelOutputInvalid',
          'nodeId': 'model-1',
        });
        expect(trace?.toJson().containsKey('message'), isFalse);
      },
    );
  });

  Future<void> installModelArtifact({
    String versionId = 'model-version-1',
    String bytes = 'deterministic test model',
  }) async {
    final hash = crypto.sha256.convert(utf8.encode(bytes)).toString();
    final modelDirectory = Directory('${storageDirectory.path}/$versionId');
    await modelDirectory.create(recursive: true);
    await File('${modelDirectory.path}/$versionId.tflite').writeAsString(bytes);
    await File('${modelDirectory.path}/$versionId.json').writeAsString(
      jsonEncode({
        'modelId': versionId,
        'modelVersionId': versionId,
        'sha256': hash,
      }),
    );
  }

  Future<WorkflowResult> runDetectionWithTensors({
    required List<({List<int> shape, Float32List values})> outputs,
    required Map<String, int> tensorIndices,
  }) async {
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final model = (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'model.tflite',
    );
    ((model['outputs'] as Map)['result'] as Map)
      ..['type'] = 'detection'
      ..['labels'] = ['mancha', 'roya']
      ..['scoreThreshold'] = 0.5
      ..['tensorIndices'] = tensorIndices;
    (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'output',
    )['resultType'] = 'detection';
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: jsonEncode(definition),
    );
    await installModelArtifact();
    final client = createAyniSdkForTesting(
      serverUrl: Uri.parse('https://sdk.example.test'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      workflowInferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (error: null, outputs: outputs),
    );
    return client.run('workflow-1', pngBytes());
  }

  group('WorkflowResult', () {
    test('reports the executed workflow context', () {
      const result = WorkflowResult(
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowVersion: '1.0.0',
        outputs: {},
      );

      expect(result.workflowId, 'workflow-1');
      expect(result.executionId, 'execution-1');
      expect(result.workflowVersion, '1.0.0');
      expect(result.usingOfflineCache, isTrue);
      expect(result.outputs, isEmpty);
    });

    test('carries classification, detection and boolean values', () {
      final result = WorkflowResult(
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowVersion: '1.0.0',
        outputs: {
          'Clasificación': ClassificationResult('model-1', 'perro', 0.92, {
            'perro': 0.92,
            'gato': 0.08,
          }),
          'Detección': DetectionResult('model-2', [
            Detection('mancha', 0.87, 0.1, 0.2, 0.5, 0.6),
          ]),
          'Segmentación': SegmentationResult(
            'model-3',
            width: 2,
            height: 1,
            labels: ['fondo', 'hoja'],
            mask: Uint8List.fromList([0, 1]),
            areaFractions: {'fondo': 0.5, 'hoja': 0.5},
            confidence: 0.9,
          ),
          'Apto': BooleanResult('condition-1', true),
        },
      );

      final consumed = result.outputs.map(
        (name, value) => MapEntry(name, switch (value) {
          ClassificationResult(
            :final nodeId,
            :final label,
            :final confidence,
            :final confidences,
          ) =>
            '$nodeId|$label|$confidence|${confidences['gato']}',
          DetectionResult(:final nodeId, :final detections) =>
            '$nodeId|${detections.single.label}|'
                '${detections.single.confidence}|${detections.single.xMin}|'
                '${detections.single.yMin}|${detections.single.xMax}|'
                '${detections.single.yMax}',
          SegmentationResult(:final nodeId, :final width, :final height) =>
            '$nodeId|${width}x$height',
          CombinedWorkflowResult(:final nodeId, :final values) =>
            '$nodeId|${values.map((value) => value.nodeId).join(',')}',
          BooleanResult(:final nodeId, :final value) => '$nodeId|$value',
        }),
      );

      expect(consumed, {
        'Clasificación': 'model-1|perro|0.92|0.08',
        'Detección': 'model-2|mancha|0.87|0.1|0.2|0.5|0.6',
        'Segmentación': 'model-3|2x1',
        'Apto': 'condition-1|true',
      });
    });

    test(
      'combines available branch results and rejects missing sources',
      () async {
        await installModelArtifact();
        await installModelArtifact(
          versionId: 'model-version-2',
          bytes: 'deterministic detector model',
        );
        final inventory = jsonDecode(_inventory()) as Map<String, dynamic>;
        (inventory['workflows'] as List).first['modelVersionIds'].add(
          'model-version-2',
        );
        (inventory['models'] as List).add({
          'modelVersionId': 'model-version-2',
          'version': '1.0.0',
          'sha256': crypto.sha256
              .convert(utf8.encode('deterministic detector model'))
              .toString(),
        });
        final definition = jsonDecode(_definition()) as Map<String, dynamic>;
        definition['schemaVersion'] = '2';
        final nodes = (definition['nodes'] as List).cast<Map>();
        final classifier = nodes.firstWhere(
          (node) => node['type'] == 'model.tflite',
        );
        final detector = Map<String, Object>.from(classifier)
          ..['id'] = 'model-2'
          ..['modelVersionId'] = 'model-version-2'
          ..['modelName'] = 'Detector'
          ..['outputs'] = {
            'result': {
              'type': 'detection',
              'labels': ['hoja'],
              'scoreThreshold': 0.5,
            },
          };
        final output = nodes.firstWhere((node) => node['type'] == 'output');
        output
          ..remove('sourceNodeId')
          ..remove('sourcePort')
          ..remove('resultType')
          ..['sources'] = [
            {
              'sourceNodeId': 'model-1',
              'sourcePort': 'result',
              'resultType': 'classification',
            },
            {
              'sourceNodeId': 'model-2',
              'sourcePort': 'result',
              'resultType': 'detection',
            },
            {
              'sourceNodeId': 'condition-1',
              'sourcePort': 'true',
              'resultType': 'boolean',
            },
            {
              'sourceNodeId': 'condition-1',
              'sourcePort': 'false',
              'resultType': 'boolean',
            },
            {
              'sourceNodeId': 'condition-2',
              'sourcePort': 'true',
              'resultType': 'boolean',
            },
            {
              'sourceNodeId': 'condition-2',
              'sourcePort': 'false',
              'resultType': 'boolean',
            },
          ];
        nodes.add({
          'id': 'condition-1',
          'type': 'condition',
          'sourceNodeId': 'model-1',
          'label': 'gato',
          'operator': 'gte',
          'threshold': 0.5,
          'branches': {'true': 'Verdadero', 'false': 'Falso'},
        });
        nodes.add({
          'id': 'condition-2',
          'type': 'condition',
          'sourceNodeId': 'model-1',
          'label': 'gato',
          'operator': 'lte',
          'threshold': 0.5,
          'branches': {'true': 'Verdadero', 'false': 'Falso'},
        });
        nodes.add(detector);
        (definition['connections'] as List).add({
          'sourceNodeId': 'input-1',
          'sourcePort': 'imagen',
          'targetNodeId': 'model-2',
          'targetPort': 'image',
        });
        await installWorkflowFiles(
          storageDirectory: storageDirectory,
          inventoryJson: jsonEncode(inventory),
          workflowVersionId: 'workflow-version-1.0.0',
          definitionJson: jsonEncode(definition),
        );
        final client = createAyniSdkForTesting(
          serverUrl: Uri.parse('https://sdk.example.test'),
          credential: 'ayni_sk_test',
          storageDirectory: storageDirectory,
          workflowInferenceRunner:
              ({
                required modelPath,
                required inputBytes,
                required acceptedInputShapes,
              }) async => modelPath.contains('model-version-2')
              ? (
                  error: null,
                  outputs: [
                    (
                      shape: [1, 1, 4],
                      values: Float32List.fromList([0.1, 0.2, 0.8, 0.9]),
                    ),
                    (shape: [1, 1], values: Float32List.fromList([0.95])),
                    (shape: [1, 1], values: Float32List.fromList([0])),
                    (shape: [1], values: Float32List.fromList([1])),
                  ],
                )
              : (
                  error: null,
                  outputs: [
                    (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                  ],
                ),
        );

        final result = await client.run('workflow-1', pngBytes());

        final combined = result.outputs['Resultado']! as CombinedWorkflowResult;
        expect(combined.nodeId, 'output-1');
        expect(combined.values, hasLength(4));
        expect(combined.values[0], isA<ClassificationResult>());
        expect(combined.values[0].nodeId, 'model-1');
        expect(combined.values[1], isA<DetectionResult>());
        expect(combined.values[1].nodeId, 'model-2');
        expect(combined.values[2], isA<BooleanResult>());
        expect(combined.values[2].nodeId, 'condition-1');
        expect((combined.values[2] as BooleanResult).value, isTrue);
        expect(combined.values[3], isA<BooleanResult>());
        expect(combined.values[3].nodeId, 'condition-2');
        expect((combined.values[3] as BooleanResult).value, isFalse);

        (definition['connections'] as List).removeWhere(
          (connection) => connection['targetNodeId'] == 'model-2',
        );
        await installWorkflowFiles(
          storageDirectory: storageDirectory,
          inventoryJson: jsonEncode(inventory),
          workflowVersionId: 'workflow-version-1.0.0',
          definitionJson: jsonEncode(definition),
        );
        await expectLater(
          client.run('workflow-1', pngBytes()),
          throwsWorkflowError(
            category: WorkflowErrorCategory.outputInputMissing,
            nodeId: 'output-1',
          ),
        );
      },
    );
  });

  group('Workflow execution cancellation', () {
    test('reports executionNotFound for an unknown identifier', () {
      expect(
        () => sdk().cancelExecution('missing-execution'),
        throwsWorkflowError(category: WorkflowErrorCategory.executionNotFound),
      );
    });

    test('cancels one active run without affecting another run', () async {
      await installWorkflow();
      await installModelArtifact();
      final started = [Completer<void>(), Completer<void>()];
      final releaseInference = [Completer<void>(), Completer<void>()];
      var inferenceCount = 0;
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
              final index = inferenceCount++;
              started[index].complete();
              await releaseInference[index].future;
              return (
                error: null,
                outputs: [
                  (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                ],
              );
            },
      );
      final ids = <String>[];
      final cancelledRun = client.run(
        'workflow-1',
        pngBytes(),
        onExecutionStarted: ids.add,
      );
      await started[0].future;
      client.cancelExecution(ids.single);

      final unaffectedRun = client.run(
        'workflow-1',
        pngBytes(),
        onExecutionStarted: ids.add,
      );
      await started[1].future;
      releaseInference[0].complete();
      await expectLater(
        cancelledRun,
        throwsWorkflowError(category: WorkflowErrorCategory.cancelled),
      );
      releaseInference[1].complete();
      final result = await unaffectedRun;

      expect(result.executionId, ids.last);
      expect(result.outputs, contains('Resultado'));
      expect(ids.toSet(), hasLength(2));
      expect(
        () => client.cancelExecution(ids.first),
        throwsWorkflowError(category: WorkflowErrorCategory.executionNotFound),
      );
    });
  });

  group('WorkflowError from AyniSdk.run', () {
    test(
      'reports outputNotReached instead of returning an empty success',
      () async {
        final inventory = jsonDecode(_inventory()) as Map<String, dynamic>;
        (inventory['workflows'] as List).first['modelVersionIds'] = <String>[];
        (inventory['models'] as List).clear();
        final definition = {
          'schemaVersion': '1',
          'nodes': [
            {
              'id': 'input-1',
              'type': 'input.image',
              'outputs': {'imagen': 'image'},
            },
          ],
          'connections': <Object>[],
        };
        await installWorkflowFiles(
          storageDirectory: storageDirectory,
          inventoryJson: jsonEncode(inventory),
          workflowVersionId: 'workflow-version-1.0.0',
          definitionJson: jsonEncode(definition),
        );

        await expectLater(
          sdk().run('workflow-1', pngBytes()),
          throwsWorkflowError(category: WorkflowErrorCategory.outputNotReached),
        );
      },
    );

    test('reports a workflow that was never installed on the device', () async {
      final client = sdk();
      final Future<WorkflowResult> pending = client.run(
        'workflow-1',
        pngBytes(),
      );

      await expectLater(
        pending,
        throwsWorkflowError(
          category: WorkflowErrorCategory.workflowNotAvailable,
        ),
      );
    });

    test('reports an image that cannot be decoded as invalidInput', () async {
      await installWorkflow();
      final client = sdk();
      final Future<WorkflowResult> pending = client.run(
        'workflow-1',
        Uint8List.fromList(utf8.encode('no es una imagen')),
      );

      await expectLater(
        pending,
        throwsWorkflowError(category: WorkflowErrorCategory.invalidInput),
      );
    });

    test(
      'does not run inference for an image that cannot be decoded',
      () async {
        await installWorkflow();
        await installModelArtifact();
        var inferenceStarted = false;
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
                inferenceStarted = true;
                return (
                  error: null,
                  outputs: [
                    (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                  ],
                );
              },
        );

        await expectLater(
          client.run('workflow-1', Uint8List.fromList(utf8.encode('no image'))),
          throwsWorkflowError(category: WorkflowErrorCategory.invalidInput),
        );
        expect(inferenceStarted, isFalse);
      },
    );

    test('rejects an unsupported image contract before inference', () async {
      final definition = jsonDecode(_definition()) as Map<String, dynamic>;
      final model = (definition['nodes'] as List).cast<Map>().firstWhere(
        (node) => node['type'] == 'model.tflite',
      );
      ((model['inputs'] as Map)['image'] as Map)['channels'] = 2;
      await installWorkflowFiles(
        storageDirectory: storageDirectory,
        inventoryJson: _inventory(),
        workflowVersionId: 'workflow-version-1.0.0',
        definitionJson: jsonEncode(definition),
      );
      await installModelArtifact();
      var inferenceStarted = false;
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
              inferenceStarted = true;
              return (
                error: null,
                outputs: [
                  (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                ],
              );
            },
      );

      await expectLater(
        client.run('workflow-1', pngBytes()),
        throwsWorkflowError(
          category: WorkflowErrorCategory.unsupportedInputContract,
          nodeId: 'model-1',
        ),
      );
      expect(inferenceStarted, isFalse);
    });

    test('keeps the app image bytes unchanged after preprocessing', () async {
      await installWorkflow();
      await installModelArtifact();
      final input = pngBytes();
      final original = Uint8List.fromList(input);
      final client = createAyniSdkForTesting(
        serverUrl: Uri.parse('https://sdk.example.test'),
        credential: 'ayni_sk_test',
        storageDirectory: storageDirectory,
        workflowInferenceRunner:
            ({
              required modelPath,
              required inputBytes,
              required acceptedInputShapes,
            }) async => (
              error: null,
              outputs: [
                (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
              ],
            ),
      );

      await client.run('workflow-1', input);

      expect(input, equals(original));
    });

    test('reports a missing model artifact with its version', () async {
      await installWorkflow();
      final client = sdk();
      final Future<WorkflowResult> pending = client.run(
        'workflow-1',
        pngBytes(),
      );

      await expectLater(
        pending,
        throwsWorkflowError(
          category: WorkflowErrorCategory.modelNotAvailable,
          modelVersionId: 'model-version-1',
        ),
      );
    });

    test(
      'does not load a model artifact whose installed hash changed',
      () async {
        await installWorkflow();
        await installModelArtifact();
        await File(
          '${storageDirectory.path}/model-version-1/model-version-1.tflite',
        ).writeAsString('tampered model');
        var inferenceStarted = false;
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
                inferenceStarted = true;
                return (
                  error: null,
                  outputs: [
                    (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                  ],
                );
              },
        );

        await expectLater(
          client.run('workflow-1', pngBytes()),
          throwsWorkflowError(
            category: WorkflowErrorCategory.modelNotAvailable,
            modelVersionId: 'model-version-1',
          ),
        );
        expect(inferenceStarted, isFalse);
      },
    );

    test('uses the verified model artifact from local storage', () async {
      await installWorkflow();
      await installModelArtifact();
      String? loadedModelPath;
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
              loadedModelPath = modelPath;
              expect(
                await File(modelPath).readAsString(),
                'deterministic test model',
              );
              return (
                error: null,
                outputs: [
                  (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                ],
              );
            },
      );

      await client.run('workflow-1', pngBytes());

      expect(
        loadedModelPath,
        '${storageDirectory.path}/model-version-1/model-version-1.tflite',
      );
    });

    test(
      'redacts unexpected runtime details from the typed model error',
      () async {
        await installWorkflow();
        await installModelArtifact();
        await TelemetryPolicyStore(
          storageDirectory,
        ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));
        const privateDetail = 'C:\\private\\secret-token';
        final context = WorkflowTraceContext(
          runId: 'validation-run-9',
          repetition: 2,
        );
        final client = createAyniSdkForTesting(
          serverUrl: Uri.parse('https://sdk.example.test'),
          credential: 'ayni_sk_test',
          storageDirectory: storageDirectory,
          workflowInferenceRunner:
              ({
                required modelPath,
                required inputBytes,
                required acceptedInputShapes,
              }) async => throw StateError(privateDetail),
        );

        final error = await client
            .run('workflow-1', pngBytes(), traceContext: context)
            .then<WorkflowError?>(
              (_) => null,
              onError: (Object exception) =>
                  exception is WorkflowError ? exception : null,
            );

        expect(error, isNotNull);
        expect(error!.category, WorkflowErrorCategory.runtimeError);
        expect(error.nodeId, 'model-1');
        expect(error.modelVersionId, 'model-version-1');
        expect(error.toString(), isNot(contains(privateDetail)));
        final trace = error.trace!;
        expect(trace.status, 'error');
        expect(trace.runId, 'validation-run-9');
        expect(trace.repetition, 2);
        expect(trace.workflowId, 'workflow-1');
        expect(trace.workflowVersionId, 'workflow-version-1.0.0');
        expect(trace.error, {
          'category': 'runtimeError',
          'nodeId': 'model-1',
          'modelVersionId': 'model-version-1',
        });
        final failedNode = trace.nodes.singleWhere(
          (node) => node.nodeId == 'model-1',
        );
        expect(failedNode.status, 'failed');
        expect(failedNode.modelVersionId, 'model-version-1');
        expect(trace.models.single.modelVersionId, 'model-version-1');
        final serialized = jsonEncode(trace.toJson());
        expect(serialized, isNot(contains(privateDetail)));
        expect(serialized, isNot(contains('model-version-1.tflite')));
        expect(serialized, isNot(contains(base64Encode(pngBytes()))));
      },
    );

    test(
      'rejects an installed workflow with unsupported schemaVersion before checking models',
      () async {
        final unsupportedDef = jsonEncode({
          'schemaVersion': '5',
          'nodes': [
            {
              'id': 'input-1',
              'type': 'input.image',
              'outputs': {'imagen': 'image'},
            },
          ],
          'connections': [],
        });
        await installWorkflowFiles(
          storageDirectory: storageDirectory,
          inventoryJson: _inventory(),
          workflowVersionId: 'workflow-version-1.0.0',
          definitionJson: unsupportedDef,
        );
        final client = sdk();
        final Future<WorkflowResult> pending = client.run(
          'workflow-1',
          pngBytes(),
        );

        await expectLater(
          pending,
          throwsWorkflowError(category: WorkflowErrorCategory.invalidWorkflow),
        );
      },
    );

    test(
      'accepts an installed legacy workflow definition that omits schemaVersion',
      () async {
        final legacyDef = jsonEncode({
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
        await installWorkflowFiles(
          storageDirectory: storageDirectory,
          inventoryJson: _inventory(),
          workflowVersionId: 'workflow-version-1.0.0',
          definitionJson: legacyDef,
        );
        final client = sdk();
        final Future<WorkflowResult> pending = client.run(
          'workflow-1',
          pngBytes(),
        );

        await expectLater(
          pending,
          throwsWorkflowError(
            category: WorkflowErrorCategory.modelNotAvailable,
            modelVersionId: 'model-version-1',
          ),
        );
      },
    );
  });

  test(
    'runs a reverse-listed DAG, preprocesses pixels, and maps classification',
    () async {
      await installModelArtifact();

      final source = img.Image(width: 1, height: 1)
        ..setPixelRgb(0, 0, 255, 0, 0);
      final seen = <List<double>>[];
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
              expect(acceptedInputShapes, [
                [1, 224, 224, 3],
                [224, 224, 3],
              ]);
              seen.add(Float32List.view(inputBytes.buffer).take(3).toList());
              return (
                error: null,
                outputs: [
                  (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                ],
              );
            },
      );

      for (final normalization in ['none', 'zero_to_one', 'minus_one_to_one']) {
        final definition = jsonDecode(_definition()) as Map<String, dynamic>;
        final nodes = (definition['nodes'] as List).cast<Map>();
        definition['nodes'] = [nodes[1], nodes[0], nodes[2]];
        ((nodes[1]['inputs'] as Map)['image'] as Map)['normalization'] =
            normalization;
        await installWorkflowFiles(
          storageDirectory: storageDirectory,
          inventoryJson: _inventory(),
          workflowVersionId: 'workflow-version-1.0.0',
          definitionJson: jsonEncode(definition),
        );
        final result = await client.run(
          'workflow-1',
          Uint8List.fromList(img.encodePng(source)),
        );

        expect(result.workflowId, 'workflow-1');
        expect(result.workflowVersion, '1.0.0');
        final classification =
            result.outputs['Resultado']! as ClassificationResult;
        expect(classification.nodeId, 'model-1');
        expect(classification.label, 'gato');
        expect(classification.confidence, closeTo(0.9, 0.000001));
        expect(classification.confidences['perro'], closeTo(0.1, 0.000001));
        expect(classification.confidences['gato'], closeTo(0.9, 0.000001));
      }
      expect(seen[0], [255, 0, 0]);
      expect(seen[1], [1, 0, 0]);
      expect(seen[2], [1, -1, -1]);
    },
  );

  test('executes stored DAG dependencies before their consumers', () async {
    await installModelArtifact();
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final nodes = (definition['nodes'] as List).cast<Map>();
    final input = nodes.firstWhere((node) => node['type'] == 'input.image');
    final model = nodes.firstWhere((node) => node['type'] == 'model.tflite');
    final output = nodes.firstWhere((node) => node['type'] == 'output');
    final alternateOutput = Map<String, Object>.from(output)
      ..['id'] = 'output-false'
      ..['name'] = 'No apto';
    output
      ..['sourceNodeId'] = 'condition-1'
      ..['sourcePort'] = 'true'
      ..['resultType'] = 'boolean'
      ..['name'] = 'Apto';
    final condition = {
      'id': 'condition-1',
      'type': 'condition',
      'sourceNodeId': 'model-1',
      'label': 'gato',
      'operator': 'gte',
      'threshold': 0.5,
      'branches': {'true': 'Verdadero', 'false': 'Falso'},
    };
    definition['nodes'] = [alternateOutput, output, condition, model, input];
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: jsonEncode(definition),
    );
    final client = createAyniSdkForTesting(
      serverUrl: Uri.parse('https://sdk.example.test'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      workflowInferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
            ],
          ),
    );

    final result = await client.run('workflow-1', pngBytes());

    final branchResult = result.outputs['Apto']! as BooleanResult;
    expect(branchResult.nodeId, 'condition-1');
    expect(branchResult.value, isTrue);
  });

  test('evaluates condition operators and traces skipped nodes', () async {
    await installModelArtifact();
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final nodes = (definition['nodes'] as List).cast<Map>();
    final input = nodes.firstWhere((node) => node['type'] == 'input.image');
    final model = nodes.firstWhere((node) => node['type'] == 'model.tflite');
    final output = nodes.firstWhere((node) => node['type'] == 'output');
    final alternateOutput = Map<String, Object>.from(output)
      ..['id'] = 'output-false'
      ..['name'] = 'No apto';
    final condition = {
      'id': 'condition-1',
      'type': 'condition',
      'sourceNodeId': 'model-1',
      'label': 'gato',
      'threshold': 1.0,
      'branches': {'true': 'Verdadero', 'false': 'Falso'},
    };
    definition['nodes'] = [alternateOutput, output, condition, model, input];
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: jsonEncode(definition),
    );
    await TelemetryPolicyStore(
      storageDirectory,
    ).write(const TelemetryPolicy(enabled: true, retentionDays: 30));
    final traceContext = WorkflowTraceContext(
      runId: 'validation-run-10',
      repetition: 1,
    );
    final client = createAyniSdkForTesting(
      serverUrl: Uri.parse('https://sdk.example.test'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      workflowInferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              (shape: [1, 2], values: Float32List.fromList([0, 1])),
            ],
          ),
    );

    for (final (operator, expected) in [
      ('gte', true),
      ('gt', false),
      ('lte', true),
      ('lt', false),
    ]) {
      condition['operator'] = operator;
      output
        ..['sourceNodeId'] = 'condition-1'
        ..['sourcePort'] = 'true'
        ..['resultType'] = 'boolean';
      alternateOutput
        ..['sourceNodeId'] = 'condition-1'
        ..['sourcePort'] = 'false'
        ..['resultType'] = 'boolean';
      await installWorkflowFiles(
        storageDirectory: storageDirectory,
        inventoryJson: _inventory(),
        workflowVersionId: 'workflow-version-1.0.0',
        definitionJson: jsonEncode(definition),
      );

      final result = await client.run(
        'workflow-1',
        pngBytes(),
        traceContext: traceContext,
      );
      final selectedName = expected ? 'Resultado' : 'No apto';
      expect(result.outputs.keys, {selectedName});
      expect((result.outputs[selectedName]! as BooleanResult).value, expected);
      final skippedNode = result.trace!.nodes.singleWhere(
        (node) => node.nodeId == (expected ? 'output-false' : 'output-1'),
      );
      expect(skippedNode.status, 'skipped');
      expect(skippedNode.durationMs, isNull);
      final executedNode = result.trace!.nodes.singleWhere(
        (node) => node.nodeId == (expected ? 'output-1' : 'output-false'),
      );
      expect(executedNode.status, 'completed');
      expect(executedNode.durationMs, isNotNull);
    }
  });

  test('reports a missing condition value with its node', () async {
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final nodes = (definition['nodes'] as List).cast<Map>();
    final input = nodes.firstWhere((node) => node['type'] == 'input.image');
    final model = nodes.firstWhere((node) => node['type'] == 'model.tflite');
    final output = nodes.firstWhere((node) => node['type'] == 'output')
      ..['sourceNodeId'] = 'condition-1'
      ..['sourcePort'] = 'true'
      ..['resultType'] = 'boolean';
    final condition = {
      'id': 'condition-1',
      'type': 'condition',
      'sourceNodeId': 'model-1',
      'label': 'no-declarada',
      'operator': 'gte',
      'threshold': 0.5,
      'branches': {'true': 'Verdadero', 'false': 'Falso'},
    };
    final executor = WorkflowExecutor(
      storageDirectory,
      inferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
            ],
          ),
    );

    await expectLater(
      executor.execute(
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowVersion: '1.0.0',
        definition: {
          ...definition,
          'nodes': [output, condition, model, input],
        },
        imageBytes: pngBytes(),
      ),
      throwsWorkflowError(
        category: WorkflowErrorCategory.conditionInputMissing,
        nodeId: 'condition-1',
      ),
    );
  });

  test('skips a capture whose condition cannot be evaluated without failing '
      'the run (US-074)', () async {
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final nodes = (definition['nodes'] as List).cast<Map>();
    final input = nodes.firstWhere((node) => node['type'] == 'input.image');
    final model = nodes.firstWhere((node) => node['type'] == 'model.tflite');
    final output = nodes.firstWhere((node) => node['type'] == 'output');
    final condition = {
      'id': 'condition-1',
      'type': 'condition',
      'sourceNodeId': 'model-1',
      'label': 'no-declarada',
      'operator': 'gte',
      'threshold': 0.5,
      'branches': {'true': 'Verdadero', 'false': 'Falso'},
    };
    final capture = {
      'id': 'capture-1',
      'type': 'dataset.capture',
      'inputs': {'imagen': 'image', 'resultado': 'inferenceResult'},
    };
    Map<String, String> connect(
      String source,
      String sourcePort,
      String target,
      String targetPort,
    ) => {
      'sourceNodeId': source,
      'sourcePort': sourcePort,
      'targetNodeId': target,
      'targetPort': targetPort,
    };
    final executor = WorkflowExecutor(
      storageDirectory,
      inferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
            ],
          ),
    );
    final captures = <WorkflowCapture>[];
    final statuses = <String, String>{};

    final result = await executor.execute(
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      workflowVersion: '1.0.0',
      definition: {
        ...definition,
        'nodes': [input, model, output, condition, capture],
        'connections': [
          ...(definition['connections'] as List),
          connect(input['id'] as String, 'imagen', 'capture-1', 'imagen'),
          connect('model-1', 'result', 'capture-1', 'resultado'),
          connect('condition-1', 'true', 'capture-1', 'condicion'),
        ],
      },
      imageBytes: pngBytes(),
      onCapture: captures.add,
      onNodeFinished: (node) => statuses[node.nodeId] = node.status,
    );

    expect(result.outputs, contains(output['name']));
    expect(captures, isEmpty);
    expect(statuses['condition-1'], 'skipped');
    expect(statuses['capture-1'], 'skipped');
  });

  test(
    'rejects a missing selected route before unrelated model inference',
    () async {
      await installModelArtifact();
      final inventory = jsonDecode(_inventory()) as Map<String, dynamic>;
      (inventory['workflows'] as List).first['modelVersionIds'].add(
        'model-version-2',
      );
      (inventory['models'] as List).add({
        'modelVersionId': 'model-version-2',
        'version': '1.0.0',
        'sha256': 'a' * 64,
      });
      final definition = jsonDecode(_definition()) as Map<String, dynamic>;
      final nodes = (definition['nodes'] as List).cast<Map>();
      final input = nodes.firstWhere((node) => node['type'] == 'input.image');
      final model = nodes.firstWhere((node) => node['type'] == 'model.tflite');
      final unrelatedModel = Map<String, Object>.from(model)
        ..['id'] = 'model-2'
        ..['modelVersionId'] = 'model-version-2'
        ..['modelName'] = 'Modelo independiente';
      final output = nodes.firstWhere((node) => node['type'] == 'output')
        ..['sourceNodeId'] = 'condition-1'
        ..['sourcePort'] = 'false'
        ..['resultType'] = 'boolean';
      final condition = {
        'id': 'condition-1',
        'type': 'condition',
        'sourceNodeId': 'model-1',
        'label': 'gato',
        'operator': 'gte',
        'threshold': 0.5,
        'branches': {'true': 'Verdadero', 'false': 'Falso'},
      };
      final unrelatedCondition = {
        ...condition,
        'id': 'condition-2',
        'sourceNodeId': 'model-2',
      };
      definition['nodes'] = [
        input,
        unrelatedModel,
        output,
        condition,
        model,
        unrelatedCondition,
      ];
      final connections = (definition['connections'] as List).cast<Map>();
      definition['connections'] = [
        {
          'sourceNodeId': 'input-1',
          'sourcePort': 'imagen',
          'targetNodeId': 'model-2',
          'targetPort': 'image',
        },
        ...connections,
      ];
      await installWorkflowFiles(
        storageDirectory: storageDirectory,
        inventoryJson: jsonEncode(inventory),
        workflowVersionId: 'workflow-version-1.0.0',
        definitionJson: jsonEncode(definition),
      );
      final inferredModels = <String>[];
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
              inferredModels.add(
                modelPath.contains('model-version-1.tflite')
                    ? 'model-version-1'
                    : 'model-version-2',
              );
              return (
                error: null,
                outputs: [
                  (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
                ],
              );
            },
      );

      await expectLater(
        client.run('workflow-1', pngBytes()),
        throwsWorkflowError(
          category: WorkflowErrorCategory.invalidWorkflow,
          nodeId: 'condition-1',
        ),
      );
      expect(inferredModels, ['model-version-1']);
    },
  );

  test('rejects a cyclic installed workflow before inference', () async {
    await installModelArtifact();
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final nodes = (definition['nodes'] as List).cast<Map>();
    final output = nodes.firstWhere((node) => node['type'] == 'output');
    output
      ..['sourceNodeId'] = 'condition-1'
      ..['sourcePort'] = 'true'
      ..['resultType'] = 'boolean';
    nodes.add({
      'id': 'condition-1',
      'type': 'condition',
      'sourceNodeId': 'condition-1',
      'label': 'gato',
      'operator': 'gte',
      'threshold': 0.5,
      'branches': {'true': 'Verdadero', 'false': 'Falso'},
    });
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: jsonEncode(definition),
    );
    var inferenceStarted = false;
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
            inferenceStarted = true;
            return (
              error: null,
              outputs: [
                (shape: [1, 2], values: Float32List.fromList([0.1, 0.9])),
              ],
            );
          },
    );

    await expectLater(
      client.run('workflow-1', pngBytes()),
      throwsWorkflowError(category: WorkflowErrorCategory.invalidWorkflow),
    );
    expect(inferenceStarted, isFalse);
  });

  test('rejects a classification contract without labels', () async {
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final model = (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'model.tflite',
    );
    ((model['outputs'] as Map)['result'] as Map)['labels'] = <String>[];
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: jsonEncode(definition),
    );
    await installModelArtifact();
    final client = createAyniSdkForTesting(
      serverUrl: Uri.parse('https://sdk.example.test'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      workflowInferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              (shape: [1, 0], values: Float32List(0)),
            ],
          ),
    );

    await expectLater(
      client.run('workflow-1', pngBytes()),
      throwsWorkflowError(
        category: WorkflowErrorCategory.modelOutputInvalid,
        nodeId: 'model-1',
        modelVersionId: 'model-version-1',
      ),
    );
  });

  test('returns only valid normalized detection boxes', () async {
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final model = (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'model.tflite',
    );
    ((model['outputs'] as Map)['result'] as Map)
      ..['type'] = 'detection'
      ..['labels'] = ['mancha']
      ..['scoreThreshold'] = 0.5;
    (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'output',
    )['resultType'] = 'detection';
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: jsonEncode(definition),
    );
    await installModelArtifact();
    final client = createAyniSdkForTesting(
      serverUrl: Uri.parse('https://sdk.example.test'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      workflowInferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              (
                shape: [1, 2, 4],
                values: Float32List.fromList([
                  0.1,
                  0.2,
                  0.4,
                  0.5,
                  0.1,
                  -0.1,
                  0.4,
                  0.5,
                ]),
              ),
              (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
              (shape: [1, 2], values: Float32List.fromList([0, 0])),
              (shape: [1], values: Float32List.fromList([2])),
            ],
          ),
    );

    final result = await client.run('workflow-1', pngBytes());
    final detection = result.outputs['Resultado']! as DetectionResult;
    expect(detection.detections, hasLength(1));
    expect(detection.detections.single.label, 'mancha');
    expect(detection.detections.single.confidence, closeTo(0.95, 1e-6));
    expect(detection.detections.single.xMin, closeTo(0.2, 1e-6));
    expect(detection.detections.single.yMin, closeTo(0.1, 1e-6));
    expect(detection.detections.single.xMax, closeTo(0.5, 1e-6));
    expect(detection.detections.single.yMax, closeTo(0.4, 1e-6));
  });

  test(
    'decodes mapped detection outputs in the declared tensor order',
    () async {
      final result = await runDetectionWithTensors(
        tensorIndices: const {
          'boxes': 0,
          'classes': 2,
          'scores': 1,
          'count': 3,
        },
        outputs: [
          (
            shape: [1, 2, 4],
            values: Float32List.fromList([
              0.1,
              0.2,
              0.4,
              0.5,
              0.2,
              0.3,
              0.6,
              0.7,
            ]),
          ),
          (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
          (shape: [1, 2], values: Float32List.fromList([0, 1])),
          (shape: [1, 1], values: Float32List.fromList([2])),
        ],
      );

      final detections =
          (result.outputs['Resultado']! as DetectionResult).detections;
      expect(detections.map((detection) => detection.label), [
        'mancha',
        'roya',
      ]);
      expect(detections.first.confidence, closeTo(0.95, 1e-6));
      expect(detections.first.xMin, closeTo(0.2, 1e-6));
      expect(detections.first.yMin, closeTo(0.1, 1e-6));
      expect(detections.first.xMax, closeTo(0.5, 1e-6));
      expect(detections.first.yMax, closeTo(0.4, 1e-6));
    },
  );

  test(
    'decodes mapped detection outputs when roles are in a different order',
    () async {
      final result = await runDetectionWithTensors(
        tensorIndices: const {
          'boxes': 2,
          'classes': 0,
          'scores': 3,
          'count': 1,
        },
        outputs: [
          (shape: [1, 2], values: Float32List.fromList([0, 1])),
          (shape: [1], values: Float32List.fromList([2])),
          (
            shape: [1, 2, 4],
            values: Float32List.fromList([
              0.1,
              0.2,
              0.4,
              0.5,
              0.2,
              0.3,
              0.6,
              0.7,
            ]),
          ),
          (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
        ],
      );

      final detections =
          (result.outputs['Resultado']! as DetectionResult).detections;
      expect(detections.map((detection) => detection.label), [
        'mancha',
        'roya',
      ]);
      expect(detections.first.confidence, closeTo(0.95, 1e-6));
      expect(detections.first.xMin, closeTo(0.2, 1e-6));
      expect(detections.first.yMin, closeTo(0.1, 1e-6));
      expect(detections.first.xMax, closeTo(0.5, 1e-6));
      expect(detections.first.yMax, closeTo(0.4, 1e-6));
    },
  );

  test('uses the count tensor to truncate detection vectors', () async {
    final result = await runDetectionWithTensors(
      tensorIndices: const {'boxes': 2, 'classes': 0, 'scores': 3, 'count': 1},
      outputs: [
        (shape: [1, 2], values: Float32List.fromList([0, 99])),
        (shape: [1], values: Float32List.fromList([1])),
        (
          shape: [1, 2, 4],
          values: Float32List.fromList([
            0.1,
            0.2,
            0.4,
            0.5,
            0.2,
            0.3,
            0.1,
            0.7,
          ]),
        ),
        (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
      ],
    );

    final detections =
        (result.outputs['Resultado']! as DetectionResult).detections;
    expect(detections, hasLength(1));
    expect(detections.single.label, 'mancha');
  });

  test('returns no detections when the count tensor is zero', () async {
    final result = await runDetectionWithTensors(
      tensorIndices: const {'boxes': 2, 'classes': 0, 'scores': 3, 'count': 1},
      outputs: [
        (shape: [1, 2], values: Float32List.fromList([0, 1])),
        (shape: [1], values: Float32List.fromList([0])),
        (
          shape: [1, 2, 4],
          values: Float32List.fromList([
            0.1,
            0.2,
            0.4,
            0.5,
            0.2,
            0.3,
            0.6,
            0.7,
          ]),
        ),
        (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
      ],
    );

    expect(
      (result.outputs['Resultado']! as DetectionResult).detections,
      isEmpty,
    );
  });

  test('rejects invalid mapped detection counts', () async {
    for (final count in [-1.0, 1.5, 3.0]) {
      await expectLater(
        runDetectionWithTensors(
          tensorIndices: const {
            'boxes': 2,
            'classes': 0,
            'scores': 3,
            'count': 1,
          },
          outputs: [
            (shape: [1, 2], values: Float32List.fromList([0, 1])),
            (shape: [1], values: Float32List.fromList([count])),
            (
              shape: [1, 2, 4],
              values: Float32List.fromList([
                0.1,
                0.2,
                0.4,
                0.5,
                0.2,
                0.3,
                0.6,
                0.7,
              ]),
            ),
            (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
          ],
        ),
        throwsWorkflowError(
          category: WorkflowErrorCategory.modelOutputInvalid,
          nodeId: 'model-1',
          modelVersionId: 'model-version-1',
        ),
      );
    }
  });

  test('rejects malformed mapped box, vector, and count shapes', () async {
    final malformedOutputs = [
      <({List<int> shape, Float32List values})>[
        (
          shape: [1, 2, 3],
          values: Float32List.fromList([0.1, 0.2, 0.4, 0.5, 0.2, 0.3]),
        ),
        (shape: [1], values: Float32List.fromList([2])),
        (shape: [1, 2], values: Float32List.fromList([0, 1])),
        (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
      ],
      <({List<int> shape, Float32List values})>[
        (
          shape: [1, 2, 4],
          values: Float32List.fromList([
            0.1,
            0.2,
            0.4,
            0.5,
            0.2,
            0.3,
            0.6,
            0.7,
          ]),
        ),
        (shape: [1], values: Float32List.fromList([2])),
        (shape: [1, 1], values: Float32List.fromList([0])),
        (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
      ],
      <({List<int> shape, Float32List values})>[
        (
          shape: [1, 2, 4],
          values: Float32List.fromList([
            0.1,
            0.2,
            0.4,
            0.5,
            0.2,
            0.3,
            0.6,
            0.7,
          ]),
        ),
        (shape: [1, 2], values: Float32List.fromList([2, 2])),
        (shape: [1, 2], values: Float32List.fromList([0, 1])),
        (shape: [1, 2], values: Float32List.fromList([0.95, 0.9])),
      ],
    ];

    for (final outputs in malformedOutputs) {
      await expectLater(
        runDetectionWithTensors(
          tensorIndices: const {
            'boxes': 2,
            'classes': 0,
            'scores': 3,
            'count': 1,
          },
          outputs: outputs,
        ),
        throwsWorkflowError(
          category: WorkflowErrorCategory.modelOutputInvalid,
          nodeId: 'model-1',
          modelVersionId: 'model-version-1',
        ),
      );
    }
  });

  test('reports invalid detections when no valid box remains', () async {
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final model = (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'model.tflite',
    );
    ((model['outputs'] as Map)['result'] as Map)
      ..['type'] = 'detection'
      ..['labels'] = ['mancha']
      ..['scoreThreshold'] = 0.5;
    (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'output',
    )['resultType'] = 'detection';
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: jsonEncode(definition),
    );
    await installModelArtifact();
    final client = createAyniSdkForTesting(
      serverUrl: Uri.parse('https://sdk.example.test'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      workflowInferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              (
                shape: [1, 1, 4],
                values: Float32List.fromList([0.1, -0.1, 0.4, 0.5]),
              ),
              (shape: [1, 1], values: Float32List.fromList([0.95])),
              (shape: [1, 1], values: Float32List.fromList([0])),
              (shape: [1], values: Float32List.fromList([1])),
            ],
          ),
    );

    await expectLater(
      client.run('workflow-1', pngBytes()),
      throwsWorkflowError(
        category: WorkflowErrorCategory.modelOutputInvalid,
        nodeId: 'model-1',
        modelVersionId: 'model-version-1',
      ),
    );
  });

  test('reports invalid detection output when labels are empty', () async {
    final definition = jsonDecode(_definition()) as Map<String, dynamic>;
    final model = (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'model.tflite',
    );
    ((model['outputs'] as Map)['result'] as Map)
      ..['type'] = 'detection'
      ..['labels'] = <String>[]
      ..['scoreThreshold'] = 0.5;
    (definition['nodes'] as List).cast<Map>().firstWhere(
      (node) => node['type'] == 'output',
    )['resultType'] = 'detection';
    await installWorkflowFiles(
      storageDirectory: storageDirectory,
      inventoryJson: _inventory(),
      workflowVersionId: 'workflow-version-1.0.0',
      definitionJson: jsonEncode(definition),
    );
    await installModelArtifact();
    final client = createAyniSdkForTesting(
      serverUrl: Uri.parse('https://sdk.example.test'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      workflowInferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              (
                shape: [1, 1, 4],
                values: Float32List.fromList([0.1, 0.1, 0.4, 0.5]),
              ),
              (shape: [1, 1], values: Float32List.fromList([0.1])),
              (shape: [1, 1], values: Float32List.fromList([0])),
              (shape: [1], values: Float32List.fromList([1])),
            ],
          ),
    );

    await expectLater(
      client.run('workflow-1', pngBytes()),
      throwsWorkflowError(
        category: WorkflowErrorCategory.modelOutputInvalid,
        nodeId: 'model-1',
        modelVersionId: 'model-version-1',
      ),
    );
  });

  group('segmentation output (US-160)', () {
    const labels = ['fondo', 'hoja', 'tallo'];

    Map<String, dynamic> segmentationDefinition({
      String scoreType = 'logits',
      List<String> modelLabels = labels,
      String schemaVersion = '4',
    }) {
      final definition = jsonDecode(_definition()) as Map<String, dynamic>;
      definition['schemaVersion'] = schemaVersion;
      final nodes = (definition['nodes'] as List).cast<Map>();
      final model = nodes.firstWhere((node) => node['type'] == 'model.tflite');
      (model['outputs'] as Map)['result'] = {
        'type': 'segmentation',
        'labels': modelLabels,
        'scoreType': scoreType,
      };
      nodes.firstWhere((node) => node['type'] == 'output')['resultType'] =
          'segmentation';
      return definition;
    }

    Future<WorkflowResult> runSegmentation(
      List<_Tensor> tensors, {
      String scoreType = 'logits',
      List<String> modelLabels = labels,
    }) =>
        WorkflowExecutor(
          storageDirectory,
          inferenceRunner:
              ({
                required modelPath,
                required inputBytes,
                required acceptedInputShapes,
              }) async => (error: null, outputs: tensors),
        ).execute(
          executionId: 'execution-1',
          workflowId: 'workflow-1',
          workflowVersion: '1.0.0',
          definition: segmentationDefinition(
            scoreType: scoreType,
            modelLabels: modelLabels,
          ),
          imageBytes: pngBytes(),
        );

    _Tensor tensor(List<int> shape, List<double> values) =>
        (shape: shape, values: Float32List.fromList(values));

    Future<SegmentationResult> decode(
      List<_Tensor> tensors, {
      String scoreType = 'logits',
    }) async {
      final result = await runSegmentation(tensors, scoreType: scoreType);
      return result.outputs['Resultado']! as SegmentationResult;
    }

    double softmaxWinner(List<double> logits) {
      final top = logits.reduce(math.max);
      return 1 / logits.fold<double>(0, (sum, l) => sum + math.exp(l - top));
    }

    // 2x2 logits: a three-way tie, a clear leaf, a stem and a tie between the
    // two highest logits.
    const logitPixels = [
      [0.0, 0.0, 0.0],
      [0.0, 5.0, 1.0],
      [-1.0, -1.0, 3.0],
      [2.0, 2.0, 0.0],
    ];
    _Tensor logitTensor() =>
        tensor([1, 2, 2, 3], [for (final pixel in logitPixels) ...pixel]);

    test(
      'decodes the argmax, area fractions and confidence of logits',
      () async {
        final result = await decode([logitTensor()]);

        expect(result.nodeId, 'model-1');
        expect(result.width, 2);
        expect(result.height, 2);
        expect(result.labels, labels);
        // The tie of three goes to index 0, the tie of two to the lower one.
        expect(result.mask, [0, 1, 2, 0]);
        expect(result.areaFractions, {
          'fondo': 0.5,
          'hoja': 0.25,
          'tallo': 0.25,
        });
        expect(
          result.areaFractions.values.reduce((a, b) => a + b),
          closeTo(1, 1e-12),
        );
        final expected =
            logitPixels.map(softmaxWinner).reduce((a, b) => a + b) / 4;
        expect(result.confidence, closeTo(expected, 1e-6));
        expect(result.confidence, inInclusiveRange(0, 1));
      },
    );

    test('reads the label of a pixel by column and row', () async {
      final result = await decode([logitTensor()]);

      expect(result.labelAt(0, 0), 'fondo');
      expect(result.labelAt(1, 0), 'hoja');
      expect(result.labelAt(0, 1), 'tallo');
      expect(result.labelAt(1, 1), 'fondo');
      expect(() => result.labelAt(2, 0), throwsRangeError);
      expect(() => result.labelAt(0, 2), throwsRangeError);
      expect(() => result.labelAt(-1, 0), throwsRangeError);
    });

    test('exposes a mask that cannot be modified', () async {
      final result = await decode([logitTensor()]);

      expect(() => result.mask[0] = 2, throwsUnsupportedError);
      expect(() => result.areaFractions['fondo'] = 1, throwsUnsupportedError);
      expect(() => result.labels.add('otra'), throwsUnsupportedError);
    });

    test('keeps its mask when the caller changes the buffer it passed', () {
      final buffer = Uint8List.fromList([0, 1]);
      final result = SegmentationResult(
        'model-1',
        width: 2,
        height: 1,
        labels: ['fondo', 'hoja'],
        mask: buffer,
        areaFractions: {'fondo': 0.5, 'hoja': 0.5},
        confidence: 0.9,
      );

      buffer[0] = 1;

      expect(result.labelAt(0, 0), 'fondo');
      expect(result.mask, [0, 1]);
    });

    test('decodes probabilities with the winner as confidence', () async {
      final result = await decode([
        tensor(
          [1, 1, 3, 3],
          [0.25, 0.5, 0.25, 0.5, 0.5, 0, 0.125, 0.25, 0.625],
        ),
      ], scoreType: 'probabilities');

      expect(result.mask, [1, 0, 2]);
      expect(result.width, 3);
      expect(result.height, 1);
      expect(result.areaFractions['fondo'], closeTo(1 / 3, 1e-12));
      expect(result.areaFractions['hoja'], closeTo(1 / 3, 1e-12));
      expect(result.areaFractions['tallo'], closeTo(1 / 3, 1e-12));
      expect(result.confidence, closeTo((0.5 + 0.5 + 0.625) / 3, 1e-9));
    });

    test('reports a label that wins no pixel with fraction zero', () async {
      final result = await decode([
        tensor([1, 1, 2, 3], [1, 0, 0, 1, 0, 0]),
      ], scoreType: 'probabilities');

      expect(result.areaFractions, {'fondo': 1.0, 'hoja': 0.0, 'tallo': 0.0});
    });

    test(
      'combines a segmentation with a classification in one output',
      () async {
        final definition = segmentationDefinition();
        final nodes = (definition['nodes'] as List).cast<Map>();
        final segmenter = nodes.firstWhere((n) => n['type'] == 'model.tflite');
        final classifier = {
          ...segmenter,
          'id': 'model-2',
          'modelVersionId': 'model-version-2',
          'outputs': {
            'result': {
              'type': 'classification',
              'labels': ['perro', 'gato'],
            },
          },
        };
        final output = nodes.firstWhere((n) => n['type'] == 'output');
        nodes
          ..remove(output)
          ..add(classifier)
          ..add({
            'id': 'output-1',
            'type': 'output',
            'name': 'Resultado',
            'sources': [
              {
                'sourceNodeId': 'model-1',
                'sourcePort': 'result',
                'resultType': 'segmentation',
              },
              {
                'sourceNodeId': 'model-2',
                'sourcePort': 'result',
                'resultType': 'classification',
              },
            ],
          });
        (definition['connections'] as List).add({
          'sourceNodeId': 'input-1',
          'sourcePort': 'imagen',
          'targetNodeId': 'model-2',
          'targetPort': 'image',
        });
        final executor = WorkflowExecutor(
          storageDirectory,
          inferenceRunner:
              ({
                required modelPath,
                required inputBytes,
                required acceptedInputShapes,
              }) async => (
                error: null,
                outputs: [
                  modelPath.contains('model-version-2')
                      ? tensor([1, 2], [0.1, 0.9])
                      : tensor([1, 1, 1, 3], [0, 4, 0]),
                ],
              ),
        );

        final result = await executor.execute(
          executionId: 'execution-1',
          workflowId: 'workflow-1',
          workflowVersion: '1.0.0',
          definition: definition,
          imageBytes: pngBytes(),
        );

        final combined = result.outputs['Resultado']! as CombinedWorkflowResult;
        expect(combined.values, hasLength(2));
        final segmentation = combined.values[0] as SegmentationResult;
        expect(segmentation.labelAt(0, 0), 'hoja');
        expect(combined.values[1], isA<ClassificationResult>());
      },
    );

    AyniSdk segmentationClient() => createAyniSdkForTesting(
      serverUrl: Uri.parse('https://sdk.example.test'),
      credential: 'ayni_sk_test',
      storageDirectory: storageDirectory,
      workflowInferenceRunner:
          ({
            required modelPath,
            required inputBytes,
            required acceptedInputShapes,
          }) async => (
            error: null,
            outputs: [
              tensor([1, 1, 1, 3], [0, 4, 0]),
            ],
          ),
    );

    test('runs an installed schema 4 workflow through AyniSdk.run', () async {
      await installWorkflowFiles(
        storageDirectory: storageDirectory,
        inventoryJson: _inventory(),
        workflowVersionId: 'workflow-version-1.0.0',
        definitionJson: jsonEncode(segmentationDefinition()),
      );
      await installTraceModelArtifact();

      final result = await segmentationClient().run('workflow-1', pngBytes());

      expect((result.outputs['Resultado']! as SegmentationResult).mask, [1]);
    });

    test(
      'rejects an installed workflow with a segmentation in schema 3',
      () async {
        await installWorkflowFiles(
          storageDirectory: storageDirectory,
          inventoryJson: _inventory(),
          workflowVersionId: 'workflow-version-1.0.0',
          definitionJson: jsonEncode(
            segmentationDefinition(schemaVersion: '3'),
          ),
        );
        await installTraceModelArtifact();

        await expectLater(
          segmentationClient().run('workflow-1', pngBytes()),
          throwsWorkflowError(category: WorkflowErrorCategory.invalidWorkflow),
        );
      },
    );

    test('keeps the confidence finite with very large logits', () async {
      final result = await decode([
        tensor([1, 1, 1, 3], [1000, 999, -1000]),
      ]);

      expect(result.mask, [0]);
      expect(result.confidence.isFinite, isTrue);
      expect(result.confidence, inExclusiveRange(0, 1.0000001));
      expect(result.confidence, closeTo(1 / (1 + math.exp(-1)), 1e-6));
    });

    test('decodes a 257 x 257 x 21 tensor with 21 labels', () async {
      const side = 257, classes = 21;
      final names = [for (var i = 0; i < classes; i++) 'clase-$i'];
      // Pixel p scores class p % 21 highest, so every label wins pixels.
      final values = Float32List(side * side * classes);
      for (var p = 0; p < side * side; p++) {
        values[p * classes + p % classes] = 5;
      }
      final result = await runSegmentation([
        (shape: [1, side, side, classes], values: values),
      ], modelLabels: names);

      final segmentation = result.outputs['Resultado']! as SegmentationResult;
      expect(segmentation.width, side);
      expect(segmentation.height, side);
      expect(segmentation.areaFractions.keys, names);
      expect(
        segmentation.areaFractions.values.reduce((a, b) => a + b),
        closeTo(1, 1e-9),
      );
      expect(segmentation.mask.length, side * side);
      expect(segmentation.labelAt(1, 0), 'clase-1');
    });

    group('rejects an invalid output with modelOutputInvalid', () {
      Matcher invalid() => throwsWorkflowError(
        category: WorkflowErrorCategory.modelOutputInvalid,
        nodeId: 'model-1',
        modelVersionId: 'model-version-1',
      );

      final valid = tensor([1, 1, 1, 3], [0, 1, 0]);

      test('with more than one tensor', () {
        expect(runSegmentation([valid, valid]), invalid());
      });

      test('without tensors', () {
        expect(runSegmentation([]), invalid());
      });

      test('with a shape that is not [1, H, W, C]', () {
        expect(
          runSegmentation([
            tensor([1, 1, 3], [0, 1, 0]),
          ]),
          invalid(),
        );
        expect(
          runSegmentation([
            tensor([2, 1, 1, 3], List.filled(6, 0)),
          ]),
          invalid(),
        );
        expect(
          runSegmentation([
            tensor([1, 0, 1, 3], []),
          ]),
          invalid(),
        );
      });

      test('with a class count that differs from the labels', () {
        expect(
          runSegmentation([
            tensor([1, 1, 1, 2], [0, 1]),
          ]),
          invalid(),
        );
      });

      test('with a number of values that differs from the shape', () {
        expect(
          runSegmentation([
            tensor([1, 1, 2, 3], [0, 1, 0]),
          ]),
          invalid(),
        );
      });

      test('with values that are not finite', () {
        for (final bad in [
          double.nan,
          double.infinity,
          double.negativeInfinity,
        ]) {
          expect(
            runSegmentation([
              tensor([1, 1, 1, 3], [0, bad, 0]),
            ]),
            invalid(),
          );
        }
      });

      test('with probabilities outside 0 to 1', () {
        for (final bad in [1.5, -0.25]) {
          expect(
            runSegmentation([
              tensor([1, 1, 1, 3], [0, bad, 0]),
            ], scoreType: 'probabilities'),
            invalid(),
          );
        }
      });

      test('with more pixels than the server accepts', () {
        // 1025 x 1025 = 1050625 > 1048576 (MAX_SEGMENTATION_PIXELS).
        expect(
          runSegmentation(
            [
              (shape: [1, 1025, 1025, 1], values: Float32List(1025 * 1025)),
            ],
            modelLabels: ['fondo'],
          ),
          invalid(),
        );
      });

      test('with more values than the value limit', () {
        // 1024 x 1024 x 17 = 17825792 > 16777216 (MAX_SEGMENTATION_VALUES).
        expect(
          runSegmentation(
            [
              (
                shape: [1, 1024, 1024, 17],
                values: Float32List(1024 * 1024 * 17),
              ),
            ],
            modelLabels: [for (var i = 0; i < 17; i++) 'l$i'],
          ),
          invalid(),
        );
      });

      test('accepts exactly the pixel limit', () async {
        final result = await runSegmentation(
          [
            (shape: [1, 1024, 1024, 1], values: Float32List(1024 * 1024)),
          ],
          modelLabels: ['fondo'],
        );

        final segmentation = result.outputs['Resultado']! as SegmentationResult;
        expect(segmentation.areaFractions, {'fondo': 1.0});
      });
    });
  });
}

/// A tensor the synthetic runner returns: its shape and flattened values.
typedef _Tensor = ({List<int> shape, Float32List values});

/// The single matcher for a [WorkflowError] thrown by `AyniSdk.run`: it checks
/// the category plus the node and model context the error must report.
Matcher throwsWorkflowError({
  required WorkflowErrorCategory category,
  String? nodeId,
  String? modelVersionId,
}) => throwsA(
  isA<WorkflowError>()
      .having((error) => error.category, 'category', category)
      .having((error) => error.nodeId, 'nodeId', nodeId)
      .having(
        (error) => error.modelVersionId,
        'modelVersionId',
        modelVersionId,
      ),
);

String _inventory() => jsonEncode({
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
      'sha256': 'a' * 64,
    },
  ],
});

String _definition() => jsonEncode({
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
