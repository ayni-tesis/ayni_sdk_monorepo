import 'dart:io';

import 'package:ayni_sdk/src/sha256_file.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:test/test.dart';

void main() {
  late Directory directory;
  late File file;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('ayni-digest-');
    file = File('${directory.path}/model.tflite');
    await file.writeAsBytes(List.generate(65539, (i) => i % 251));
  });

  tearDown(() async => directory.delete(recursive: true));

  test('uses a valid native digest', () async {
    final expected = crypto.sha256.convert(await file.readAsBytes()).toString();
    expect(
      await sha256File(file, nativeDigest: (_) async => expected),
      expected,
    );
  });

  test('falls back to streaming Dart SHA-256 after native failure', () async {
    final expected = crypto.sha256.convert(await file.readAsBytes()).toString();
    expect(
      await sha256File(
        file,
        nativeDigest: (_) async => throw StateError('failed'),
      ),
      expected,
    );
    expect(
      await sha256File(file, nativeDigest: (_) async => 'invalid'),
      expected,
    );
  });

  test(
    'fails when the file cannot be read instead of accepting a digest',
    () async {
      await file.delete();
      await expectLater(
        sha256File(file, nativeDigest: (_) async => null),
        throwsA(isA<FileSystemException>()),
      );
    },
  );
}
