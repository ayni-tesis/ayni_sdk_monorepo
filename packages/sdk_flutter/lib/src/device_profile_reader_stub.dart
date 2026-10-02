import 'device_profile.dart';

/// Returns an unknown profile when no Flutter device channel is available.
Future<DeviceProfile> readDeviceProfile() async =>
    const DeviceProfile(platform: 'unknown');
