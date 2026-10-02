import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const _deviceInfoChannel = MethodChannel(
  'dev.fluttercommunity.plus/device_info',
);
const _runtimeProfileChannel = MethodChannel(
  'dev.ayni.ayni_sdk/device_profile',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AyniSdk.getDeviceProfile', () {
    late Directory storageDirectory;
    late int deviceInfoCalls;
    late Map<String, dynamic> deviceInfo;

    setUp(() async {
      storageDirectory = await Directory.systemTemp.createTemp(
        'ayni-device-profile-',
      );
      deviceInfoCalls = 0;
      deviceInfo = _androidInfo();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_runtimeProfileChannel, (call) async {
            expect(call.method, equals('getRuntimeProfile'));
            return {
              'totalMemoryBytes': 6 * 1024 * 1024 * 1024,
              'socModel': 'Tensor G3',
            };
          });
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_deviceInfoChannel, (call) async {
            expect(call.method, equals('getDeviceInfo'));
            deviceInfoCalls++;
            return deviceInfo;
          });
    });

    tearDown(() async {
      debugDefaultTargetPlatformOverride = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_deviceInfoChannel, null);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_runtimeProfileChannel, null);
      await storageDirectory.delete(recursive: true);
    });

    AyniSdk createSdk() => AyniSdk(
      serverUrl: Uri.parse('https://api.ayni.dev'),
      credential: 'ayni_sk_valid_secret_123',
      storageDirectory: storageDirectory,
    );

    test(
      'maps only the permitted Android device fields and coarse hardware',
      () async {
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
      },
    );

    test(
      'maps the iOS hardware model without device name or vendor identifier',
      () async {
        debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
        deviceInfo = _iosInfo();

        final profile = await createSdk().getDeviceProfile();

        expect(profile.toJson(), {
          'schemaVersion': 1,
          'platform': 'ios',
          'osVersion': '17.4',
          'model': 'iPhone15,2',
          'ramRange': '4–<8 GB',
        });
      },
    );

    test('omits blank and unavailable device fields', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      deviceInfo = _androidInfo();
      deviceInfo['version'] = {
        ...deviceInfo['version'] as Map<String, dynamic>,
        'release': '',
        'sdkInt': 0,
      };
      deviceInfo
        ..['manufacturer'] = 'Should not be exposed'
        ..['model'] = '';
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_runtimeProfileChannel, (_) async => null);

      final profile = await createSdk().getDeviceProfile();

      expect(profile.toJson(), {'schemaVersion': 1, 'platform': 'android'});
    });

    test('uses RAM ranges without exposing exact memory capacity', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            _runtimeProfileChannel,
            (_) async => {
              'totalMemoryBytes': 8 * 1024 * 1024 * 1024,
              'socModel': '',
            },
          );

      final profile = await createSdk().getDeviceProfile();

      expect(profile.toJson()['ramRange'], equals('8–<12 GB'));
      expect(profile.toJson().containsKey('totalMemoryBytes'), isFalse);
      expect(profile.toJson().containsKey('manufacturer'), isFalse);
    });

    test('returns an unknown profile and caches plugin failures', () async {
      var calls = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_deviceInfoChannel, (call) async {
            calls++;
            throw PlatformException(code: 'unavailable');
          });
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      final sdk = createSdk();

      final first = await sdk.getDeviceProfile();
      final second = await sdk.getDeviceProfile();

      expect(first.toJson(), {'schemaVersion': 1, 'platform': 'unknown'});
      expect(second, same(first));
      expect(calls, equals(1));
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

    test(
      'returns unknown on unsupported targets without querying the plugin',
      () async {
        debugDefaultTargetPlatformOverride = TargetPlatform.windows;

        final profile = await createSdk().getDeviceProfile();

        expect(profile.toJson(), {'schemaVersion': 1, 'platform': 'unknown'});
        expect(deviceInfoCalls, equals(0));
      },
    );
  });
}

Map<String, dynamic> _androidInfo() => {
  'version': {
    'baseOS': '',
    'codename': 'REL',
    'incremental': 'secret-incremental',
    'previewSdkInt': 0,
    'release': '14',
    'sdkInt': 34,
    'securityPatch': '2026-09-01',
  },
  'board': 'secret-board',
  'bootloader': 'secret-bootloader',
  'brand': 'Google',
  'device': 'secret-device',
  'display': 'secret-display',
  'fingerprint': 'secret-fingerprint',
  'hardware': 'secret-hardware',
  'host': 'secret-host',
  'id': 'secret-build-id',
  'manufacturer': 'Google',
  'model': 'Pixel 8',
  'product': 'secret-product',
  'supported32BitAbis': <String>[],
  'supported64BitAbis': <String>['arm64-v8a'],
  'supportedAbis': <String>['arm64-v8a'],
  'tags': 'release-keys',
  'type': 'user',
  'isPhysicalDevice': true,
  'systemFeatures': <String>[],
  'displayMetrics': {
    'widthPx': 1080.0,
    'heightPx': 2400.0,
    'xDpi': 420.0,
    'yDpi': 420.0,
    'density': 2.625,
  },
  'serialNumber': 'SECRET-SERIAL',
};

Map<String, dynamic> _iosInfo() => {
  'name': 'Diego personal phone',
  'systemName': 'iOS',
  'systemVersion': '17.4',
  'model': 'iPhone',
  'localizedModel': 'iPhone',
  'identifierForVendor': 'SECRET-VENDOR-ID',
  'isPhysicalDevice': 'true',
  'utsname': {
    'sysname': 'Darwin',
    'nodename': 'secret-node',
    'release': 'secret-release',
    'version': 'secret-version',
    'machine': 'iPhone15,2',
  },
};
