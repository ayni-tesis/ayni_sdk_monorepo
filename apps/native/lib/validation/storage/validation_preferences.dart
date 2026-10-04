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

  final ValidationSecureStore _secureStore;

  Future<bool> get traceCaptureAllowed async =>
      await _secureStore.read(_traceCaptureAllowedKey) == 'true';

  Future<ValidationSdkCredentials?> readSdkCredentials() async {
    final serverUrl = await _secureStore.read(_serverUrlKey);
    final credential = await _secureStore.read(_credentialKey);
    if (serverUrl == null || credential == null) return null;
    return ValidationSdkCredentials(
      serverUrl: serverUrl,
      credential: credential,
    );
  }

  Future<void> saveSdkCredentials(ValidationSdkCredentials credentials) async {
    await _secureStore.write(_serverUrlKey, credentials.serverUrl);
    await _secureStore.write(_credentialKey, credentials.credential);
  }

  Future<void> clearSdkCredentials() async {
    await _secureStore.delete(_credentialKey);
    await _secureStore.delete(_serverUrlKey);
  }

  Future<void> setTraceCaptureAllowed(
    bool allowed, {
    required Future<void> Function() clearPendingTraces,
  }) async {
    await _secureStore.write(
      _traceCaptureAllowedKey,
      allowed ? 'true' : 'false',
    );
    if (!allowed) await clearPendingTraces();
  }

  @override
  String toString() => 'ValidationPreferences(traceCaptureAllowed: [PRIVATE])';
}
