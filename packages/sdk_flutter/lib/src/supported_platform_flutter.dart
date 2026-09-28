import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';
import 'package:flutter/foundation.dart';

/// Minimum supported Android API level (Android 8.0 Oreo).
const int minimumAndroidSdkVersion = 26;

int? _testAndroidSdkVersion;
bool? _testIsAndroid;
bool? _testIsIos;
bool? _testIsWeb;

/// Sets platform configuration overrides for testing.
void setPlatformOverrideForTesting({
  int? androidSdkVersion,
  bool? isAndroid,
  bool? isIos,
  bool? isWeb,
}) {
  _testAndroidSdkVersion = androidSdkVersion;
  _testIsAndroid = isAndroid;
  _testIsIos = isIos;
  _testIsWeb = isWeb;
}

/// Resets any platform configuration overrides.
void resetPlatformForTesting() {
  _testAndroidSdkVersion = null;
  _testIsAndroid = null;
  _testIsIos = null;
  _testIsWeb = null;
}

bool get _isAndroid => _testIsAndroid ?? (!kIsWeb && Platform.isAndroid);
bool get _isIos => _testIsIos ?? (!kIsWeb && Platform.isIOS);
bool get _isWeb => _testIsWeb ?? kIsWeb;

int? _readAndroidSdkVersion() {
  if (_testAndroidSdkVersion != null) {
    return _testAndroidSdkVersion;
  }
  if (!_isAndroid) {
    return null;
  }
  try {
    final libc = DynamicLibrary.open('libc.so');
    final getProp = libc.lookupFunction<
        Int32 Function(Pointer<Utf8>, Pointer<Utf8>),
        int Function(Pointer<Utf8>, Pointer<Utf8>)>('__system_property_get');
    final propName = 'ro.build.version.sdk'.toNativeUtf8();
    final valueBuffer = calloc<Uint8>(92).cast<Utf8>();
    try {
      final len = getProp(propName, valueBuffer);
      if (len > 0) {
        final sdkStr = valueBuffer.toDartString();
        return int.tryParse(sdkStr);
      }
    } finally {
      calloc.free(propName);
      calloc.free(valueBuffer);
    }
  } catch (_) {
    // If native lookup fails, fallback silently.
  }
  return null;
}

/// Whether the current device is running an unsupported Android version (< 26).
bool get isUnsupportedAndroid {
  if (_isWeb) return false;
  if (!_isAndroid) return false;
  final sdkInt = _readAndroidSdkVersion();
  if (sdkInt != null && sdkInt < minimumAndroidSdkVersion) {
    return true;
  }
  return false;
}

/// Whether this Flutter runtime targets a supported mobile platform.
bool get isSupported {
  if (_isWeb) return false;
  if (_isAndroid) {
    return !isUnsupportedAndroid;
  }
  return _isIos;
}

