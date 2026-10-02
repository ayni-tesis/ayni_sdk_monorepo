import 'package:device_info_plus/device_info_plus.dart';
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
    final deviceInfo = DeviceInfoPlugin();
    final runtimeInfo = await _deviceProfileChannel
        .invokeMapMethod<String, Object?>('getRuntimeProfile')
        .catchError((_) => null);
    final ramRange = _ramRange(runtimeInfo?['totalMemoryBytes']);
    final socValue = runtimeInfo?['socModel'];
    final socModel = _availableText(socValue is String ? socValue : '');
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        final info = await deviceInfo.androidInfo;
        return DeviceProfile(
          platform: 'android',
          osVersion: _availableText(info.version.release),
          apiLevel: info.version.sdkInt > 0 ? info.version.sdkInt : null,
          model: _availableText(info.model),
          ramRange: ramRange,
          socModel: socModel,
        );
      case TargetPlatform.iOS:
        final info = await deviceInfo.iosInfo;
        return DeviceProfile(
          platform: 'ios',
          osVersion: _availableText(info.systemVersion),
          model:
              _availableText(info.utsname.machine) ??
              _availableText(info.model),
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
