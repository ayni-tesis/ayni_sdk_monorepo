import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;

import 'sha256_file_stub.dart'
    if (dart.library.ui) 'sha256_file_flutter.dart'
    as platform;

/// Hashes a file using a native implementation when available.
Future<String> sha256File(
  File file, {
  Future<String?> Function(String path)? nativeDigest,
}) async {
  try {
    final digest = await (nativeDigest ?? platform.sha256FileNative)(file.path);
    if (digest != null && RegExp(r'^[0-9a-f]{64}$').hasMatch(digest)) {
      return digest;
    }
  } catch (_) {
    // Preserve verification when the platform implementation is unavailable.
  }
  return (await crypto.sha256.bind(file.openRead()).first).toString();
}
