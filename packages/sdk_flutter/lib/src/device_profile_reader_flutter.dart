import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'device_profile.dart';

const _deviceProfileChannel = MethodChannel('dev.ayni.ayni_sdk/device_profile');

/// Reads only the device fields allowed in a diagnostic profile.
Future<DeviceProfile> readDeviceProfile() async {
  try {
    if (defaultTargetPlatform != TargetPlatform.android &&
        defaultTargetPlatform != TargetPlatform.iOS) {
      return const DeviceProfile(platform: 'unknown');
    }
    final runtimeInfo = await _deviceProfileChannel
        .invokeMapMethod<String, Object?>('getDeviceProfile')
        .catchError((_) => null);
    final ramRange = _ramRange(runtimeInfo?['totalMemoryBytes']);
    final socValue = runtimeInfo?['socModel'];
    final socModel = _availableText(socValue is String ? socValue : '');
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return DeviceProfile(
          platform: 'android',
          osVersion: _profileText(runtimeInfo, 'osVersion'),
          apiLevel: _profileInt(runtimeInfo, 'apiLevel'),
          model: _profileText(runtimeInfo, 'model'),
          ramRange: ramRange,
          socModel: socModel,
        );
      case TargetPlatform.iOS:
        return DeviceProfile(
          platform: 'ios',
          osVersion: _profileText(runtimeInfo, 'osVersion'),
          model: _profileText(runtimeInfo, 'model'),
          ramRange: ramRange,
        );
      case TargetPlatform.fuchsia:
      case TargetPlatform.linux:
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
        return const DeviceProfile(platform: 'unknown');
    }
  } catch (_) {
    return const DeviceProfile(platform: 'unknown');
  }
}

String? _profileText(Map<String, Object?>? profile, String key) {
  final value = profile?[key];
  return _availableText(value is String ? value : '');
}

int? _profileInt(Map<String, Object?>? profile, String key) {
  final value = profile?[key];
  return value is num && value > 0 ? value.toInt() : null;
}

String? _ramRange(Object? value) {
  if (value is! num || value <= 0) return null;
  final gib = value / (1024 * 1024 * 1024);
  if (gib < 4) return '<4 GB';
  if (gib < 8) return '4–<8 GB';
  if (gib < 12) return '8–<12 GB';
  if (gib < 16) return '12–<16 GB';
  return '≥16 GB';
}

String? _availableText(String value) {
  final text = value.trim();
  return text.isEmpty || text.toLowerCase() == 'unknown' ? null : text;
}
