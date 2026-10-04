/// The connection the device uses right now, as the SDK's native plugin
/// reports it (US-069). The SDK reads it before sending evidence and never
/// stores or sends it.
enum NetworkType {
  /// The device's default connection is a Wi-Fi network.
  wifi,

  /// The device's default connection is a mobile data network.
  cellular,

  /// The device is connected through another kind of network, such as
  /// Ethernet, or the platform could not say which one.
  other,

  /// The device has no connection.
  none,
}

/// Reads the current [NetworkType]; tests replace it through
/// `createAyniSdkForTesting`.
typedef NetworkTypeReader = Future<NetworkType> Function();

/// The [NetworkType] that the native plugin names [name], or
/// [NetworkType.other] for any name it does not know.
NetworkType networkTypeNamed(Object? name) => switch (name) {
  'wifi' => NetworkType.wifi,
  'cellular' => NetworkType.cellular,
  'none' => NetworkType.none,
  _ => NetworkType.other,
};
