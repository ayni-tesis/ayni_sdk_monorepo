// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'evidence_status.dart';
import 'sdk_internal.dart';
import 'uuid_v4.dart';

/// The upload attempts of one evidence that ended without a confirmation
/// (US-071): how many, when the last one started, and whether they reached
/// the limit, which makes the evidence [EvidenceStatus.failed].
typedef EvidenceUploadAttempts = ({
  int count,
  DateTime? lastAttemptAt,
  bool failed,
});

/// No failed upload attempt recorded.
const EvidenceUploadAttempts noEvidenceUploadAttempts = (
  count: 0,
  lastAttemptAt: null,
  failed: false,
);

/// How long the SDK waits after the [failedAttempts]-th failed upload of an
/// evidence before it tries again (US-071): 15 minutes after the first, twice
/// as long after each next one, and never more than 6 hours. So an app that
/// syncs often spends neither data nor battery on an upload that just failed,
/// and an outage of the server of a few hours does not use up the attempts.
Duration evidenceRetryDelay(int failedAttempts) {
  const first = Duration(minutes: 15);
  const longest = Duration(hours: 6);
  var delay = first;
  for (var failure = 1; failure < failedAttempts; failure++) {
    delay *= 2;
    if (delay >= longest) return longest;
  }
  return delay;
}

/// Whether an evidence with these [attempts] may be uploaded at [now]: it
/// has none, or the [evidenceRetryDelay] of the last one passed. A last
/// attempt later than [now] means the device clock went back, and it does
/// not hold the evidence.
bool isEvidenceUploadDue(EvidenceUploadAttempts attempts, DateTime now) {
  final last = attempts.lastAttemptAt;
  if (attempts.failed) return false;
  if (attempts.count == 0 || last == null || now.isBefore(last)) return true;
  return !now.isBefore(last.add(evidenceRetryDelay(attempts.count)));
}

/// What an evidence keeps: its optimized `image` bytes and `evidence.json`.
typedef EvidenceContent = ({Uint8List image, Map<String, Object?> record});

/// Writes one file of an evidence; tests replace it to simulate a full device.
typedef EvidenceFileWriter = Future<void> Function(File file, List<int> bytes);

/// How one upload of a pending evidence ended (US-070).
enum EvidenceUploadOutcome {
  /// The server confirmed that it holds the evidence and its image.
  received,

  /// The evidence could not be sent now (no answer, a timeout, a server
  /// error or a policy that stopped allowing it): it counts as a failed
  /// attempt (US-071) and the queue stops until a later sync.
  failed,

  /// The server rejected this evidence (it cannot read it, it is too large,
  /// it is not of the credential's application or its image did not match):
  /// it counts as a failed attempt too, since the SDK cannot be sure a
  /// rejection is final, but the SDK goes on with the next one.
  rejected,

  /// The server rejected the revoked credential: nothing else can be sent,
  /// and no attempt counts, since the evidence itself did not fail.
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
/// upload (US-070), [markReceived] adds `received.json` to the directory, so
/// the evidence is no longer pending, and [remove] deletes the directory
/// (US-072). A `.tmp` directory left by a process that stopped mid-save, or
/// by a [remove] that failed halfway, is skipped, and [removeLeftovers] or
/// [clear] delete it.
class EvidenceStore {
  /// [maxUploadAttempts] is `AyniSdk.maxEvidenceUploadAttempts`: after that
  /// many failed uploads an evidence is [EvidenceStatus.failed]. A value
  /// below 1 counts as 1.
  EvidenceStore(
    Directory storageDirectory, {
    EvidenceFileWriter writeFile = writeEvidenceFile,
    int maxUploadAttempts = 5,
  }) : _directory = Directory(
         '${storageDirectory.path}${Platform.pathSeparator}evidence',
       ),
       _writeFile = writeFile,
       _maxUploadAttempts = maxUploadAttempts < 1 ? 1 : maxUploadAttempts;

  static const _writingSuffix = '.tmp';
  final Directory _directory;
  final EvidenceFileWriter _writeFile;
  final int _maxUploadAttempts;
  Future<void> _work = Future<void>.value();

  /// The ID of the evidence a [save] is writing to its `.tmp` directory now,
  /// which [removeLeftovers] keeps.
  String? _writingId;

  /// The evidence `AyniSdk.sync` is uploading now, which [statusCounts]
  /// counts as [EvidenceStatus.uploading] until the upload ends (US-072).
  Directory? uploading;

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
    _writingId = evidenceId;
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
        // `.tmp` directory is never pending, and removeLeftovers() or
        // clear() delete it.
      }
      rethrow;
    } finally {
      _writingId = null;
    }
  });

  /// The directory of each evidence pending upload, in no particular order,
  /// for the upload (US-070): the [EvidenceStatus.pending],
  /// [EvidenceStatus.uploading] and [EvidenceStatus.retrying] ones. It does
  /// not wait for the saves in
  /// progress, which are not pending yet, skips the evidence the server
  /// already received or that reached the limit of attempts (US-071), and
  /// ends early when a [clear] deletes the queue while it is being listed.
  Stream<Directory> pending() async* {
    await for (final (:evidence, :status) in _evidenceStatuses()) {
      if (status == EvidenceStatus.pending ||
          status == EvidenceStatus.uploading ||
          status == EvidenceStatus.retrying) {
        yield evidence;
      }
    }
  }

  /// How many evidences of each [EvidenceStatus] the queue holds, with every
  /// status present (US-071). Like [pending], it does not wait for the saves
  /// in progress.
  Future<Map<EvidenceStatus, int>> statusCounts() async {
    final counts = {for (final status in EvidenceStatus.values) status: 0};
    await for (final (evidence: _, :status) in _evidenceStatuses()) {
      counts[status] = counts[status]! + 1;
    }
    return counts;
  }

  /// Each complete evidence directory with its status.
  Stream<({Directory evidence, EvidenceStatus status})>
  _evidenceStatuses() async* {
    try {
      if (!await _directory.exists()) return;
      await for (final entity in _directory.list(followLinks: false)) {
        if (entity is Directory && !entity.path.endsWith(_writingSuffix)) {
          yield (evidence: entity, status: await _status(entity));
        }
      }
    } on PathNotFoundException {
      // A clear() deleted the queue while it was being listed.
    }
  }

  Future<EvidenceStatus> _status(Directory evidence) async {
    if (await _receivedFile(evidence).exists()) return EvidenceStatus.received;
    final recorded = await attempts(evidence);
    // A lower limit than the one in force when it was recorded fails it too.
    if (recorded.failed || recorded.count >= _maxUploadAttempts) {
      return EvidenceStatus.failed;
    }
    final current = uploading;
    if (current != null && _evidenceId(current) == _evidenceId(evidence)) {
      return EvidenceStatus.uploading;
    }
    return recorded.count > 0
        ? EvidenceStatus.retrying
        : EvidenceStatus.pending;
  }

  /// The upload attempts recorded for [evidence] that did not end with a
  /// confirmation (US-071); none when `upload-attempts.json` is missing or
  /// unreadable.
  Future<EvidenceUploadAttempts> attempts(Directory evidence) async {
    Object? recorded;
    try {
      recorded = jsonDecode(await _attemptsFile(evidence).readAsString());
    } on FileSystemException {
      return noEvidenceUploadAttempts;
    } on FormatException {
      return noEvidenceUploadAttempts;
    }
    if (recorded is! Map) return noEvidenceUploadAttempts;
    final count = recorded['attempts'];
    final lastAttemptAt = DateTime.tryParse('${recorded['lastAttemptAt']}');
    if (count is! int || count < 1 || lastAttemptAt == null) {
      return noEvidenceUploadAttempts;
    }
    return (
      count: count,
      lastAttemptAt: lastAttemptAt,
      failed: recorded['failed'] == true,
    );
  }

  /// Records that an upload of [evidence] that started at [at] ended without
  /// a confirmation, and returns the attempts it now has: failed once they
  /// reach the store's `maxUploadAttempts` (US-071). It writes
  /// `upload-attempts.json`, through a temporary file renamed into place, and
  /// leaves the rest of the directory unchanged.
  Future<EvidenceUploadAttempts> recordFailedAttempt(
    Directory evidence,
    DateTime at,
  ) async {
    final count = (await attempts(evidence)).count + 1;
    final recorded = (
      count: count,
      lastAttemptAt: at.toUtc(),
      failed: count >= _maxUploadAttempts,
    );
    await _replace(
      _attemptsFile(evidence),
      jsonEncode({
        'evidenceId': _evidenceId(evidence),
        'attempts': recorded.count,
        'lastAttemptAt': recorded.lastAttemptAt.toIso8601String(),
        'failed': recorded.failed,
      }),
    );
    return recorded;
  }

  /// Records that the server received [evidence] at [receivedAt], so it is
  /// no longer [pending]: it writes `received.json`, through a temporary file
  /// renamed into place, and leaves the rest of the directory unchanged.
  Future<void> markReceived(Directory evidence, DateTime receivedAt) =>
      _replace(
        _receivedFile(evidence),
        jsonEncode({
          'evidenceId': _evidenceId(evidence),
          'receivedAt': receivedAt.toUtc().toIso8601String(),
        }),
      );

  /// Deletes the local copy of [evidence], which the server confirmed
  /// (US-072): its image, `evidence.json` and the files of its upload. It
  /// only deletes a directory of the queue named after an evidence ID, never
  /// a link or what one points to, and nothing else in `storageDirectory`;
  /// for anything else it fails with a [FileSystemException].
  ///
  /// It first renames the directory to `<evidenceId>.tmp`, which is never
  /// part of the queue, so a deletion that fails halfway never makes the
  /// evidence pending again: when the rename fails, for example because a
  /// file is locked, the evidence keeps its `received.json`; when the
  /// deletion fails, the `.tmp` directory stays. Either way it fails, and
  /// [removeLeftovers] deletes what is left later.
  Future<void> remove(Directory evidence) async {
    final id = _evidenceId(evidence);
    final path = '${_directory.path}${Platform.pathSeparator}$id';
    if (!isUuidV4(id) ||
        !await _directory.exists() ||
        !await FileSystemEntity.identical(
          evidence.parent.path,
          _directory.path,
        ) ||
        await FileSystemEntity.type(path, followLinks: false) !=
            FileSystemEntityType.directory) {
      throw FileSystemException('Not an evidence of the queue', evidence.path);
    }
    final removing = await Directory(path).rename('$path$_writingSuffix');
    await removing.delete(recursive: true);
  }

  /// Deletes what a stopped process or a failed [remove] left in the queue
  /// (US-072): each evidence the server confirmed, which has
  /// `received.json`, and each `<evidenceId>.tmp/` directory, except the one
  /// a [save] of this store is writing now. It keeps the pending, retrying
  /// and failed evidence, skips anything not named after an evidence ID and
  /// never follows a link. It does not fail: what it cannot delete stays for
  /// a later call.
  Future<void> removeLeftovers() async {
    final halfDone = <Directory>[];
    final received = <Directory>[];
    try {
      if (!await _directory.exists()) return;
      await for (final entity in _directory.list(followLinks: false)) {
        if (entity is! Directory) continue;
        final name = _evidenceId(entity);
        if (name.endsWith(_writingSuffix)) {
          final id = name.substring(0, name.length - _writingSuffix.length);
          if (isUuidV4(id) && id != _writingId) halfDone.add(entity);
        } else if (isUuidV4(name) && await _receivedFile(entity).exists()) {
          received.add(entity);
        }
      }
    } on FileSystemException {
      // A clear() deleted the queue while it was being listed.
      return;
    }
    // The half-done ones first: one may be in the way of a remove().
    for (final directory in halfDone) {
      try {
        await directory.delete(recursive: true);
      } on FileSystemException {
        // Still locked, or a clear() deleted it: a later call tries again.
      }
    }
    for (final evidence in received) {
      try {
        await remove(evidence);
      } on FileSystemException {
        // Its received.json keeps it out of the queue until a later call.
      }
    }
  }

  /// Writes [contents] to [file] through a temporary file renamed into
  /// place, so a reader never sees it half-written.
  Future<void> _replace(File file, String contents) async {
    final temporary = File('${file.path}$_writingSuffix');
    try {
      await temporary.writeAsString(contents, flush: true);
      await temporary.rename(file.path);
    } finally {
      try {
        if (await temporary.exists()) await temporary.delete();
      } on FileSystemException {
        // A clear() may have deleted the directory meanwhile.
      }
    }
  }

  String _evidenceId(Directory evidence) =>
      evidence.uri.pathSegments.lastWhere((s) => s != '');

  /// The file that marks an evidence the server confirmed, apart from
  /// `evidence.json`, which never changes.
  File _receivedFile(Directory evidence) =>
      File('${evidence.path}${Platform.pathSeparator}received.json');

  /// The file with the failed upload attempts of an evidence (US-071), apart
  /// from `evidence.json`, which never changes.
  File _attemptsFile(Directory evidence) =>
      File('${evidence.path}${Platform.pathSeparator}upload-attempts.json');

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
