// US-067: the image of an evidence is reduced and recompressed with the
// limits of the collection policy before it is kept for sending.
import 'dart:typed_data';

import 'package:ayni_sdk/src/evidence_image_optimizer.dart';
import 'package:image/image.dart' as img;
import 'package:test/test.dart';

void main() {
  Uint8List png(int width, int height) => Uint8List.fromList(
    img.encodePng(img.Image(width: width, height: height)),
  );

  img.Image decodeJpeg(Uint8List bytes) {
    final decoded = img.decodeJpg(bytes);
    expect(decoded, isNotNull, reason: 'the optimized image must be a JPEG');
    return decoded!;
  }

  test('reduces the longest side of a landscape image to the policy size', () {
    final optimized = optimizeEvidenceImage(
      png(400, 200),
      maxImageSize: 128,
      imageQuality: 80,
    );

    final image = decodeJpeg(optimized.bytes);
    expect((image.width, image.height), (128, 64));
    expect((optimized.width, optimized.height), (128, 64));
  });

  test('reduces the longest side of a portrait image to the policy size', () {
    final optimized = optimizeEvidenceImage(
      png(150, 300),
      maxImageSize: 128,
      imageQuality: 80,
    );

    final image = decodeJpeg(optimized.bytes);
    expect((image.width, image.height), (64, 128));
  });

  test('never enlarges an image smaller than the policy size', () {
    final optimized = optimizeEvidenceImage(
      png(100, 50),
      maxImageSize: 1024,
      imageQuality: 80,
    );

    final image = decodeJpeg(optimized.bytes);
    expect((image.width, image.height), (100, 50));
  });

  test('keeps at least one pixel on the short side of a very thin image', () {
    final optimized = optimizeEvidenceImage(
      png(1000, 1),
      maxImageSize: 128,
      imageQuality: 80,
    );

    expect((optimized.width, optimized.height), (128, 1));
  });

  test('compresses with the policy quality', () {
    final noisy = img.Image(width: 96, height: 96);
    for (final pixel in noisy) {
      pixel
        ..r = (pixel.x * 37 + pixel.y * 11) % 256
        ..g = (pixel.x * 5 + pixel.y * 53) % 256
        ..b = (pixel.x * pixel.y) % 256;
    }
    final input = Uint8List.fromList(img.encodePng(noisy));

    final low = optimizeEvidenceImage(
      input,
      maxImageSize: 128,
      imageQuality: 10,
    );
    final high = optimizeEvidenceImage(
      input,
      maxImageSize: 128,
      imageQuality: 100,
    );

    expect(low.bytes.length, lessThan(high.bytes.length));
  });

  test('applies the EXIF orientation and keeps no EXIF metadata', () {
    final photo = img.Image(width: 40, height: 20);
    photo.exif.imageIfd
      ..orientation = 6
      ..make = 'Fabricante'
      ..gpsLatitude = -12.05;
    final input = Uint8List.fromList(img.encodeJpg(photo));
    expect(img.decodeJpg(input)!.exif.imageIfd.make, 'Fabricante');

    final optimized = optimizeEvidenceImage(
      input,
      maxImageSize: 1024,
      imageQuality: 80,
    );

    final image = decodeJpeg(optimized.bytes);
    expect((image.width, image.height), (20, 40));
    expect(image.exif.isEmpty, isTrue);
  });

  test('fails for bytes that are not an image', () {
    expect(
      () => optimizeEvidenceImage(
        Uint8List.fromList([1, 2, 3]),
        maxImageSize: 1024,
        imageQuality: 80,
      ),
      throwsFormatException,
    );
  });
}
