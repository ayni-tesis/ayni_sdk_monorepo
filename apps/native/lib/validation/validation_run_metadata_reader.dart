import 'package:flutter/services.dart';

import 'models/validation_run_metadata.dart';

const validationSdkVersion = '0.4.0';

class ValidationRunMetadataReader {
  const ValidationRunMetadataReader({
    MethodChannel channel = const MethodChannel('ayni_validation/run_metadata'),
  }) : _channel = channel;

  final MethodChannel _channel;

  Future<ValidationRunMetadata> read() async {
    final values = await _channel.invokeMapMethod<String, Object?>('read');
    if (values == null) {
      throw const FormatException('Device metadata is unavailable.');
    }
    return ValidationRunMetadata.fromJson({
      'deviceModel': values['deviceModel'],
      'platform': values['platform'],
      'osVersion': values['osVersion'],
      'apiLevel': values['apiLevel'],
      'appVersion': values['appVersion'],
      'sdkVersion': validationSdkVersion,
    });
  }
}
