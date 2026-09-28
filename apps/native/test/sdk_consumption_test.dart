import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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

        expect(result.status, equals(InitializationStatus.ready));
        expect(result.isSuccess, isTrue);
        expect(result.message, equals('SDK listo.'));
        expect(AyniSdk.isInitialized, isTrue);
        expect(AyniSdk.instance, isNotNull);
        expect(
          AyniSdk.instance.serverUrl,
          equals(Uri.parse('https://ayni.example.com')),
        );
        expect(AyniSdk.instance.storageDirectory.path, equals(tempStorage.path));
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
          equals(InitializationStatus.incompleteConfiguration),
        );
        expect(result.isSuccess, isFalse);
        expect(AyniSdk.isInitialized, isFalse);
        expect(() => AyniSdk.instance, throwsA(isA<StateError>()));
      },
    );
  });
}
