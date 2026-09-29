import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:ayni_sdk/src/ayni_sdk.dart' show createAyniSdkForTesting;
import 'package:ayni_sdk/src/workflow_execution.dart' show WorkflowExecutor;
import 'package:crypto/crypto.dart' as crypto;
import 'package:image/image.dart' as img;
import 'package:test/test.dart';

import 'support/workflow_install.dart';

void main() {
  late Directory storageDirectory;

  setUp(() {
    AyniSdk.resetForTesting();
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

  group('WorkflowResult', () {
    test('reports the executed workflow context', () {
      const result = WorkflowResult(
        workflowId: 'workflow-1',
        workflowVersion: '1.0.0',
        outputs: {},
      );

      expect(result.workflowId, 'workflow-1');
      expect(result.workflowVersion, '1.0.0');
      expect(result.usingOfflineCache, isTrue);
      expect(result.outputs, isEmpty);
    });

    test('carries classification, detection and boolean values', () {
      const result = WorkflowResult(
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
          CombinedWorkflowResult(:final nodeId, :final values) =>
            '$nodeId|${values.map((value) => value.nodeId).join(',')}',
          BooleanResult(:final nodeId, :final value) => '$nodeId|$value',
        }),
      );

      expect(consumed, {
        'Clasificación': 'model-1|perro|0.92|0.08',
        'Detección': 'model-2|mancha|0.87|0.1|0.2|0.5|0.6',
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
        const privateDetail = 'C:\\private\\secret-token';
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
            .run('workflow-1', pngBytes())
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
      },
    );

    test(
      'rejects an installed workflow with unsupported schemaVersion before checking models',
      () async {
        final unsupportedDef = jsonEncode({
          'schemaVersion': '3',
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

  test('evaluates every declared condition operator', () async {
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

      final result = await client.run('workflow-1', pngBytes());
      final selectedName = expected ? 'Resultado' : 'No apto';
      expect(result.outputs.keys, {selectedName});
      expect((result.outputs[selectedName]! as BooleanResult).value, expected);
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
}

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
