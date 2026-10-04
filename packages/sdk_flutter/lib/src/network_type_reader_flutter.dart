import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'network_type.dart';

const _networkChannel = MethodChannel('dev.ayni.ayni_sdk/network');

/// Asks the SDK's native plugin which connection the device uses right now
/// (US-069): `ConnectivityManager` on Android and `NWPathMonitor` on iOS.
///
/// Any other platform, or a failed, late or unknown answer, is
/// [NetworkType.other], which never counts as Wi-Fi.
Future<NetworkType> readNetworkType() async {
  if (defaultTargetPlatform != TargetPlatform.android &&
      defaultTargetPlatform != TargetPlatform.iOS) {
    return NetworkType.other;
  }
  try {
    return networkTypeNamed(
      await _networkChannel
          .invokeMethod<String>('getNetworkType')
          .timeout(networkTypeTimeout, onTimeout: () => null),
    );
  } catch (_) {
    return NetworkType.other;
  }
}
