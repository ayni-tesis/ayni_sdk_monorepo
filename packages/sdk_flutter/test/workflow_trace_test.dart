import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
  test('omits duration for a node that was not executed', () {
    final skipped = TraceNodeExecution(
      nodeId: 'model-2',
      type: 'model.tflite',
      status: 'skipped',
    );
    final completed = TraceNodeExecution(
      nodeId: 'model-1',
      type: 'model.tflite',
      status: 'completed',
      durationMs: 12,
    );

    expect(skipped.durationMs, isNull);
    expect(skipped.toJson(), {
      'nodeId': 'model-2',
      'type': 'model.tflite',
      'status': 'skipped',
    });
    expect(completed.toJson()['durationMs'], 12);
  });

  test(
    'requires app-declared run identity and finite sourced measurements',
    () {
      expect(
        () => WorkflowTraceContext(runId: '', repetition: 1),
        throwsArgumentError,
      );
      expect(
        () => WorkflowTraceContext(runId: 'run-1', repetition: 0),
        throwsArgumentError,
      );
      expect(
        () => TraceMeasurement(
          name: 'latency',
          value: double.nan,
          unit: 'ms',
          method: 'clock',
          source: 'client',
        ),
        throwsArgumentError,
      );
    },
  );

  test('serializes only the decoded public result types', () {
    final values = WorkflowTrace.encodeOutputs({
      'class': const ClassificationResult('m1', 'leaf', 0.9, {'leaf': 0.9}),
      'detection': const DetectionResult('m2', [
        Detection('spot', 0.8, 0.1, 0.2, 0.5, 0.6),
      ]),
      'segmentation': SegmentationResult(
        'm3',
        width: 2,
        height: 1,
        labels: const ['fondo', 'hoja'],
        mask: Uint8List.fromList([0, 1]),
        areaFractions: const {'fondo': 0.5, 'hoja': 0.5},
        confidence: 0.75,
      ),
      'condition': const BooleanResult('c1', true),
      'combined': const CombinedWorkflowResult('out-1', [
        ClassificationResult('m1', 'leaf', 0.9, {'leaf': 0.9}),
        BooleanResult('condition-1', true),
      ]),
    });

    expect(values['class'], {
      'type': 'classification',
      'nodeId': 'm1',
      'label': 'leaf',
      'confidence': 0.9,
      'confidences': {'leaf': 0.9},
    });
    expect((values['detection'] as Map)['detections'], [
      {
        'label': 'spot',
        'confidence': 0.8,
        'box': {'xMin': 0.1, 'yMin': 0.2, 'xMax': 0.5, 'yMax': 0.6},
      },
    ]);
    expect(values['segmentation'], {
      'type': 'segmentation',
      'nodeId': 'm3',
      'width': 2,
      'height': 1,
      'confidence': 0.75,
      'areaFractions': {'fondo': 0.5, 'hoja': 0.5},
    });
    expect((values['segmentation']! as Map).keys.toSet(), const {
      'type',
      'nodeId',
      'width',
      'height',
      'confidence',
      'areaFractions',
    });
    expect(values['condition'], {
      'type': 'boolean',
      'nodeId': 'c1',
      'value': true,
    });
    expect(values['combined'], {
      'type': 'combined',
      'nodeId': 'out-1',
      'values': [
        {
          'type': 'classification',
          'nodeId': 'm1',
          'label': 'leaf',
          'confidence': 0.9,
          'confidences': {'leaf': 0.9},
        },
        {'type': 'boolean', 'nodeId': 'condition-1', 'value': true},
      ],
    });
  });
}
