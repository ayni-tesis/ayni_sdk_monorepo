/// Allowlisted, versioned device metadata returned by [AyniSdk.getDeviceProfile].
///
/// This value contains no device identifiers and is not persisted or sent by
/// the SDK. RAM and SoC are optional when a platform does not expose them.
class DeviceProfile {
  /// Creates a device profile with the fields available to the caller.
  const DeviceProfile({
    required this.platform,
    this.osVersion,
    this.apiLevel,
    this.model,
    this.ramRange,
    this.socModel,
    this.schemaVersion = currentSchemaVersion,
  });

  /// Current version of the serialized profile shape.
  static const int currentSchemaVersion = 1;

  /// Platform name: `android`, `ios`, or `unknown`.
  final String platform;

  /// User-visible operating system version, when available.
  final String? osVersion;

  /// Android API level, or `null` on platforms that do not expose it.
  final int? apiLevel;

  /// User-visible device model, when available.
  final String? model;

  /// Coarse physical-memory range, when available.
  final String? ramRange;

  /// SoC model exposed by the platform, when available.
  final String? socModel;

  /// Version of the serialized profile shape.
  final int schemaVersion;

  /// Serializes only the explicit device-profile allowlist.
  ///
  /// Unavailable values are omitted. Plugin fields such as serial numbers,
  /// device names, build fingerprints and vendor identifiers never enter the
  /// returned map.
  Map<String, Object> toJson() => {
    'schemaVersion': schemaVersion,
    'platform': platform,
    if (osVersion != null) 'osVersion': osVersion!,
    if (apiLevel != null) 'apiLevel': apiLevel!,
    if (model != null) 'model': model!,
    if (ramRange != null) 'ramRange': ramRange!,
    if (socModel != null) 'socModel': socModel!,
  };
}
