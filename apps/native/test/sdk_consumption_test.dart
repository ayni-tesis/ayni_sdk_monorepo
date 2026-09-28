import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final supportsSdkPlatform = Platform.isAndroid || Platform.isIOS;

  group('better_fullstack_app ayni_sdk consumption', () {
    late Directory tempStorage;

    setUp(() {
      AyniSdk.resetForTesting();
      tempStorage = Directory.systemTemp.createTempSync('consumer_sdk_test_');
    });

    tearDown(() {
      AyniSdk.resetForTesting();
      if (tempStorage.existsSync()) {
        tempStorage.deleteSync(recursive: true);
      }
    });

    test(
      'consumes ayni_sdk as an independent Flutter/Dart package without compile-time dashboard dependencies',
      () {
        expect(AyniSdk.isInitialized, isFalse);
        expect(
          () => AyniSdk.instance,
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              contains('AyniSdk no está inicializado'),
            ),
          ),
        );
      },
    );

    test(
      'accepts generic runtime configuration without requiring application secrets at compile time',
      () {
        const runtimeSecret = 'runtime_credential_from_env_or_vault';
        final config = AyniConfig(
          serverUrl: Uri.parse('https://ayni.example.com'),
          credential: runtimeSecret,
          storageDirectory: tempStorage,
        );

        expect(config.isValid, isTrue);

        final result = AyniSdk.initialize(config);

        if (!supportsSdkPlatform) {
          expect(
            result.status,
            equals(InitializationStatus.unsupportedPlatform),
          );
          expect(
            result.message,
            equals('Esta plataforma no es compatible con ayni_sdk.'),
          );
          expect(result.sdk, isNull);
          expect(AyniSdk.isInitialized, isFalse);
          expect(() => AyniSdk.instance, throwsA(isA<StateError>()));
          expect(
            tempStorage.listSync(),
            isEmpty,
            reason:
                'Initialization must not access or install model artifacts.',
          );
          return;
        }

        expect(result.status, equals(InitializationStatus.ready));
        expect(result.isSuccess, isTrue);
        expect(result.message, equals('SDK listo.'));
        expect(AyniSdk.isInitialized, isTrue);
        expect(AyniSdk.instance, isNotNull);
        expect(
          AyniSdk.instance.serverUrl,
          equals(Uri.parse('https://ayni.example.com')),
        );
        expect(
          AyniSdk.instance.storageDirectory.path,
          equals(tempStorage.path),
        );
      },
    );

    test(
      'handles incomplete runtime configuration gracefully without partial initialization',
      () {
        final incompleteConfig = AyniConfig(
          serverUrl: Uri.parse('https://ayni.example.com'),
          credential: '   ',
          storageDirectory: tempStorage,
        );

        expect(incompleteConfig.isValid, isFalse);

        final result = AyniSdk.initialize(incompleteConfig);

        expect(
          result.status,
          equals(
            supportsSdkPlatform
                ? InitializationStatus.incompleteConfiguration
                : InitializationStatus.unsupportedPlatform,
          ),
        );
        expect(result.isSuccess, isFalse);
        expect(AyniSdk.isInitialized, isFalse);
        expect(() => AyniSdk.instance, throwsA(isA<StateError>()));
      },
    );

    test(
      'configures Android TensorFlow Lite runtime and rejects incompatible Android version (US-092)',
      () {
        final config = AyniConfig(
          serverUrl: Uri.parse('https://ayni.example.com'),
          credential: 'runtime_credential_from_env_or_vault',
          storageDirectory: tempStorage,
        );

        // 1. Incompatible Android version (< 26) reports unsupportedPlatform
        // with specific message and fails before loading models
        AyniSdk.setPlatformForTesting(
          isAndroid: true,
          androidSdkVersion: 25,
        );

        final incompatibleResult = AyniSdk.initialize(config);

        expect(
          incompatibleResult.status,
          equals(InitializationStatus.unsupportedPlatform),
        );
        expect(
          incompatibleResult.message,
          equals('Este dispositivo Android no cumple el requisito mínimo del SDK.'),
        );
        expect(incompatibleResult.isSuccess, isFalse);
        expect(incompatibleResult.sdk, isNull);
        expect(AyniSdk.isInitialized, isFalse);
        expect(() => AyniSdk.instance, throwsA(isA<StateError>()));

        // 2. Compatible Android version (>= 26) compiles and provides ready runtime
        AyniSdk.setPlatformForTesting(
          isAndroid: true,
          androidSdkVersion: 26,
        );

        final compatibleResult = AyniSdk.initialize(config);

        expect(compatibleResult.status, equals(InitializationStatus.ready));
        expect(compatibleResult.message, equals('SDK listo.'));
        expect(compatibleResult.isSuccess, isTrue);
        expect(AyniSdk.isInitialized, isTrue);
        expect(AyniSdk.instance, isNotNull);
      },
    );
  });
}

