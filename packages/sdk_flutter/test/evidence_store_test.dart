// US-068: the local queue of evidence pending upload.
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/src/evidence_store.dart';
import 'package:ayni_sdk/src/sdk_internal.dart';
import 'package:test/test.dart';

void main() {
  late Directory storageDirectory;
  late Directory evidenceDirectory;

  setUp(() {
    storageDirectory = Directory.systemTemp.createTempSync('ayni-queue-');
    evidenceDirectory = Directory('${storageDirectory.path}/evidence');
  });

  tearDown(() => storageDirectory.deleteSync(recursive: true));

  Future<EvidenceContent> content() async => (
    image: Uint8List.fromList([1, 2, 3]),
    record: <String, Object?>{'evidenceSchemaVersion': 1},
  );

  group('pendingCount', () {
    test('is zero before any evidence was saved', () async {
      expect(await EvidenceStore(storageDirectory).pendingCount(), 0);
    });

    test('counts each saved evidence, also from a new store', () async {
      final store = EvidenceStore(storageDirectory);
      await store.save('evidence-1', content);
      await store.save('evidence-2', content);

      expect(await store.pendingCount(), 2);
      expect(await EvidenceStore(storageDirectory).pendingCount(), 2);
    });

    test('skips an evidence a stopped process left half-written', () async {
      Directory('${evidenceDirectory.path}/evidence-1.tmp')
        ..createSync(recursive: true);
      File(
        '${evidenceDirectory.path}/evidence-1.tmp/image',
      ).writeAsBytesSync([1]);

      expect(await EvidenceStore(storageDirectory).pendingCount(), 0);
    });

    test('does not wait for the evidence being written', () async {
      final release = Completer<void>();
      final writing = Completer<void>();
      final store = EvidenceStore(
        storageDirectory,
        writeFile: (file, bytes) async {
          if (!writing.isCompleted) writing.complete();
          await release.future;
          await file.writeAsBytes(bytes, flush: true);
        },
      );

      final saving = store.save('evidence-1', content);
      await writing.future;

      expect(await store.pendingCount(), 0);
      release.complete();
      await saving;
      expect(await store.pendingCount(), 1);
    });

    test('is zero after clear', () async {
      final store = EvidenceStore(storageDirectory);
      await store.save('evidence-1', content);

      await store.clear();

      expect(await store.pendingCount(), 0);
    });
  });

  group('markReceived (US-070)', () {
    test('takes the evidence out of the queue and keeps its files', () async {
      final store = EvidenceStore(storageDirectory);
      await store.save('evidence-1', content);
      await store.save('evidence-2', content);
      final received = Directory('${evidenceDirectory.path}/evidence-1');

      await store.markReceived(received, DateTime.utc(2026, 10, 3, 12));

      expect(
        await store
            .pending()
            .map((d) => d.uri.pathSegments.lastWhere((s) => s != ''))
            .toList(),
        ['evidence-2'],
      );
      expect(await EvidenceStore(storageDirectory).pendingCount(), 1);
      expect(File('${received.path}/image').readAsBytesSync(), [1, 2, 3]);
      expect(
        File('${received.path}/evidence.json').readAsStringSync(),
        '{"evidenceSchemaVersion":1}',
      );
      expect(
        File('${received.path}/received.json').readAsStringSync(),
        '{"evidenceId":"evidence-1","receivedAt":"2026-10-03T12:00:00.000Z"}',
      );
      expect(received.listSync().map((e) => e.uri.pathSegments.last), {
        'image',
        'evidence.json',
        'received.json',
      });
    });

    test('fails without leaving files when the evidence was cleared', () async {
      final store = EvidenceStore(storageDirectory);
      await store.save('evidence-1', content);
      final received = Directory('${evidenceDirectory.path}/evidence-1');
      await store.clear();

      await expectLater(
        store.markReceived(received, DateTime.utc(2026, 10, 3)),
        throwsA(isA<FileSystemException>()),
      );
      expect(evidenceDirectory.existsSync(), isFalse);
    });
  });

  group('save', () {
    test('leaves no partial file when a write fails', () async {
      var writes = 0;
      final store = EvidenceStore(
        storageDirectory,
        writeFile: (file, bytes) async {
          writes++;
          await file.writeAsBytes(bytes.sublist(0, 1), flush: true);
          if (writes == 2) throw _noSpace(file.path);
        },
      );

      await expectLater(
        store.save('evidence-1', content),
        throwsA(isA<FileSystemException>()),
      );

      expect(evidenceDirectory.listSync(), isEmpty);
      expect(await store.pendingCount(), 0);
    });
  });

  group('isOutOfStorage', () {
    test('recognizes ENOSPC outside Windows', () {
      expect(isOutOfStorage(_noSpace('image', code: 28), windows: false), true);
      expect(
        isOutOfStorage(_noSpace('image', code: 39), windows: false),
        false,
      );
      expect(
        isOutOfStorage(_noSpace('image', code: 112), windows: false),
        false,
      );
    });

    test('recognizes a full disk on Windows', () {
      expect(isOutOfStorage(_noSpace('image', code: 112), windows: true), true);
      expect(isOutOfStorage(_noSpace('image', code: 39), windows: true), true);
      expect(isOutOfStorage(_noSpace('image', code: 28), windows: true), false);
    });

    test('rejects other errors', () {
      expect(isOutOfStorage(const FileSystemException('denied')), false);
      expect(isEvidenceStorageFull(StateError('no policy')), false);
      expect(isEvidenceStorageFull(_noSpace('image')), true);
    });
  });
}

/// The error a write fails with when the device has no space left.
FileSystemException _noSpace(String path, {int? code}) => FileSystemException(
  'Cannot write file',
  path,
  OSError('No space left on device', code ?? (Platform.isWindows ? 112 : 28)),
);
