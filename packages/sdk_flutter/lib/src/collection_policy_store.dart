// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';

/// The limits of the application's collection policy that the SDK applies to
/// each evidence image (US-067): the longest side in pixels and the JPEG
/// quality, in the ranges the server accepts.
///
/// [fromJson] reads them from `GET /sdk/collection-policy` and ignores the
/// other fields of the policy, so the server can add settings without making
/// this version discard it.
class CollectionPolicy {
  const CollectionPolicy({
    required this.maxImageSize,
    required this.imageQuality,
  });

  final int maxImageSize;
  final int imageQuality;

  static CollectionPolicy? fromJson(Object? value) {
    if (value is! Map) return null;
    final maxImageSize = value['maxImageSize'];
    final imageQuality = value['imageQuality'];
    if (maxImageSize is! int ||
        maxImageSize < 128 ||
        maxImageSize > 4096 ||
        imageQuality is! int ||
        imageQuality < 10 ||
        imageQuality > 100) {
      return null;
    }
    return CollectionPolicy(
      maxImageSize: maxImageSize,
      imageQuality: imageQuality,
    );
  }

  Map<String, Object> toJson() => {
    'maxImageSize': maxImageSize,
    'imageQuality': imageQuality,
  };
}

/// Keeps the last valid [CollectionPolicy] in
/// `diagnostics/collection-policy.json`, which `AyniSdk.run` reads offline.
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
