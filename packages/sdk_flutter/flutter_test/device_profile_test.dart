import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const _channel = MethodChannel('dev.ayni.ayni_sdk/device_profile');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AyniSdk.getDeviceProfile', () {
    late Directory storageDirectory;
    late int calls;
    late Map<String, Object?> nativeProfile;

    setUp(() async {
      storageDirectory = await Directory.systemTemp.createTemp(
        'ayni-device-profile-',
      );
      calls = 0;
      nativeProfile = _androidProfile();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_channel, (call) async {
            expect(call.method, equals('getDeviceProfile'));
            calls++;
            return nativeProfile;
          });
    });

    tearDown(() async {
      debugDefaultTargetPlatformOverride = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_channel, null);
      await storageDirectory.delete(recursive: true);
    });

    AyniSdk createSdk() => AyniSdk(
      serverUrl: Uri.parse('https://api.ayni.dev'),
      credential: 'ayni_sk_valid_secret_123',
      storageDirectory: storageDirectory,
    );

    test('maps only allowlisted Android fields and coarse RAM', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      final profile = await createSdk().getDeviceProfile();

      expect(profile.toJson(), {
        'schemaVersion': 1,
        'platform': 'android',
        'osVersion': '14',
        'apiLevel': 34,
        'model': 'Pixel 8',
        'ramRange': '4–<8 GB',
        'socModel': 'Tensor G3',
      });
    });

    test('maps iOS model without device name or vendor identifier', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      nativeProfile = {
        'platform': 'ios',
        'osVersion': '17.4',
        'model': 'iPhone15,2',
        'totalMemoryBytes': 6 * 1024 * 1024 * 1024,
        'name': 'Personal phone',
        'identifierForVendor': 'SECRET-VENDOR-ID',
      };

      final profile = await createSdk().getDeviceProfile();

      expect(profile.toJson(), {
        'schemaVersion': 1,
        'platform': 'ios',
        'osVersion': '17.4',
        'model': 'iPhone15,2',
        'ramRange': '4–<8 GB',
      });
    });

    test('omits blank and unavailable fields', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      nativeProfile = {
        'platform': 'android',
        'osVersion': ' ',
        'apiLevel': 0,
        'model': 'unknown',
        'totalMemoryBytes': 0,
        'socModel': ' ',
      };

      final profile = await createSdk().getDeviceProfile();

      expect(profile.toJson(), {'schemaVersion': 1, 'platform': 'android'});
    });

    test('uses RAM ranges without exposing exact memory capacity', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      nativeProfile = {
        ..._androidProfile(),
        'totalMemoryBytes': 8 * 1024 * 1024 * 1024,
        'socModel': '',
      };

      final profile = await createSdk().getDeviceProfile();

      expect(profile.toJson()['ramRange'], equals('8–<12 GB'));
      expect(profile.toJson().containsKey('totalMemoryBytes'), isFalse);
      expect(profile.toJson().containsKey('serialNumber'), isFalse);
      expect(profile.toJson().containsKey('fingerprint'), isFalse);
    });

    test('returns a partial profile and caches native plugin failures', () async {
      var failedCalls = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_channel, (call) async {
            failedCalls++;
            throw PlatformException(code: 'unavailable');
          });
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      final sdk = createSdk();

      final first = await sdk.getDeviceProfile();
      final second = await sdk.getDeviceProfile();

      expect(first.toJson(), {'schemaVersion': 1, 'platform': 'android'});
      expect(second, same(first));
      expect(failedCalls, equals(1));
    });

    test('does not make network requests or persist the profile', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      final sdk = createSdk();
      var networkAttempts = 0;

      final profile = await HttpOverrides.runZoned(
        sdk.getDeviceProfile,
        createHttpClient: (_) {
          networkAttempts++;
          throw StateError('Device profile must not use the network.');
        },
      );

      expect(profile.platform, equals('android'));
      expect(networkAttempts, equals(0));
      expect(storageDirectory.existsSync(), isTrue);
      expect(storageDirectory.listSync(), isEmpty);
    });

    test('returns unknown on unsupported targets without querying the plugin', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.windows;

      final profile = await createSdk().getDeviceProfile();

      expect(profile.toJson(), {'schemaVersion': 1, 'platform': 'unknown'});
      expect(calls, equals(0));
    });
  });
}

Map<String, Object?> _androidProfile() => {
  'platform': 'android',
  'osVersion': '14',
  'apiLevel': 34,
  'model': 'Pixel 8',
  'totalMemoryBytes': 6 * 1024 * 1024 * 1024,
  'socModel': 'Tensor G3',
  'serialNumber': 'SECRET-SERIAL',
  'fingerprint': 'secret-fingerprint',
  'deviceName': 'Personal phone',
};
