import 'dart:typed_data';

import 'package:image/image.dart' as img;

import '../models/experiment_plan.dart';
import 'validation_condition_runner.dart';

Float32List prepareValidationImageTensor(
  Uint8List imageBytes,
  ValidationInputContract contract,
) {
  img.Image? decoded;
  try {
    decoded = img.decodeImage(imageBytes);
  } on Object {
    throw const ValidationExecutionException(
      'invalidImage',
      'La imagen del conjunto de datos no se pudo decodificar.',
    );
  }
  if (decoded == null) {
    throw const ValidationExecutionException(
      'invalidImage',
      'La imagen del conjunto de datos no se pudo decodificar.',
    );
  }
  final uint8Image =
      decoded.format == img.Format.uint8 && decoded.palette == null
      ? decoded
      : decoded.convert(format: img.Format.uint8, withPalette: false);
  final resized = img.copyResize(
    uint8Image,
    width: contract.width,
    height: contract.height,
  );
  final values = Float32List(
    contract.width * contract.height * contract.channels,
  );
  var index = 0;
  for (var y = 0; y < contract.height; y++) {
    for (var x = 0; x < contract.width; x++) {
      final pixel = resized.getPixel(x, y);
      final rgba = [pixel.r, pixel.g, pixel.b, pixel.a];
      for (var channel = 0; channel < contract.channels; channel++) {
        var value = rgba[contract.channels == 1 ? 0 : channel].toDouble();
        if (contract.channels == 1) value = (pixel.r + pixel.g + pixel.b) / 3;
        values[index++] = switch (contract.normalization) {
          'none' => value,
          'zero_to_one' => value / 255,
          'minus_one_to_one' => value / 127.5 - 1,
          _ => throw const ValidationExecutionException(
            'unsupportedInputContract',
            'La normalización de imagen no es compatible.',
          ),
        };
      }
    }
  }
  return values;
}
