// US-068: the local queue of evidence pending upload.
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/src/evidence_status.dart';
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

  group('recordFailedAttempt (US-071)', () {
    test('records each failed attempt apart from evidence.json and fails the '
        'evidence at the limit', () async {
      final store = EvidenceStore(storageDirectory, maxUploadAttempts: 2);
      await store.save('evidence-1', content);
      final evidence = Directory('${evidenceDirectory.path}/evidence-1');
      final attempts = File('${evidence.path}/upload-attempts.json');

      final first = await store.recordFailedAttempt(
        evidence,
        DateTime.utc(2026, 10, 4, 12),
      );

      expect(first, (
        count: 1,
        lastAttemptAt: DateTime.utc(2026, 10, 4, 12),
        failed: false,
      ));
      expect(
        attempts.readAsStringSync(),
        '{"evidenceId":"evidence-1","attempts":1,'
        '"lastAttemptAt":"2026-10-04T12:00:00.000Z","failed":false}',
      );
      expect(await store.pendingCount(), 1);

      final second = await store.recordFailedAttempt(
        evidence,
        DateTime.utc(2026, 10, 4, 13),
      );

      expect(second.failed, isTrue);
      expect(
        attempts.readAsStringSync(),
        '{"evidenceId":"evidence-1","attempts":2,'
        '"lastAttemptAt":"2026-10-04T13:00:00.000Z","failed":true}',
      );
      expect(await store.pendingCount(), 0);
      expect(
        File('${evidence.path}/evidence.json').readAsStringSync(),
        '{"evidenceSchemaVersion":1}',
      );
      expect(evidence.listSync().map((e) => e.uri.pathSegments.last), {
        'image',
        'evidence.json',
        'upload-attempts.json',
      });
    });

    test('reads an unreadable record as no attempts', () async {
      final store = EvidenceStore(storageDirectory);
      await store.save('evidence-1', content);
      final evidence = Directory('${evidenceDirectory.path}/evidence-1');
      File('${evidence.path}/upload-attempts.json').writeAsStringSync('{');

      expect(await store.attempts(evidence), noEvidenceUploadAttempts);
      expect(await store.pendingCount(), 1);
    });
  });

  group('remove (US-072)', () {
    const id = '6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f';
    const otherId = '7a2e3d4c-5b6a-4f9e-8d7c-1b2c3d4e5f60';

    test('deletes the evidence directory and only it', () async {
      final store = EvidenceStore(storageDirectory);
      await store.save(id, content);
      await store.save(otherId, content);
      final evidence = Directory('${evidenceDirectory.path}/$id');
      await store.recordFailedAttempt(evidence, DateTime.utc(2026, 10, 4));
      await store.markReceived(evidence, DateTime.utc(2026, 10, 4, 1));
      final workflow = File('${storageDirectory.path}/sync-inventory.json')
        ..writeAsStringSync('{}');

      await store.remove(evidence);

      expect(evidence.existsSync(), isFalse);
      expect(evidenceDirectory.listSync().map((e) => e.uri.pathSegments), [
        [
          ...evidenceDirectory.uri.pathSegments.where((s) => s != ''),
          otherId,
          '',
        ],
      ]);
      expect(workflow.readAsStringSync(), '{}');
      expect(await store.statusCounts(), {
        EvidenceStatus.pending: 1,
        EvidenceStatus.uploading: 0,
        EvidenceStatus.retrying: 0,
        EvidenceStatus.received: 0,
        EvidenceStatus.failed: 0,
      });
    });

    test('refuses a directory that is not an evidence of the queue', () async {
      final store = EvidenceStore(storageDirectory);
      final outside = Directory('${storageDirectory.path}/workflow-definitions')
        ..createSync(recursive: true);
      File('${outside.path}/workflow.json').writeAsStringSync('{}');
      final notAnId = Directory('${evidenceDirectory.path}/not-an-id')
        ..createSync(recursive: true);

      for (final directory in [
        outside,
        notAnId,
        Directory('${evidenceDirectory.path}/$id/..'),
        Directory('${outside.path}/$id')..createSync(),
      ]) {
        await expectLater(
          store.remove(directory),
          throwsA(isA<FileSystemException>()),
          reason: directory.path,
        );
      }
      expect(File('${outside.path}/workflow.json').existsSync(), isTrue);
      expect(Directory('${outside.path}/$id').existsSync(), isTrue);
      expect(notAnId.existsSync(), isTrue);
    });

    test('does not follow a link named like an evidence', () async {
      final store = EvidenceStore(storageDirectory);
      final target = Directory('${storageDirectory.path}/models')
        ..createSync(recursive: true);
      final model = File('${target.path}/model.tflite')..writeAsBytesSync([1]);
      evidenceDirectory.createSync(recursive: true);
      final link = Link('${evidenceDirectory.path}/$id')
        ..createSync(target.absolute.path);

      await expectLater(
        store.remove(Directory(link.path)),
        throwsA(isA<FileSystemException>()),
      );
      expect(model.readAsBytesSync(), [1]);
    });

    test('keeps received.json when it cannot delete the evidence, so it is '
        'not pending again', () async {
      final store = EvidenceStore(storageDirectory);
      await store.save(id, content);
      final evidence = Directory('${evidenceDirectory.path}/$id');
      await store.markReceived(evidence, DateTime.utc(2026, 10, 4));
      // A directory in the way of the rename makes the removal fail.
      File('${evidenceDirectory.path}/$id.tmp/image')
        ..createSync(recursive: true)
        ..writeAsBytesSync([9]);

      await expectLater(
        store.remove(evidence),
        throwsA(isA<FileSystemException>()),
      );

      expect(File('${evidence.path}/received.json').existsSync(), isTrue);
      expect(File('${evidence.path}/image').readAsBytesSync(), [1, 2, 3]);
      expect(await store.pendingCount(), 0);
      expect((await store.statusCounts())[EvidenceStatus.received], 1);
    });
  });

  group('removeLeftovers (US-072)', () {
    const received = '6f1d2c3b-4a59-4e8d-9c7b-0a1b2c3d4e5f';
    const pending = '7a2e3d4c-5b6a-4f9e-8d7c-1b2c3d4e5f60';
    const stopped = '8b3f4e5d-6c7b-4a0f-9e8d-2c3d4e5f6071';
    const failed = '9c405f6e-7d8c-4b1a-8f9e-3d4e5f607182';
    const linked = 'a0516f7f-8e9d-4c2b-9a0f-4e5f60718293';

    test('deletes the received evidence and the half-written ones a stopped '
        'process left, and keeps the rest', () async {
      final store = EvidenceStore(storageDirectory, maxUploadAttempts: 1);
      for (final id in [received, pending, failed]) {
        await store.save(id, content);
      }
      await store.markReceived(
        Directory('${evidenceDirectory.path}/$received'),
        DateTime.utc(2026, 10, 4),
      );
      await store.recordFailedAttempt(
        Directory('${evidenceDirectory.path}/$failed'),
        DateTime.utc(2026, 10, 4),
      );
      File('${evidenceDirectory.path}/$stopped.tmp/image')
        ..createSync(recursive: true)
        ..writeAsBytesSync([1]);
      File('${evidenceDirectory.path}/notes.txt').writeAsStringSync('x');
      final outside = Directory('${storageDirectory.path}/models')
        ..createSync();
      File('${outside.path}/model.tflite').writeAsBytesSync([1]);
      Link(
        '${evidenceDirectory.path}/$linked.tmp',
      ).createSync(outside.absolute.path);

      await store.removeLeftovers();

      expect(
        evidenceDirectory
            .listSync()
            .map((e) => e.uri.pathSegments.lastWhere((s) => s != ''))
            .toSet(),
        {pending, failed, 'notes.txt', '$linked.tmp'},
      );
      expect(File('${outside.path}/model.tflite').existsSync(), isTrue);
      expect(await store.statusCounts(), {
        EvidenceStatus.pending: 1,
        EvidenceStatus.uploading: 0,
        EvidenceStatus.retrying: 0,
        EvidenceStatus.received: 0,
        EvidenceStatus.failed: 1,
      });
    });

    for (final (name, otherStore) in [('this', false), ('another', true)]) {
      test('keeps the evidence $name store is writing', () async {
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
        final saving = store.save(pending, content);
        await writing.future;

        // An app that initializes the SDK again gets another store.
        await (otherStore ? EvidenceStore(storageDirectory) : store)
            .removeLeftovers();
        release.complete();
        await saving;

        expect(await store.pendingCount(), 1);
      });
    }

    test('deletes nothing when the queue directory is a link', () async {
      final outside = Directory('${storageDirectory.path}/outside')
        ..createSync();
      final confirmed = File('${outside.path}/$received/received.json')
        ..createSync(recursive: true);
      final halfWritten = File('${outside.path}/$stopped.tmp/image')
        ..createSync(recursive: true);
      Link(evidenceDirectory.path).createSync(outside.absolute.path);
      final store = EvidenceStore(storageDirectory);

      await store.removeLeftovers();
      await expectLater(
        store.remove(Directory('${evidenceDirectory.path}/$received')),
        throwsA(isA<FileSystemException>()),
      );

      expect(confirmed.existsSync(), isTrue);
      expect(halfWritten.existsSync(), isTrue);
    });

    test('does nothing without a queue', () async {
      await EvidenceStore(storageDirectory).removeLeftovers();

      expect(evidenceDirectory.existsSync(), isFalse);
    });
  });

  group('uploadingEvidence (US-072)', () {
    test(
      'counts the evidence being uploaded as uploading and pending',
      () async {
        final store = EvidenceStore(storageDirectory);
        await store.save('evidence-1', content);
        await store.save('evidence-2', content);

        store.uploadingEvidence = Directory(
          '${evidenceDirectory.path}/evidence-1',
        );

        expect((await store.statusCounts())[EvidenceStatus.uploading], 1);
        expect((await store.statusCounts())[EvidenceStatus.pending], 1);
        expect(await store.pendingCount(), 2);

        store.uploadingEvidence = null;

        expect((await store.statusCounts())[EvidenceStatus.pending], 2);
      },
    );
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
