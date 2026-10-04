import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:better_fullstack_app/validation/execution/validation_output_normalizer.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final contract = ValidationOutputContract(
    name: 'classification',
    resultType: ValidationResultType.classification,
    labels: ['sana', 'roya', 'minador'],
  );
  final normalizer = ValidationOutputNormalizer();

  test('normalizes direct float scores to the SDK typed result shape', () {
    final direct = normalizer.normalizeDirect(
      tensors: [
        ValidationTensor(shape: [1, 3], values: [0.1, 0.8, 0.1]),
      ],
      contracts: [contract],
    );
    final treatment = normalizer.normalizeSdk(
      outputs: const {
        'classification': ClassificationResult('model-node', 'roya', 0.8, {
          'sana': 0.1,
          'roya': 0.8,
          'minador': 0.1,
        }),
      },
      contracts: [contract],
    );

    expect(direct, treatment);
    expect(direct, {
      'classification': {
        'type': 'classification',
        'label': 'roya',
        'confidence': 0.8,
        'confidences': {'sana': 0.1, 'roya': 0.8, 'minador': 0.1},
      },
    });
  });

  test('normalizes SDK detection and condition outputs as JSON values', () {
    final contracts = [
      ValidationOutputContract(
        name: 'objects',
        resultType: ValidationResultType.detection,
        labels: ['coffee'],
      ),
      ValidationOutputContract(
        name: 'accepted',
        resultType: ValidationResultType.boolean,
        labels: [],
      ),
    ];
    final result = normalizer.normalizeSdk(
      outputs: const {
        'objects': DetectionResult('model-node', [
          Detection('coffee', 0.9, 0.1, 0.2, 0.8, 0.9),
        ]),
        'accepted': BooleanResult('condition-node', true),
      },
      contracts: contracts,
    );

    expect(result, {
      'objects': {
        'type': 'detection',
        'detections': [
          {
            'label': 'coffee',
            'confidence': 0.9,
            'xMin': 0.1,
            'yMin': 0.2,
            'xMax': 0.8,
            'yMax': 0.9,
          },
        ],
      },
      'accepted': {'type': 'boolean', 'value': true},
    });
  });

  test('normalizes direct detection tensors like the SDK decoder', () {
    final detectionContract = ValidationOutputContract(
      name: 'objects',
      resultType: ValidationResultType.detection,
      labels: ['coffee'],
      scoreThreshold: 0.5,
    );
    final direct = normalizer.normalizeDirect(
      tensors: [
        ValidationTensor(
          shape: [1, 2, 4],
          values: [0.2, 0.1, 0.8, 0.9, 0, 0, 1, 1],
        ),
        ValidationTensor(shape: [1, 2], values: [0.9, 0.1]),
        ValidationTensor(shape: [1, 2], values: [0, 0]),
        ValidationTensor(shape: [1, 1], values: [2]),
      ],
      contracts: [detectionContract],
    );
    final sdk = normalizer.normalizeSdk(
      outputs: const {
        'objects': DetectionResult('model-node', [
          Detection('coffee', 0.9, 0.1, 0.2, 0.9, 0.8),
        ]),
      },
      contracts: [detectionContract],
    );

    expect(direct, sdk);
  });

  test('rejects malformed direct tensors and SDK output type mismatches', () {
    expect(
      () => normalizer.normalizeDirect(
        tensors: [
          ValidationTensor(shape: [1, 2], values: [0.1, 0.9]),
        ],
        contracts: [contract],
      ),
      throwsA(isA<ValidationOutputException>()),
    );
    expect(
      () => normalizer.normalizeSdk(
        outputs: const {
          'classification': BooleanResult('condition-node', true),
        },
        contracts: [contract],
      ),
      throwsA(isA<ValidationOutputException>()),
    );
  });
}
