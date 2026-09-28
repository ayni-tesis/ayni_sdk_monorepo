import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
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
          BooleanResult(:final nodeId, :final value) => '$nodeId|$value',
        }),
      );

      expect(consumed, {
        'Clasificación': 'model-1|perro|0.92|0.08',
        'Detección': 'model-2|mancha|0.87|0.1|0.2|0.5|0.6',
        'Apto': 'condition-1|true',
      });
    });
  });

  group('WorkflowError from AyniSdk.run', () {
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
