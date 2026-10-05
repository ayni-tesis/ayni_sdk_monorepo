class ValidationRunMetadata {
  const ValidationRunMetadata({
    required this.deviceModel,
    required this.platform,
    required this.osVersion,
    required this.apiLevel,
    required this.appVersion,
    required this.sdkVersion,
  });

  final String deviceModel;
  final String platform;
  final String osVersion;
  final int apiLevel;
  final String appVersion;
  final String sdkVersion;

  Map<String, Object?> toJson() => {
    'deviceModel': deviceModel,
    'platform': platform,
    'osVersion': osVersion,
    'apiLevel': apiLevel,
    'appVersion': appVersion,
    'sdkVersion': sdkVersion,
  };

  factory ValidationRunMetadata.fromJson(Map<String, Object?> json) {
    const keys = {
      'deviceModel',
      'platform',
      'osVersion',
      'apiLevel',
      'appVersion',
      'sdkVersion',
    };
    if (json.keys.toSet().difference(keys).isNotEmpty ||
        keys.difference(json.keys.toSet()).isNotEmpty) {
      throw const FormatException(
        'Run metadata has missing or unknown fields.',
      );
    }
    final metadata = ValidationRunMetadata(
      deviceModel: _requiredString(json['deviceModel'], 'deviceModel'),
      platform: _requiredString(json['platform'], 'platform'),
      osVersion: _requiredString(json['osVersion'], 'osVersion'),
      apiLevel: _requiredInt(json['apiLevel'], 'apiLevel'),
      appVersion: _requiredString(json['appVersion'], 'appVersion'),
      sdkVersion: _requiredString(json['sdkVersion'], 'sdkVersion'),
    );
    if (metadata.apiLevel < 1) {
      throw const FormatException('apiLevel must be positive.');
    }
    return metadata;
  }
}

String _requiredString(Object? value, String name) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$name must be a non-empty string.');
  }
  return value;
}

int _requiredInt(Object? value, String name) {
  if (value is! int) throw FormatException('$name must be an integer.');
  return value;
}
