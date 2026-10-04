// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// What an evidence keeps: its optimized `image` bytes and `evidence.json`.
typedef EvidenceContent = ({Uint8List image, Map<String, Object?> record});

/// Writes one file of an evidence; tests replace it to simulate a full device.
typedef EvidenceFileWriter = Future<void> Function(File file, List<int> bytes);

Future<void> writeEvidenceFile(File file, List<int> bytes) =>
    file.writeAsBytes(bytes, flush: true);

/// `ENOSPC` (`No space left on device`), the same number on Android (Linux)
/// and iOS (XNU). `dart:io` reports the operating system's own code in
/// [OSError.errorCode].
const _noSpaceLeftOnDevice = 28;

/// `ERROR_HANDLE_DISK_FULL` and `ERROR_DISK_FULL`, Windows system error codes.
const _windowsDiskFull = {39, 112};

/// Whether [error] says the device has no space left to write a file.
/// [windows] is the platform whose error codes apply; it defaults to the
/// current one.
bool isOutOfStorage(Object error, {bool? windows}) {
  if (error is! FileSystemException) return false;
  final code = error.osError?.errorCode;
  return (windows ?? Platform.isWindows)
      ? _windowsDiskFull.contains(code)
      : code == _noSpaceLeftOnDevice;
}

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
    } finally {
      if (await temporary.exists()) await temporary.delete(recursive: true);
    }
  });

  /// The directory of each evidence pending upload, in no particular order.
  /// It does not wait for the saves in progress, which are not pending yet.
  Stream<Directory> pending() async* {
    try {
      if (!await _directory.exists()) return;
      await for (final entity in _directory.list(followLinks: false)) {
        if (entity is Directory && !entity.path.endsWith(_writingSuffix)) {
          yield entity;
        }
      }
    } on FileSystemException {
      // A clear() that deleted the queue while it was being listed.
      if (await _directory.exists()) rethrow;
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
