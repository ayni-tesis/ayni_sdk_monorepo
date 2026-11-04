import 'dart:io';

import 'package:flutter/services.dart';

const _channel = MethodChannel('dev.ayni.ayni_sdk/file_digest');

/// Uses Android's SHA-256 provider; other platforms use the Dart fallback.
Future<String?> sha256FileNative(String path) async {
  if (!Platform.isAndroid) return null;
  return _channel.invokeMethod<String>('sha256File', {'path': path});
}
