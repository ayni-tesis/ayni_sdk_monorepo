import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// The most pixels (`height * width`) a segmentation mask may have, as in the
/// SDK and the server.
const validationMaxSegmentationPixels = 1048576;

/// The most score values (`height * width * labels`) a segmentation tensor
/// may have, as in the SDK and the server.
const validationMaxSegmentationValues = 16777216;

/// The most labels a segmentation output may declare.
const validationMaxSegmentationLabels = 256;

/// Builds the normalized JSON of a segmentation output, shared by the direct
/// integration and the SDK so both are recorded in the same shape.
///
/// [mask] holds [width] times [height] indexes into [labels], row by row.
/// `areaFractions` follows the order of [labels]. The mask itself stays on the
/// device: it goes to the local JSONL as `maskRle` and nowhere else.
///
/// `maskSha256` is the SHA-256 of the content only: the label indexes, one
/// byte each, row by row. It does not cover the dimensions, which are kept
/// apart in `width` and `height`; two masks of other sizes can share a digest.
Map<String, Object?> segmentationOutputJson({
  required int width,
  required int height,
  required List<String> labels,
  required Uint8List mask,
  required Map<String, double> areaFractions,
  required double confidence,
}) {
  if (width < 1 ||
      height < 1 ||
      mask.length != width * height ||
      labels.isEmpty ||
      labels.length > validationMaxSegmentationLabels) {
    throw const FormatException('Invalid segmentation dimensions.');
  }
  return {
    'type': 'segmentation',
    'width': width,
    'height': height,
    'areaFractions': {for (final label in labels) label: areaFractions[label]},
    'confidence': confidence,
    'maskSha256': sha256.convert(mask).toString(),
    'maskRle': encodeMaskRle(mask, width, height),
  };
}

/// Encodes [mask] row by row as `height` lists of `[index, length]` pairs
/// whose lengths add up to [width].
List<List<List<int>>> encodeMaskRle(Uint8List mask, int width, int height) {
  if (mask.length != width * height) {
    throw const FormatException('The mask does not match its dimensions.');
  }
  final rows = <List<List<int>>>[];
  for (var y = 0; y < height; y++) {
    final row = <List<int>>[];
    final offset = y * width;
    var start = 0;
    for (var x = 1; x <= width; x++) {
      if (x == width || mask[offset + x] != mask[offset + start]) {
        row.add([mask[offset + start], x - start]);
        start = x;
      }
    }
    rows.add(row);
  }
  return rows;
}

/// Decodes what [encodeMaskRle] wrote, checking everything it reads: the row
/// count, a pair's shape, an index below [labelCount] and each row's length.
///
/// Throws a [FormatException] when [rle] is not valid.
Uint8List decodeMaskRle(
  Object? rle, {
  required int width,
  required int height,
  required int labelCount,
}) {
  if (width < 1 ||
      height < 1 ||
      width * height > validationMaxSegmentationPixels ||
      labelCount < 1 ||
      labelCount > validationMaxSegmentationLabels ||
      rle is! List ||
      rle.length != height) {
    throw const FormatException('Invalid mask RLE.');
  }
  final mask = Uint8List(width * height);
  for (var y = 0; y < height; y++) {
    final row = rle[y];
    if (row is! List) throw const FormatException('Invalid mask RLE row.');
    var x = 0;
    for (final pair in row) {
      if (pair is! List ||
          pair.length != 2 ||
          pair[0] is! int ||
          pair[1] is! int) {
        throw const FormatException('Invalid mask RLE pair.');
      }
      final index = pair[0] as int, length = pair[1] as int;
      if (index < 0 ||
          index >= labelCount ||
          length < 1 ||
          length > width - x) {
        throw const FormatException('Invalid mask RLE run.');
      }
      mask.fillRange(y * width + x, y * width + x + length, index);
      x += length;
    }
    if (x != width) throw const FormatException('Short mask RLE row.');
  }
  return mask;
}

/// How closely the SDK's segmentation matches the direct integration's for
/// the same image.
class SegmentationAgreement {
  const SegmentationAgreement({
    required this.pixelAgreement,
    required this.meanIou,
    required this.maxAbsAreaFractionDelta,
    required this.absConfidenceDelta,
    required this.dimensionsMatch,
  });

  /// The fraction of pixels both masks give the same label; `0` when the
  /// dimensions differ.
  final double pixelAgreement;

  /// The mean intersection over union of the labels either mask contains; `0`
  /// when the dimensions differ.
  final double meanIou;

  /// The largest absolute difference between the two area fractions of a label.
  final double maxAbsAreaFractionDelta;

  /// The absolute difference between the two confidences.
  final double absConfidenceDelta;

  /// Whether both masks have the same width and height.
  final bool dimensionsMatch;

  static const _fields = {
    'pixelAgreement',
    'meanIou',
    'maxAbsAreaFractionDelta',
    'absConfidenceDelta',
    'dimensionsMatch',
  };

  Map<String, Object?> toJson() => {
    'pixelAgreement': pixelAgreement,
    'meanIou': meanIou,
    'maxAbsAreaFractionDelta': maxAbsAreaFractionDelta,
    'absConfidenceDelta': absConfidenceDelta,
    'dimensionsMatch': dimensionsMatch,
  };

  factory SegmentationAgreement.fromJson(Map<String, Object?> json) {
    if (json.keys.toSet().difference(_fields).isNotEmpty ||
        _fields.difference(json.keys.toSet()).isNotEmpty) {
      throw const FormatException(
        'segmentationAgreement has missing or unknown fields.',
      );
    }
    double number(String name) {
      final value = json[name];
      if (value is! num || !value.isFinite) {
        throw FormatException('$name must be a finite number.');
      }
      return value.toDouble();
    }

    final dimensionsMatch = json['dimensionsMatch'];
    if (dimensionsMatch is! bool) {
      throw const FormatException('dimensionsMatch must be a boolean.');
    }
    return SegmentationAgreement(
      pixelAgreement: number('pixelAgreement'),
      meanIou: number('meanIou'),
      maxAbsAreaFractionDelta: number('maxAbsAreaFractionDelta'),
      absConfidenceDelta: number('absConfidenceDelta'),
      dimensionsMatch: dimensionsMatch,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is SegmentationAgreement &&
      other.pixelAgreement == pixelAgreement &&
      other.meanIou == meanIou &&
      other.maxAbsAreaFractionDelta == maxAbsAreaFractionDelta &&
      other.absConfidenceDelta == absConfidenceDelta &&
      other.dimensionsMatch == dimensionsMatch;

  @override
  int get hashCode => Object.hash(
    pixelAgreement,
    meanIou,
    maxAbsAreaFractionDelta,
    absConfidenceDelta,
    dimensionsMatch,
  );
}

/// Compares two normalized segmentation outputs built by
/// [segmentationOutputJson], decoding their masks from `maskRle` and checking
/// them against `maskSha256`.
///
/// Throws a [FormatException] when an output is not a valid segmentation or
/// they declare different labels.
SegmentationAgreement compareSegmentationOutputs(
  Map<String, Object?> control,
  Map<String, Object?> treatment,
) => compareSegmentations(
  SegmentationSummary.fromJson(control),
  SegmentationSummary.fromJson(treatment),
);

/// Compares two decoded segmentations.
///
/// Throws a [FormatException] when they declare different labels.
SegmentationAgreement compareSegmentations(
  SegmentationSummary left,
  SegmentationSummary right,
) {
  if (left.labels.length != right.labels.length ||
      Iterable<int>.generate(
        left.labels.length,
      ).any((index) => left.labels[index] != right.labels[index])) {
    throw const FormatException('The segmentations declare other labels.');
  }
  var maxAreaDelta = 0.0;
  for (final label in left.labels) {
    final delta = (left.areaFractions[label]! - right.areaFractions[label]!)
        .abs();
    if (delta > maxAreaDelta) maxAreaDelta = delta;
  }
  final confidenceDelta = (left.confidence - right.confidence).abs();
  final dimensionsMatch =
      left.width == right.width && left.height == right.height;
  if (!dimensionsMatch) {
    return SegmentationAgreement(
      pixelAgreement: 0,
      meanIou: 0,
      maxAbsAreaFractionDelta: maxAreaDelta,
      absConfidenceDelta: confidenceDelta,
      dimensionsMatch: false,
    );
  }
  final labelCount = left.labels.length;
  final intersection = List<int>.filled(labelCount, 0);
  final union = List<int>.filled(labelCount, 0);
  var agreeing = 0;
  for (var pixel = 0; pixel < left.mask.length; pixel++) {
    final a = left.mask[pixel], b = right.mask[pixel];
    if (a == b) {
      agreeing++;
      intersection[a]++;
      union[a]++;
    } else {
      union[a]++;
      union[b]++;
    }
  }
  var iouSum = 0.0;
  var iouLabels = 0;
  for (var label = 0; label < labelCount; label++) {
    if (union[label] == 0) continue;
    iouSum += intersection[label] / union[label];
    iouLabels++;
  }
  return SegmentationAgreement(
    pixelAgreement: agreeing / left.mask.length,
    meanIou: iouLabels == 0 ? 0 : iouSum / iouLabels,
    maxAbsAreaFractionDelta: maxAreaDelta,
    absConfidenceDelta: confidenceDelta,
    dimensionsMatch: true,
  );
}

/// A decoded segmentation: the mask itself, not its run-length encoding.
///
/// Normalizers build it first and the runners encode it with [toJson] after
/// the timed region, so the RLE and the SHA-256 never count as latency.
class SegmentationSummary {
  SegmentationSummary({
    required this.width,
    required this.height,
    required List<String> labels,
    required this.mask,
    required Map<String, double> areaFractions,
    required this.confidence,
  }) : labels = List.unmodifiable(labels),
       areaFractions = Map.unmodifiable(areaFractions);

  final int width;
  final int height;
  final List<String> labels;

  /// The label index of every pixel, row by row (`width * height` values).
  final Uint8List mask;
  final Map<String, double> areaFractions;
  final double confidence;

  /// The recorded shape; see [segmentationOutputJson].
  Map<String, Object?> toJson() => segmentationOutputJson(
    width: width,
    height: height,
    labels: labels,
    mask: mask,
    areaFractions: areaFractions,
    confidence: confidence,
  );

  /// Reads an output built by [segmentationOutputJson], decoding the mask from
  /// `maskRle` and checking it against `maskSha256`.
  ///
  /// Throws a [FormatException] when [json] is not a valid segmentation.
  factory SegmentationSummary.fromJson(Map<String, Object?> json) {
    const fields = {
      'type',
      'width',
      'height',
      'areaFractions',
      'confidence',
      'maskSha256',
      'maskRle',
    };
    final area = json['areaFractions'];
    final width = json['width'], height = json['height'];
    final confidence = json['confidence'];
    if (json.keys.toSet().difference(fields).isNotEmpty ||
        fields.difference(json.keys.toSet()).isNotEmpty ||
        json['type'] != 'segmentation' ||
        width is! int ||
        height is! int ||
        area is! Map ||
        area.isEmpty ||
        area.values.any((value) => value is! num || !value.isFinite) ||
        confidence is! num ||
        !confidence.isFinite) {
      throw const FormatException('Invalid segmentation output.');
    }
    final labels = [for (final key in area.keys) key.toString()];
    final mask = decodeMaskRle(
      json['maskRle'],
      width: width,
      height: height,
      labelCount: labels.length,
    );
    if (sha256.convert(mask).toString() != json['maskSha256']) {
      throw const FormatException('The mask does not match its SHA-256.');
    }
    return SegmentationSummary(
      width: width,
      height: height,
      labels: labels,
      mask: mask,
      areaFractions: {
        for (final entry in area.entries)
          entry.key.toString(): (entry.value as num).toDouble(),
      },
      confidence: confidence.toDouble(),
    );
  }
}
