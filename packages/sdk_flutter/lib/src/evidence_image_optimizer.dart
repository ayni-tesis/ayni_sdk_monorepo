// ignore_for_file: public_member_api_docs

import 'dart:isolate';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// The image of an evidence, ready to send: a JPEG of [width] × [height]
/// pixels.
typedef OptimizedEvidenceImage = ({Uint8List bytes, int width, int height});

/// The signature of [optimizeEvidenceImage], which tests may replace through
/// `createAyniSdkForTesting`.
typedef EvidenceImageOptimizer =
    OptimizedEvidenceImage Function(
      Uint8List image, {
      required int maxImageSize,
      required int imageQuality,
    });

/// Prepares the image of an evidence (US-067) with the limits of the
/// application's collection policy: a JPEG whose longest side is at most
/// [maxImageSize] pixels, compressed with [imageQuality].
///
/// It reads [image] without changing it. It applies the EXIF orientation,
/// like the workflow's preprocessing, and keeps no EXIF metadata, such as a
/// location or the camera. It never enlarges a smaller image. It throws a
/// [FormatException] when [image] cannot be decoded.
OptimizedEvidenceImage optimizeEvidenceImage(
  Uint8List image, {
  required int maxImageSize,
  required int imageQuality,
}) {
  img.Image? decoded;
  try {
    decoded = img.decodeImage(image);
  } on Object {
    // A decoder may fail with its own error on malformed bytes.
    decoded = null;
  }
  if (decoded == null) {
    throw const FormatException('The evidence image cannot be decoded.');
  }
  var oriented = img.bakeOrientation(decoded);
  final longest = math.max(oriented.width, oriented.height);
  if (longest > maxImageSize) {
    final scale = maxImageSize / longest;
    oriented = img.copyResize(
      oriented,
      width: math.max(1, (oriented.width * scale).round()),
      height: math.max(1, (oriented.height * scale).round()),
      interpolation: img.Interpolation.average,
    );
  }
  oriented.exif = img.ExifData();
  return (
    bytes: img.encodeJpg(oriented, quality: imageQuality),
    width: oriented.width,
    height: oriented.height,
  );
}

/// Runs [optimizer] on [image] in a background isolate, so decoding and
/// encoding never block the app. Being top level, its closure sends the
/// isolate nothing but these arguments.
Future<OptimizedEvidenceImage> optimizeEvidenceImageInBackground(
  EvidenceImageOptimizer optimizer,
  Uint8List image, {
  required int maxImageSize,
  required int imageQuality,
}) => Isolate.run(
  () =>
      optimizer(image, maxImageSize: maxImageSize, imageQuality: imageQuality),
);
