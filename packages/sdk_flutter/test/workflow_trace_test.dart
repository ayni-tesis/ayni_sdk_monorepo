import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
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
