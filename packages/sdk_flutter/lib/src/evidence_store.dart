// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'sdk_internal.dart';

/// What an evidence keeps: its optimized `image` bytes and `evidence.json`.
typedef EvidenceContent = ({Uint8List image, Map<String, Object?> record});

/// Writes one file of an evidence; tests replace it to simulate a full device.
typedef EvidenceFileWriter = Future<void> Function(File file, List<int> bytes);

/// The [EvidenceFileWriter] the SDK uses: writes [bytes] to [file] and
/// flushes them to the device.
Future<void> writeEvidenceFile(File file, List<int> bytes) =>
    file.writeAsBytes(bytes, flush: true);

/// Whether a failed [EvidenceStore.save] failed because the device had no
/// space left, which `run()` reports as `evidenceStorageFull`.
bool isEvidenceStorageFull(Object error) =>
    error is FileSystemException && isOutOfStorage(error);

/// The local queue of evidence that `dataset.capture` nodes create (US-066,
/// US-068): one directory per evidence under `storageDirectory/evidence/`,
/// holding the `image` the SDK optimized (US-067) and `evidence.json`, its
/// metadata.
///
/// An evidence is written to `<evidenceId>.tmp/`, which is never part of the
/// queue, and renamed to `<evidenceId>/`, so a directory named after an
/// evidence ID is complete and pending upload. The queue keeps no "sent"
/// state: an evidence stays pending, across restarts, until it is deleted,
/// and uploading it (US-070) may delete it only once the server confirms it
/// (US-072). A `.tmp` directory left by a process that stopped mid-save is
/// skipped, and only [clear] removes it.
class EvidenceStore {
  EvidenceStore(
    Directory storageDirectory, {
    EvidenceFileWriter writeFile = writeEvidenceFile,
  }) : _directory = Directory(
         '${storageDirectory.path}${Platform.pathSeparator}evidence',
       ),
       _writeFile = writeFile;

  static const _writingSuffix = '.tmp';

  final Directory _directory;
  final EvidenceFileWriter _writeFile;
  Future<void> _work = Future<void>.value();

  /// Prepares the evidence [evidenceId] with [prepare] and adds what it
  /// returns to the queue. Both run after the saves already requested, one at
  /// a time; when either fails, nothing of this evidence stays on the device.
  Future<void> save(
    String evidenceId,
    Future<EvidenceContent> Function() prepare,
  ) => _serialize(() async {
    final content = await prepare();
    final temporary = Directory(
      '${_directory.path}${Platform.pathSeparator}$evidenceId$_writingSuffix',
    );
    try {
      await temporary.create(recursive: true);
      await _writeFile(
        File('${temporary.path}${Platform.pathSeparator}image'),
        content.image,
      );
      await _writeFile(
        File('${temporary.path}${Platform.pathSeparator}evidence.json'),
        utf8.encode(jsonEncode(content.record)),
      );
      await temporary.rename(
        '${_directory.path}${Platform.pathSeparator}$evidenceId',
      );
    } catch (_) {
      try {
        if (await temporary.exists()) await temporary.delete(recursive: true);
      } on FileSystemException {
        // Keep the error that stopped the save (such as a full device); the
        // `.tmp` directory is never pending, and clear() removes it.
      }
      rethrow;
    }
  });

  /// The directory of each evidence pending upload, in no particular order,
  /// for the upload (US-070). It does not wait for the saves in progress,
  /// which are not pending yet, and ends early when a [clear] deletes the
  /// queue while it is being listed.
  Stream<Directory> pending() async* {
    try {
      if (!await _directory.exists()) return;
      await for (final entity in _directory.list(followLinks: false)) {
        if (entity is Directory && !entity.path.endsWith(_writingSuffix)) {
          yield entity;
        }
      }
    } on PathNotFoundException {
      // A clear() deleted the queue while it was being listed.
    }
  }

  /// How many evidences are [pending].
  Future<int> pendingCount() => pending().length;

  /// Deletes every evidence, after the saves already requested finish.
  Future<void> clear() => _serialize(() async {
    if (await _directory.exists()) await _directory.delete(recursive: true);
  });

  Future<void> _serialize(Future<void> Function() operation) {
    final result = _work.then((_) => operation());
    _work = result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }
}
