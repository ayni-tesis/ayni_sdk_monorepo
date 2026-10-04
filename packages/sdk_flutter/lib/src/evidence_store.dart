// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'sdk_internal.dart';

/// What an evidence keeps: its optimized `image` bytes and `evidence.json`.
typedef EvidenceContent = ({Uint8List image, Map<String, Object?> record});

/// Writes one file of an evidence; tests replace it to simulate a full device.
typedef EvidenceFileWriter = Future<void> Function(File file, List<int> bytes);

/// How one upload of a pending evidence ended (US-070).
enum EvidenceUploadOutcome {
  /// The server confirmed that it holds the evidence and its image.
  received,

  /// The evidence could not be sent now (no answer, a timeout, a server
  /// error or a policy that stopped allowing it): it stays pending and the
  /// queue stops until a later sync.
  failed,

  /// The server rejected this evidence (it cannot read it, it is too large,
  /// it is not of the credential's application or its image did not match):
  /// it stays pending, and the SDK goes on with the next one.
  rejected,

  /// The server rejected the revoked credential: nothing else can be sent.
  credentialRevoked,
}

/// What an [EvidenceUploader] reports: its [EvidenceUploadOutcome] and, when
/// [EvidenceUploadOutcome.received], when the server received the evidence.
typedef EvidenceUploadResult = ({
  EvidenceUploadOutcome outcome,
  DateTime? receivedAt,
});

/// Sends the pending evidence in [evidence], one of [EvidenceStore.pending]
/// (US-069 seam, US-070 upload). The SDK calls it only once the collection
/// policy, consulted right before, allows sending over the current network,
/// and records a [EvidenceUploadOutcome.received] with
/// [EvidenceStore.markReceived]. Tests replace the real one.
typedef EvidenceUploader =
    Future<EvidenceUploadResult> Function(Directory evidence);

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
/// evidence ID is complete and pending upload. Once the server confirms its
/// upload (US-070), [markReceived] adds `received.json` to the directory and
/// the evidence is no longer pending; deleting the directory of a received
/// evidence is US-072's. A `.tmp` directory left by a process that stopped
/// mid-save is skipped, and only [clear] removes it.
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
  /// which are not pending yet, skips the evidence the server already
  /// received, and ends early when a [clear] deletes the queue while it is
  /// being listed.
  Stream<Directory> pending() async* {
    try {
      if (!await _directory.exists()) return;
      await for (final entity in _directory.list(followLinks: false)) {
        if (entity is Directory &&
            !entity.path.endsWith(_writingSuffix) &&
            !await _receivedFile(entity).exists()) {
          yield entity;
        }
      }
    } on PathNotFoundException {
      // A clear() deleted the queue while it was being listed.
    }
  }

  /// Records that the server received [evidence] at [receivedAt], so it is
  /// no longer [pending]: it writes `received.json`, through a temporary file
  /// renamed into place, and leaves the rest of the directory unchanged.
  Future<void> markReceived(Directory evidence, DateTime receivedAt) async {
    final file = _receivedFile(evidence);
    final temporary = File('${file.path}$_writingSuffix');
    try {
      await temporary.writeAsString(
        jsonEncode({
          'evidenceId': evidence.uri.pathSegments.lastWhere((s) => s != ''),
          'receivedAt': receivedAt.toUtc().toIso8601String(),
        }),
        flush: true,
      );
      await temporary.rename(file.path);
    } finally {
      try {
        if (await temporary.exists()) await temporary.delete();
      } on FileSystemException {
        // A clear() may have deleted the directory meanwhile.
      }
    }
  }

  /// The file that marks an evidence the server confirmed, apart from
  /// `evidence.json`, which never changes.
  File _receivedFile(Directory evidence) =>
      File('${evidence.path}${Platform.pathSeparator}received.json');

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
