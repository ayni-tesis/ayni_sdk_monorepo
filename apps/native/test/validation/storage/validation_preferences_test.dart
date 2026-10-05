import 'dart:convert';

import 'package:better_fullstack_app/validation/storage/validation_preferences.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late _MemorySecureStore secureStore;
  late ValidationPreferences preferences;

  setUp(() {
    secureStore = _MemorySecureStore();
    preferences = ValidationPreferences(secureStore: secureStore);
  });

  test('stores SDK URL and credential in one secure value', () async {
    const credentials = ValidationSdkCredentials(
      serverUrl: 'https://validation.example.test',
      credential: 'secret-sdk-credential',
    );

    await preferences.saveSdkCredentials(credentials);

    expect(secureStore.values.keys, {'validation.sdk-credentials'});
    expect(jsonDecode(secureStore.values['validation.sdk-credentials']!), {
      'serverUrl': credentials.serverUrl,
      'credential': credentials.credential,
    });
    final restored = await preferences.readSdkCredentials();
    expect(restored?.serverUrl, credentials.serverUrl);
    expect(restored?.credential, credentials.credential);
  });

  test('migrates legacy credential keys to the atomic secure value', () async {
    secureStore.values['validation.server-url'] =
        'https://validation.example.test';
    secureStore.values['validation.sdk-credential'] = 'secret-sdk-credential';

    final credentials = await preferences.readSdkCredentials();

    expect(credentials?.serverUrl, 'https://validation.example.test');
    expect(credentials?.credential, 'secret-sdk-credential');
    expect(secureStore.values.keys, {'validation.sdk-credentials'});
  });
}

class _MemorySecureStore implements ValidationSecureStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}
