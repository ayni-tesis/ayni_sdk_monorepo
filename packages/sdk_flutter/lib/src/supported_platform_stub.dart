// The pure Dart VM is used by this package's tests. A real Flutter runtime
// uses supported_platform_flutter.dart, including Flutter desktop and web.

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

int? _readIosMajorVersion() {
  if (_hasTestIosMajorVersion) {
    return _testIosMajorVersion;
  }
  return _testIosMajorVersion;
}

/// Whether the current device is running an unsupported Android version (< 26).
bool get isUnsupportedAndroid {
  if (_testIsAndroid == true) {
    if (_testAndroidSdkVersion == null ||
        _testAndroidSdkVersion! < minimumAndroidSdkVersion) {
      return true;
    }
  }
  return false;
}

/// Whether the current device is running an unsupported iOS version (< 11.0).
bool get isUnsupportedIos {
  if (_testIsIos == true) {
    final major = _readIosMajorVersion();
    if (major == null || major < minimumIosMajorVersion) {
      return true;
    }
  }
  return false;
}

/// Whether this non-Flutter test runtime is treated as supported.
bool get isSupported {
  if (_testIsWeb == true) return false;
  if (_testIsAndroid == true) {
    if (_testAndroidSdkVersion == null ||
        _testAndroidSdkVersion! < minimumAndroidSdkVersion) {
      return false;
    }
    return true;
  }
  if (_testIsIos == true) {
    final major = _readIosMajorVersion();
    if (major == null || major < minimumIosMajorVersion) {
      return false;
    }
    return true;
  }
  if (_testIsAndroid == false && _testIsIos == false) return false;
  return true;
}
