import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class ValidationSecureStore {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

class FlutterValidationSecureStore implements ValidationSecureStore {
  FlutterValidationSecureStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

class ValidationSdkCredentials {
  const ValidationSdkCredentials({
    required this.serverUrl,
    required this.credential,
  });

  final String serverUrl;
  final String credential;

  @override
  String toString() =>
      'ValidationSdkCredentials(serverUrl: $serverUrl, credential: [REDACTED])';
}

class ValidationPreferences {
  static const tracePermissionDisclosure =
      'Se enviará a Ayni la traza técnica del SDK, incluidas las salidas tipadas decodificadas. No se enviarán imágenes, tensores ni el JSONL completo.';

  ValidationPreferences({required ValidationSecureStore secureStore})
    : _secureStore = secureStore;

  static const _serverUrlKey = 'validation.server-url';
  static const _credentialKey = 'validation.sdk-credential';
  static const _traceCaptureAllowedKey = 'validation.trace-capture-allowed';
  static const _credentialsKey = 'validation.sdk-credentials';
  static const _tracePolicyKey = 'validation.trace-policy';

  final ValidationSecureStore _secureStore;

  Future<bool> get traceCaptureAllowed async =>
      (await _readTracePolicy()).allowed;

  Future<ValidationSdkCredentials?> readSdkCredentials() async {
    final storedCredentials = await _secureStore.read(_credentialsKey);
    if (storedCredentials != null) {
      try {
        final value = jsonDecode(storedCredentials);
        if (value is Map &&
            value.keys.toSet().containsAll(const {'serverUrl', 'credential'}) &&
            value['serverUrl'] is String &&
            value['credential'] is String) {
          final serverUrl = value['serverUrl'] as String;
          final credential = value['credential'] as String;
          if (serverUrl.isNotEmpty && credential.isNotEmpty) {
            return ValidationSdkCredentials(
              serverUrl: serverUrl,
              credential: credential,
            );
          }
        }
      } on FormatException {
        return null;
      }
      return null;
    }

    // Migrate credentials stored by earlier app versions. The new single-key
    // write makes future URL/secret updates atomic.
    final serverUrl = await _secureStore.read(_serverUrlKey);
    final credential = await _secureStore.read(_credentialKey);
    if (serverUrl == null || credential == null) return null;
    final credentials = ValidationSdkCredentials(
      serverUrl: serverUrl,
      credential: credential,
    );
    await saveSdkCredentials(credentials);
    return credentials;
  }

  Future<void> saveSdkCredentials(ValidationSdkCredentials credentials) async {
    await _secureStore.write(
      _credentialsKey,
      jsonEncode({
        'serverUrl': credentials.serverUrl,
        'credential': credentials.credential,
      }),
    );
    await _secureStore.delete(_serverUrlKey);
    await _secureStore.delete(_credentialKey);
  }

  Future<void> clearSdkCredentials() async {
    await _secureStore.delete(_credentialsKey);
    await _secureStore.delete(_credentialKey);
    await _secureStore.delete(_serverUrlKey);
  }

  Future<void> setTraceCaptureAllowed(
    bool allowed, {
    required Future<void> Function() clearPendingTraces,
  }) async {
    final current = await _readTracePolicy();
    if (!allowed) {
      // Persist revocation and the pending purge together before touching the
      // SDK outbox. If the purge fails, a later grant must retry it.
      await _writeTracePolicy(allowed: false, purgeRequired: true);
      await clearPendingTraces();
      await _writeTracePolicy(allowed: false, purgeRequired: false);
      return;
    }

    if (current.purgeRequired) await clearPendingTraces();
    await _writeTracePolicy(allowed: true, purgeRequired: false);
  }

  Future<_StoredTracePolicy> _readTracePolicy() async {
    final storedPolicy = await _secureStore.read(_tracePolicyKey);
    if (storedPolicy == null) {
      return _StoredTracePolicy(
        allowed: await _secureStore.read(_traceCaptureAllowedKey) == 'true',
        purgeRequired: false,
      );
    }
    try {
      final value = jsonDecode(storedPolicy);
      if (value is Map &&
          value.keys.toSet().containsAll(const {'allowed', 'purgeRequired'}) &&
          value['allowed'] is bool &&
          value['purgeRequired'] is bool) {
        return _StoredTracePolicy(
          allowed: value['allowed'] as bool,
          purgeRequired: value['purgeRequired'] as bool,
        );
      }
    } on FormatException {
      // Fail closed if the durable privacy state is unreadable.
    }
    return const _StoredTracePolicy(allowed: false, purgeRequired: true);
  }

  Future<void> _writeTracePolicy({
    required bool allowed,
    required bool purgeRequired,
  }) => _secureStore.write(
    _tracePolicyKey,
    jsonEncode({'allowed': allowed, 'purgeRequired': purgeRequired}),
  );

  @override
  String toString() => 'ValidationPreferences(traceCaptureAllowed: [PRIVATE])';
}

class _StoredTracePolicy {
  const _StoredTracePolicy({
    required this.allowed,
    required this.purgeRequired,
  });

  final bool allowed;
  final bool purgeRequired;
}
