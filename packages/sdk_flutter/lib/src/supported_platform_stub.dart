// The pure Dart VM is used by this package's tests. A real Flutter runtime
// uses supported_platform_flutter.dart, including Flutter desktop and web.

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

/// Whether the current device is running an unsupported Android version (< 26).
bool get isUnsupportedAndroid {
  if (_testIsAndroid == true) {
    if (_testAndroidSdkVersion != null &&
        _testAndroidSdkVersion! < minimumAndroidSdkVersion) {
      return true;
    }
  }
  return false;
}

/// Whether this non-Flutter test runtime is treated as supported.
bool get isSupported {
  if (_testIsWeb == true) return false;
  if (_testIsAndroid == true) {
    if (_testAndroidSdkVersion != null &&
        _testAndroidSdkVersion! < minimumAndroidSdkVersion) {
      return false;
    }
    return true;
  }
  if (_testIsIos == true) return true;
  if (_testIsAndroid == false && _testIsIos == false) return false;
  return true;
}

