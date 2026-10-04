// US-069: the SDK asks its native plugin which connection the device uses,
// and only Wi-Fi satisfies a collection policy that allows only Wi-Fi.
import 'dart:async';
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

const _channel = MethodChannel('dev.ayni.ayni_sdk/network');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AyniSdk.evidenceQueueStatus', () {
    late Directory storageDirectory;
    late int calls;
    late Object? Function() nativeAnswer;

    setUp(() async {
      storageDirectory = await Directory.systemTemp.createTemp(
        'ayni-network-type-',
      );
      // A pending evidence and a saved policy that allows only Wi-Fi.
      await Directory(
        '${storageDirectory.path}/evidence/evidence-1',
      ).create(recursive: true);
      final policy = File(
        '${storageDirectory.path}/diagnostics/collection-policy.json',
      );
      await policy.parent.create(recursive: true);
      await policy.writeAsString(
        '{"enabled":true,"network":"wifi",'
        '"maxImageSize":1024,"imageQuality":80}',
      );
      calls = 0;
      nativeAnswer = () => 'wifi';
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_channel, (call) async {
            // An expect here would be swallowed by the reader, which turns
            // any failure into `other`; each test checks `calls` instead.
            if (call.method != 'getNetworkType') return null;
            calls++;
            return nativeAnswer();
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

    for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
      test(
        'is pending on ${platform.name} when the device uses Wi-Fi',
        () async {
          debugDefaultTargetPlatformOverride = platform;

          final status = await createSdk().evidenceQueueStatus();

          expect(status, EvidenceQueueStatus.pending);
          expect(calls, 1);
        },
      );
    }

    for (final answer in ['cellular', 'none', 'other', 'satellite', null]) {
      test('waits for Wi-Fi when the plugin answers $answer', () async {
        debugDefaultTargetPlatformOverride = TargetPlatform.android;
        nativeAnswer = () => answer;

        expect(
          await createSdk().evidenceQueueStatus(),
          EvidenceQueueStatus.waitingForWifi,
        );
        expect(calls, 1);
      });
    }

    test('waits for Wi-Fi when the plugin fails', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      nativeAnswer = () => throw PlatformException(code: 'unavailable');

      expect(
        await createSdk().evidenceQueueStatus(),
        EvidenceQueueStatus.waitingForWifi,
      );
      expect(calls, 1);
    });

    test('waits for Wi-Fi when the plugin never answers', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final never = Completer<Object?>();
      nativeAnswer = () => never.future;

      expect(
        await createSdk().evidenceQueueStatus(),
        EvidenceQueueStatus.waitingForWifi,
      );
      expect(calls, 1);
    });

    test('does not ask a platform without the plugin', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.linux;

      expect(
        await createSdk().evidenceQueueStatus(),
        EvidenceQueueStatus.waitingForWifi,
      );
      expect(calls, 0);
    });
  });
}
