import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';
import 'package:flutter/foundation.dart';

/// Minimum supported Android API level (Android 8.0 Oreo).
const int minimumAndroidSdkVersion = 26;

/// Minimum supported iOS major version (iOS 11.0).
const int minimumIosMajorVersion = 11;

const Object _unsetPlatformOverride = Object();

int? _testAndroidSdkVersion;
int? _testIosMajorVersion;
bool _hasTestIosMajorVersion = false;
bool? _testIsAndroid;
bool? _testIsIos;
bool? _testIsWeb;

/// Sets platform configuration overrides for testing.
void setPlatformOverrideForTesting({
  int? androidSdkVersion,
  Object? iosMajorVersion = _unsetPlatformOverride,
  bool? isAndroid,
  bool? isIos,
  bool? isWeb,
}) {
  _testAndroidSdkVersion = androidSdkVersion;
  if (!identical(iosMajorVersion, _unsetPlatformOverride)) {
    _hasTestIosMajorVersion = true;
    _testIosMajorVersion = iosMajorVersion as int?;
  }
  _testIsAndroid = isAndroid;
  _testIsIos = isIos;
  _testIsWeb = isWeb;
}

/// Resets any platform configuration overrides.
void resetPlatformForTesting() {
  _testAndroidSdkVersion = null;
  _testIosMajorVersion = null;
  _hasTestIosMajorVersion = false;
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
    final getProp = libc
        .lookupFunction<
          Int32 Function(Pointer<Utf8>, Pointer<Utf8>),
          int Function(Pointer<Utf8>, Pointer<Utf8>)
        >('__system_property_get');
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

int? _readIosMajorVersion() {
  if (_hasTestIosMajorVersion) {
    return _testIosMajorVersion;
  }
  if (!_isIos) {
    return null;
  }
  try {
    final sysctl = DynamicLibrary.process()
        .lookupFunction<
          Int32 Function(
            Pointer<Utf8>,
            Pointer<Utf8>,
            Pointer<IntPtr>,
            Pointer<Void>,
            IntPtr,
          ),
          int Function(
            Pointer<Utf8>,
            Pointer<Utf8>,
            Pointer<IntPtr>,
            Pointer<Void>,
            int,
          )
        >('sysctlbyname');
    final name = 'kern.osproductversion'.toNativeUtf8();
    final buffer = calloc<Uint8>(64).cast<Utf8>();
    final sizePtr = calloc<IntPtr>()..value = 64;
    try {
      final res = sysctl(name, buffer, sizePtr, nullptr, 0);
      if (res == 0) {
        final verStr = buffer.toDartString();
        final major = int.tryParse(verStr.split('.').first);
        if (major != null) return major;
      }
    } finally {
      calloc.free(name);
      calloc.free(buffer);
      calloc.free(sizePtr);
    }
  } catch (_) {
    // Fallback to Platform.operatingSystemVersion
  }
  try {
    final osVersion = Platform.operatingSystemVersion;
    final match = RegExp(
      r'(?:Version\s+)?(\d+)(?:\.(\d+))?',
    ).firstMatch(osVersion);
    if (match != null) {
      return int.tryParse(match.group(1)!);
    }
  } catch (_) {}
  return null;
}

/// Whether the current device is running an unsupported Android version (< 26).
bool get isUnsupportedAndroid {
  if (_isWeb) return false;
  if (!_isAndroid) return false;
  final sdkInt = _readAndroidSdkVersion();
  if (sdkInt == null || sdkInt < minimumAndroidSdkVersion) {
    return true;
  }
  return false;
}

/// Whether the current device is running an unsupported iOS version (< 11.0).
bool get isUnsupportedIos {
  if (_isWeb) return false;
  if (!_isIos) return false;
  final major = _readIosMajorVersion();
  if (major == null || major < minimumIosMajorVersion) {
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
  if (_isIos) {
    return !isUnsupportedIos;
  }
  return false;
}
