import 'dart:convert';
import 'dart:typed_data';

import 'package:better_fullstack_app/validation/execution/validation_segmentation.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('mask RLE', () {
    test('round trips a mask row by row', () {
      final mask = Uint8List.fromList([0, 0, 1, 1, 1, 1, 2, 0, 0, 0, 3, 3]);

      final rle = encodeMaskRle(mask, 4, 3);

      expect(rle, [
        [
          [0, 2],
          [1, 2],
        ],
        [
          [1, 2],
          [2, 1],
          [0, 1],
        ],
        [
          [0, 2],
          [3, 2],
        ],
      ]);
      expect(decodeMaskRle(rle, width: 4, height: 3, labelCount: 4), mask);
    });

    test('a run never crosses a row even when the next row starts alike', () {
      final mask = Uint8List.fromList([1, 1, 1, 1]);

      final rle = encodeMaskRle(mask, 2, 2);

      expect(rle, [
        [
          [1, 2],
        ],
        [
          [1, 2],
        ],
      ]);
    });

    test('decodes what was written to and read from JSON', () {
      final mask = Uint8List.fromList([2, 2, 0, 1, 1, 1]);
      final rle = jsonDecode(jsonEncode(encodeMaskRle(mask, 3, 2)));

      expect(decodeMaskRle(rle, width: 3, height: 2, labelCount: 3), mask);
    });

    test('rejects an RLE that does not describe the mask', () {
      void expectInvalid(Object? rle, {int labelCount = 2}) => expect(
        () => decodeMaskRle(rle, width: 3, height: 2, labelCount: labelCount),
        throwsFormatException,
      );
      const valid = [
        [
          [0, 3],
        ],
        [
          [1, 3],
        ],
      ];
      expect(
        decodeMaskRle(valid, width: 3, height: 2, labelCount: 2),
        Uint8List.fromList([0, 0, 0, 1, 1, 1]),
      );

      expectInvalid('not a list');
      expectInvalid([
        [
          [0, 3],
        ],
      ]); // one row is missing
      expectInvalid([
        [
          [0, 2],
        ],
        [
          [1, 3],
        ],
      ]); // a short row
      expectInvalid([
        [
          [0, 4],
        ],
        [
          [1, 3],
        ],
      ]); // a long row
      expectInvalid([
        [
          [2, 3],
        ],
        [
          [1, 3],
        ],
      ]); // an index outside the labels
      expectInvalid([
        [
          [0, 0],
          [0, 3],
        ],
        [
          [1, 3],
        ],
      ]); // an empty run
      expectInvalid([
        [
          [0, 3, 1],
        ],
        [
          [1, 3],
        ],
      ]); // a triple
      expectInvalid([
        [
          ['0', 3],
        ],
        [
          [1, 3],
        ],
      ]); // a text index
      expectInvalid([
        [0, 3],
        [
          [1, 3],
        ],
      ]); // a row that is not a list of pairs
    });

    test('rejects dimensions outside the segmentation limits', () {
      const rle = [<Object>[]];
      expect(
        () => decodeMaskRle(rle, width: 0, height: 1, labelCount: 1),
        throwsFormatException,
      );
      expect(
        () => decodeMaskRle(rle, width: 1025, height: 1025, labelCount: 1),
        throwsFormatException,
      );
      expect(
        () => decodeMaskRle(rle, width: 1, height: 1, labelCount: 257),
        throwsFormatException,
      );
    });
  });

  group('segmentationOutputJson', () {
    test('builds the recorded shape with a stable mask SHA-256', () {
      final mask = Uint8List.fromList([0, 1, 1, 0]);
      Map<String, Object?> build() => segmentationOutputJson(
        width: 2,
        height: 2,
        labels: const ['fondo', 'roya'],
        mask: mask,
        areaFractions: const {'roya': 0.5, 'fondo': 0.5},
        confidence: 0.75,
      );

      final output = build();

      expect(output.keys, [
        'type',
        'width',
        'height',
        'areaFractions',
        'confidence',
        'maskSha256',
        'maskRle',
      ]);
      expect(output['type'], 'segmentation');
      // The fractions follow the order of the labels.
      expect((output['areaFractions']! as Map).keys, ['fondo', 'roya']);
      expect(output['maskSha256'], sha256.convert(mask).toString());
      expect(
        output['maskSha256'],
        '${sha256.convert([0, 1, 1, 0])}',
        reason: 'The digest is over the raw label indexes, row by row.',
      );
      expect(build(), output);
      expect(jsonDecode(jsonEncode(output)), output);
    });

    test('rejects a mask that does not match its dimensions', () {
      expect(
        () => segmentationOutputJson(
          width: 2,
          height: 2,
          labels: const ['fondo'],
          mask: Uint8List(3),
          areaFractions: const {'fondo': 1},
          confidence: 1,
        ),
        throwsFormatException,
      );
    });
  });

  group('compareSegmentationOutputs', () {
    Map<String, Object?> output({
      required int width,
      required int height,
      required List<int> mask,
      Map<String, double> areaFractions = const {'a': 0.5, 'b': 0.5},
      double confidence = 0.9,
    }) => segmentationOutputJson(
      width: width,
      height: height,
      labels: const ['a', 'b'],
      mask: Uint8List.fromList(mask),
      areaFractions: areaFractions,
      confidence: confidence,
    );

    test('equal masks agree completely', () {
      final left = output(width: 3, height: 2, mask: [0, 0, 1, 1, 1, 1]);
      final right = output(width: 3, height: 2, mask: [0, 0, 1, 1, 1, 1]);

      final agreement = compareSegmentationOutputs(left, right);

      expect(agreement.pixelAgreement, 1);
      expect(agreement.meanIou, 1);
      expect(agreement.maxAbsAreaFractionDelta, 0);
      expect(agreement.absConfidenceDelta, 0);
      expect(agreement.dimensionsMatch, isTrue);
    });

    test('computes a case by hand', () {
      // control: a a b / b b b      sdk: a b b / b b a
      // agreement 4 of 6 pixels; IoU(a) = 1 / 3 and IoU(b) = 3 / 5.
      final control = output(
        width: 3,
        height: 2,
        mask: [0, 0, 1, 1, 1, 1],
        areaFractions: const {'a': 1 / 3, 'b': 2 / 3},
        confidence: 0.9,
      );
      final sdk = output(
        width: 3,
        height: 2,
        mask: [0, 1, 1, 1, 1, 0],
        areaFractions: const {'a': 0.5, 'b': 0.5},
        confidence: 0.75,
      );

      final agreement = compareSegmentationOutputs(control, sdk);

      expect(agreement.pixelAgreement, closeTo(4 / 6, 1e-12));
      expect(agreement.meanIou, closeTo((1 / 3 + 3 / 5) / 2, 1e-12));
      expect(agreement.maxAbsAreaFractionDelta, closeTo(1 / 6, 1e-12));
      expect(agreement.absConfidenceDelta, closeTo(0.15, 1e-12));
      expect(agreement.dimensionsMatch, isTrue);
    });

    test(
      'a label only one mask has scores zero; one in neither is skipped',
      () {
        final left = output(width: 2, height: 1, mask: [0, 0]);
        final right = output(width: 2, height: 1, mask: [0, 1]);

        final agreement = compareSegmentationOutputs(left, right);

        expect(agreement.pixelAgreement, 0.5);
        expect(agreement.meanIou, closeTo((0.5 + 0) / 2, 1e-12));

        Map<String, Object?> threeLabels(List<int> mask) =>
            segmentationOutputJson(
              width: 2,
              height: 1,
              labels: const ['a', 'b', 'c'],
              mask: Uint8List.fromList(mask),
              areaFractions: const {'a': 0.5, 'b': 0.5, 'c': 0},
              confidence: 0.9,
            );
        expect(
          compareSegmentationOutputs(
            threeLabels([0, 1]),
            threeLabels([0, 1]),
          ).meanIou,
          1,
        );
      },
    );

    test('masks of other dimensions disagree and keep the other metrics', () {
      final left = output(
        width: 2,
        height: 2,
        mask: [0, 0, 1, 1],
        areaFractions: const {'a': 0.5, 'b': 0.5},
        confidence: 0.9,
      );
      final right = output(
        width: 4,
        height: 1,
        mask: [0, 1, 1, 1],
        areaFractions: const {'a': 0.25, 'b': 0.75},
        confidence: 0.8,
      );

      final agreement = compareSegmentationOutputs(left, right);

      expect(agreement.dimensionsMatch, isFalse);
      expect(agreement.pixelAgreement, 0);
      expect(agreement.meanIou, 0);
      expect(agreement.maxAbsAreaFractionDelta, closeTo(0.25, 1e-12));
      expect(agreement.absConfidenceDelta, closeTo(0.1, 1e-12));
    });

    test('rejects outputs it cannot trust', () {
      final valid = output(width: 2, height: 1, mask: [0, 1]);
      final tampered = {...valid, 'maskSha256': 'a' * 64};
      final otherLabels = segmentationOutputJson(
        width: 2,
        height: 1,
        labels: const ['a', 'c'],
        mask: Uint8List.fromList([0, 1]),
        areaFractions: const {'a': 0.5, 'c': 0.5},
        confidence: 0.9,
      );

      expect(
        () => compareSegmentationOutputs(valid, tampered),
        throwsFormatException,
      );
      expect(
        () => compareSegmentationOutputs(valid, otherLabels),
        throwsFormatException,
      );
      expect(
        () => compareSegmentationOutputs(valid, {'type': 'classification'}),
        throwsFormatException,
      );
    });

    test('compares outputs read back from JSON', () {
      final left = output(width: 3, height: 2, mask: [0, 0, 1, 1, 1, 1]);
      final right = output(width: 3, height: 2, mask: [0, 1, 1, 1, 1, 0]);
      Map<String, Object?> roundTrip(Map<String, Object?> value) =>
          (jsonDecode(jsonEncode(value)) as Map).cast<String, Object?>();

      expect(
        compareSegmentationOutputs(roundTrip(left), roundTrip(right)),
        compareSegmentationOutputs(left, right),
      );
    });
  });

  group('SegmentationAgreement', () {
    test('round trips through JSON and rejects unknown or missing fields', () {
      const agreement = SegmentationAgreement(
        pixelAgreement: 0.875,
        meanIou: 0.5,
        maxAbsAreaFractionDelta: 0.125,
        absConfidenceDelta: 0.25,
        dimensionsMatch: true,
      );
      final json = (jsonDecode(jsonEncode(agreement.toJson())) as Map)
          .cast<String, Object?>();

      expect(SegmentationAgreement.fromJson(json), agreement);
      expect(
        () => SegmentationAgreement.fromJson({...json, 'extra': 1}),
        throwsFormatException,
      );
      expect(
        () => SegmentationAgreement.fromJson({...json}..remove('meanIou')),
        throwsFormatException,
      );
      expect(
        () => SegmentationAgreement.fromJson({...json, 'dimensionsMatch': 1}),
        throwsFormatException,
      );
      expect(
        () => SegmentationAgreement.fromJson({...json, 'meanIou': 'x'}),
        throwsFormatException,
      );
    });
  });

  group('hostile RLE and summaries', () {
    test('a run length near the int limit cannot overflow the row check', () {
      for (final length in [
        1 << 62,
        9223372036854775807, // the largest 64-bit int
      ]) {
        final rle = [
          [
            [0, 1],
            [1, length],
          ],
          [
            [1, 3],
          ],
        ];
        expect(
          () => decodeMaskRle(rle, width: 3, height: 2, labelCount: 2),
          throwsFormatException,
          reason: '$length',
        );
      }
    });

    test('a summary round trips through its recorded JSON', () {
      final summary = SegmentationSummary(
        width: 3,
        height: 2,
        labels: const ['a', 'b'],
        mask: Uint8List.fromList([0, 0, 1, 1, 1, 1]),
        areaFractions: const {'a': 1 / 3, 'b': 2 / 3},
        confidence: 0.5,
      );

      final back = SegmentationSummary.fromJson(
        (jsonDecode(jsonEncode(summary.toJson())) as Map)
            .cast<String, Object?>(),
      );

      expect(back.mask, summary.mask);
      expect(back.width, 3);
      expect(back.height, 2);
      expect(back.areaFractions, summary.areaFractions);
      expect(back.confidence, 0.5);
      expect(back.labels, ['a', 'b']);
    });

    test('the SHA-256 covers the indexes only, not the dimensions', () {
      Map<String, Object?> json(int width, int height) => SegmentationSummary(
        width: width,
        height: height,
        labels: const ['a', 'b'],
        mask: Uint8List.fromList([0, 1, 1, 0]),
        areaFractions: const {'a': 0.5, 'b': 0.5},
        confidence: 1,
      ).toJson();

      expect(json(2, 2)['maskSha256'], json(4, 1)['maskSha256']);
      expect(json(2, 2)['maskRle'], isNot(json(4, 1)['maskRle']));
    });
  });
}
