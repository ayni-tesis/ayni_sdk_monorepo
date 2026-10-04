// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';

import 'network_type.dart';

/// The networks over which the collection policy lets the SDK send evidence,
/// as `COLLECTION_NETWORKS` in `@ayni/api/collection-policy`: `Solo Wi-Fi`
/// and `Wi-Fi y datos móviles`.
enum CollectionNetwork { wifi, wifiAndCellular }

/// What the SDK applies of the application's collection policy: the limits
/// of each evidence image (US-067), the longest side in pixels and the JPEG
/// quality, in the ranges the server accepts, and whether and over which
/// network it may send evidence (US-069).
///
/// [fromJson] reads them from `GET /sdk/collection-policy` and ignores the
/// other fields of the policy, so the server can add settings without making
/// this version discard it.
class CollectionPolicy {
  const CollectionPolicy({
    required this.maxImageSize,
    required this.imageQuality,
    this.enabled = false,
    this.network,
  });

  /// The accepted [maxImageSize], as `COLLECTION_MAX_IMAGE_SIZE` in
  /// `@ayni/api/collection-policy` (the docs' privacy page test compares them).
  static const maxImageSizeRange = (min: 128, max: 4096);

  /// The accepted [imageQuality], as `COLLECTION_IMAGE_QUALITY` in
  /// `@ayni/api/collection-policy`.
  static const imageQualityRange = (min: 10, max: 100);

  final int maxImageSize;
  final int imageQuality;

  /// Whether the application collects evidence. Only `true` lets the SDK send
  /// it; a policy saved before the SDK read this field counts as disabled.
  final bool enabled;

  /// The network over which the SDK may send evidence, or `null` when the
  /// policy names none this version knows, which lets it send over none.
  final CollectionNetwork? network;

  /// Whether this policy lets the SDK send evidence while the device uses
  /// [connection]: only when collection is [enabled], and then only over
  /// Wi-Fi for [CollectionNetwork.wifi] and over Wi-Fi or mobile data for
  /// [CollectionNetwork.wifiAndCellular]. Another or an unknown connection
  /// ([NetworkType.other]) never qualifies.
  bool allowsEvidenceUploadOver(NetworkType connection) =>
      enabled &&
      switch (network) {
        CollectionNetwork.wifi => connection == NetworkType.wifi,
        CollectionNetwork.wifiAndCellular =>
          connection == NetworkType.wifi || connection == NetworkType.cellular,
        null => false,
      };

  /// Whether the only thing that keeps the SDK from sending evidence under
  /// this policy is that the device does not use Wi-Fi, which the queue
  /// reports as `Pendiente de Wi-Fi`.
  bool waitsForWifiOn(NetworkType connection) =>
      enabled &&
      network == CollectionNetwork.wifi &&
      !allowsEvidenceUploadOver(connection);

  static CollectionPolicy? fromJson(Object? value) {
    if (value is! Map) return null;
    final maxImageSize = value['maxImageSize'];
    final imageQuality = value['imageQuality'];
    if (maxImageSize is! int ||
        maxImageSize < maxImageSizeRange.min ||
        maxImageSize > maxImageSizeRange.max ||
        imageQuality is! int ||
        imageQuality < imageQualityRange.min ||
        imageQuality > imageQualityRange.max) {
      return null;
    }
    return CollectionPolicy(
      maxImageSize: maxImageSize,
      imageQuality: imageQuality,
      enabled: value['enabled'] == true,
      network: CollectionNetwork.values.asNameMap()[value['network']],
    );
  }

  Map<String, Object> toJson() => {
    'enabled': enabled,
    if (network != null) 'network': network!.name,
    'maxImageSize': maxImageSize,
    'imageQuality': imageQuality,
  };
}

/// Keeps the last valid [CollectionPolicy] in
/// `diagnostics/collection-policy.json`, which `AyniSdk.run` and
/// `AyniSdk.evidenceQueueStatus` read offline.
class CollectionPolicyStore {
  CollectionPolicyStore(Directory directory)
    : _file = File(
        '${directory.path}${Platform.pathSeparator}diagnostics${Platform.pathSeparator}collection-policy.json',
      );

  final File _file;

  Future<CollectionPolicy?> read() async {
    if (!await _file.exists()) return null;
    try {
      return CollectionPolicy.fromJson(jsonDecode(await _file.readAsString()));
    } on FormatException {
      return null;
    }
  }

  Future<void> write(CollectionPolicy policy) async {
    await _file.parent.create(recursive: true);
    final temporary = File(
      '${_file.path}.${DateTime.now().microsecondsSinceEpoch}.tmp',
    );
    try {
      await temporary.writeAsString(jsonEncode(policy.toJson()), flush: true);
      await temporary.rename(_file.path);
    } finally {
      if (await temporary.exists()) await temporary.delete();
    }
  }
}
