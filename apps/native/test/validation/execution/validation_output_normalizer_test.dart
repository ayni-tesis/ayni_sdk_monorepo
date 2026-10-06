import 'dart:math' as math;
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:crypto/crypto.dart';
import 'package:better_fullstack_app/validation/execution/validation_output_normalizer.dart';
import 'package:better_fullstack_app/validation/execution/validation_segmentation.dart';
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
      tensorIndices: const {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 3},
    );
    final direct = normalizer.normalizeDirect(
      tensors: [
        ValidationTensor(
          shape: [1, 2, 4],
          values: [0.2, 0.1, 0.8, 0.9, 0, 0, 1, 1],
        ),
        ValidationTensor(shape: [1, 2], values: [0, 0]),
        ValidationTensor(shape: [1, 2], values: [0.9, 0.1]),
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

  group('segmentation', () {
    ValidationOutputContract segmentationContract({
      String scoreType = 'logits',
      List<String> labels = const ['fondo', 'roya', 'sana'],
    }) => ValidationOutputContract(
      name: 'segmentation',
      resultType: ValidationResultType.segmentation,
      labels: labels,
      scoreType: scoreType,
    );

    // 2 x 2 pixels and 3 labels, exactly representable in float32.
    // Pixel 0 is a tie between labels 0 and 1; it goes to the lowest index.
    final logits = <double>[
      2.0, 2.0, 0.0, //
      0.0, 3.0, 1.0, //
      -1.0, 0.0, 1.0, //
      0.5, 0.25, 4.0,
    ];

    Map<String, Object?> direct(
      List<double> values, {
      List<int> shape = const [1, 2, 2, 3],
      ValidationOutputContract? contract,
    }) => normalizer.normalizeDirect(
      tensors: [ValidationTensor(shape: shape, values: values)],
      contracts: [contract ?? segmentationContract()],
    );

    test('breaks an argmax tie with the lowest index and reads logits', () {
      final output = direct(logits)['segmentation']! as Map<String, Object?>;

      expect(output['type'], 'segmentation');
      expect(output['width'], 2);
      expect(output['height'], 2);
      expect(output['areaFractions'], {
        'fondo': 0.25,
        'roya': 0.25,
        'sana': 0.5,
      });
      expect(output['maskRle'], [
        [
          [0, 1],
          [1, 1],
        ],
        [
          [2, 2],
        ],
      ]);
      final expectedConfidence =
          (1 / (2 + math.exp(-2)) +
              1 / (math.exp(-3) + 1 + math.exp(-2)) +
              1 / (math.exp(-2) + math.exp(-1) + 1) +
              1 / (math.exp(-3.5) + math.exp(-3.75) + 1)) /
          4;
      expect(output['confidence'], closeTo(expectedConfidence, 1e-12));
      expect(
        output['maskSha256'],
        sha256.convert(Uint8List.fromList([0, 1, 2, 2])).toString(),
      );
    });

    test('reads probabilities as the winner confidence', () {
      final output =
          direct(
                [0.2, 0.7, 0.1, 0.5, 0.25, 0.25],
                shape: [1, 1, 2, 3],
                contract: segmentationContract(scoreType: 'probabilities'),
              )['segmentation']!
              as Map<String, Object?>;

      expect(output['maskRle'], [
        [
          [1, 1],
          [0, 1],
        ],
      ]);
      expect(output['confidence'], closeTo(0.6, 1e-12));
    });

    test('accepts a Float32List tensor without copying it', () {
      final values = Float32List.fromList([0.2, 0.7, 0.1]);
      final tensor = ValidationTensor.float32(
        shape: [1, 1, 1, 3],
        values: values,
      );

      expect(identical(tensor.values, values), isTrue);
      final output = normalizer.normalizeDirect(
        tensors: [tensor],
        contracts: [segmentationContract(scoreType: 'probabilities')],
      );
      expect((output['segmentation']! as Map<String, Object?>)['maskRle'], [
        [
          [1, 1],
        ],
      ]);
    });

    test('rejects a wrong shape, channel count, count or extra tensor', () {
      void expectInvalid(List<ValidationTensor> tensors) => expect(
        () => normalizer.normalizeDirect(
          tensors: tensors,
          contracts: [segmentationContract()],
        ),
        throwsA(isA<ValidationOutputException>()),
      );

      expectInvalid([
        ValidationTensor(shape: [1, 2, 2], values: logits),
      ]);
      expectInvalid([
        ValidationTensor(shape: [2, 2, 2, 3], values: logits),
      ]);
      expectInvalid([
        ValidationTensor(shape: [1, 2, 2, 4], values: logits),
      ]);
      expectInvalid([
        ValidationTensor(shape: [1, 0, 2, 3], values: []),
      ]);
      expectInvalid([
        ValidationTensor(shape: [1, 2, 2, 3], values: logits.take(11).toList()),
      ]);
      expectInvalid([
        ValidationTensor(shape: [1, 2, 2, 3], values: logits),
        ValidationTensor(shape: [1, 2, 2, 3], values: logits),
      ]);
      expectInvalid([
        ValidationTensor(shape: [1, 1025, 1025, 3], values: const []),
      ]);
    });

    test('rejects non finite scores and probabilities outside 0 to 1', () {
      for (final bad in [double.nan, double.infinity]) {
        expect(
          () => direct([...logits.take(11), bad]),
          throwsA(isA<ValidationOutputException>()),
        );
      }
      for (final bad in [1.5, -0.1]) {
        expect(
          () => direct(
            [bad, 0.0, 0.0],
            shape: [1, 1, 1, 3],
            contract: segmentationContract(scoreType: 'probabilities'),
          ),
          throwsA(isA<ValidationOutputException>()),
        );
      }
    });

    test('rejects more than 256 labels and a missing score type', () {
      final labels = [for (var i = 0; i < 257; i++) 'label-$i'];
      expect(
        () => direct(
          List.filled(257, 0.0),
          shape: [1, 1, 1, 257],
          contract: segmentationContract(labels: labels),
        ),
        throwsA(isA<ValidationOutputException>()),
      );
      expect(
        () => direct(
          logits,
          contract: ValidationOutputContract(
            name: 'segmentation',
            resultType: ValidationResultType.segmentation,
            labels: const ['fondo', 'roya', 'sana'],
          ),
        ),
        throwsA(isA<ValidationOutputException>()),
      );
    });

    test('the control and an equivalent SDK result give the same map', () {
      final control = direct(logits);
      final decoded = control['segmentation']! as Map<String, Object?>;
      final sdk = normalizer.normalizeSdk(
        outputs: {
          'segmentation': SegmentationResult(
            'model-node',
            width: 2,
            height: 2,
            labels: const ['fondo', 'roya', 'sana'],
            mask: Uint8List.fromList([0, 1, 2, 2]),
            areaFractions: const {'fondo': 0.25, 'roya': 0.25, 'sana': 0.5},
            confidence: decoded['confidence']! as double,
          ),
        },
        contracts: [segmentationContract()],
      );

      expect(sdk, control);
    });

    test('rejects an SDK segmentation that breaks the contract', () {
      SegmentationResult result({
        List<String> labels = const ['fondo', 'roya', 'sana'],
        Uint8List? mask,
        Map<String, double> areaFractions = const {
          'fondo': 0.25,
          'roya': 0.25,
          'sana': 0.5,
        },
        double confidence = 0.9,
      }) => SegmentationResult(
        'model-node',
        width: 2,
        height: 2,
        labels: labels,
        mask: mask ?? Uint8List.fromList([0, 1, 2, 2]),
        areaFractions: areaFractions,
        confidence: confidence,
      );
      for (final bad in [
        result(labels: const ['fondo', 'sana', 'roya']),
        result(mask: Uint8List.fromList([0, 1, 2, 3])),
        result(mask: Uint8List.fromList([0, 1, 2])),
        result(areaFractions: const {'fondo': 1.0}),
        result(confidence: double.nan),
      ]) {
        expect(
          () => normalizer.normalizeSdk(
            outputs: {'segmentation': bad},
            contracts: [segmentationContract()],
          ),
          throwsA(isA<ValidationOutputException>()),
        );
      }
    });
  });

  group('deferred segmentation encoding', () {
    final segmentation = ValidationOutputContract(
      name: 'mask',
      resultType: ValidationResultType.segmentation,
      labels: const ['fondo', 'roya'],
      scoreType: 'probabilities',
    );
    final tensor = ValidationTensor(
      shape: [1, 1, 2, 2],
      values: [0.75, 0.25, 0.125, 0.875],
    );

    test('leaves the RLE and SHA-256 for after the timed region', () {
      final deferred = normalizer.normalizeDirect(
        tensors: [tensor],
        contracts: [segmentation],
        deferSegmentationEncoding: true,
      );
      final pending = deferred['mask']! as Map<String, Object?>;

      expect(pending.keys, isNot(contains('maskRle')));
      expect(pending.keys, isNot(contains('maskSha256')));
      expect(pending['pendingEncoding'], isA<SegmentationSummary>());
      expect(pending['areaFractions'], {'fondo': 0.5, 'roya': 0.5});

      // Encoding afterwards gives exactly what the immediate path gives.
      expect(
        ValidationOutputNormalizer.encodeDeferred(deferred),
        normalizer.normalizeDirect(
          tensors: [tensor],
          contracts: [segmentation],
        ),
      );
    });

    test('the SDK path defers and encodes the same way', () {
      final outputs = {
        'mask': SegmentationResult(
          'node',
          width: 2,
          height: 1,
          labels: const ['fondo', 'roya'],
          mask: Uint8List.fromList([0, 1]),
          areaFractions: const {'fondo': 0.5, 'roya': 0.5},
          confidence: 0.8125,
        ),
      };

      final deferred = normalizer.normalizeSdk(
        outputs: outputs,
        contracts: [segmentation],
        deferSegmentationEncoding: true,
      );

      expect(
        ValidationOutputNormalizer.encodeDeferred(deferred),
        normalizer.normalizeSdk(outputs: outputs, contracts: [segmentation]),
      );
    });

    test('never defers classification or boolean outputs', () {
      final outputs = normalizer.normalizeDirect(
        tensors: [
          ValidationTensor(shape: [1, 3], values: [0.1, 0.8, 0.1]),
        ],
        contracts: [contract],
        deferSegmentationEncoding: true,
      );

      expect(ValidationOutputNormalizer.encodeDeferred(outputs), outputs);
      expect(
        outputs,
        normalizer.normalizeDirect(
          tensors: [
            ValidationTensor(shape: [1, 3], values: [0.1, 0.8, 0.1]),
          ],
          contracts: [contract],
        ),
      );
    });
  });
}
