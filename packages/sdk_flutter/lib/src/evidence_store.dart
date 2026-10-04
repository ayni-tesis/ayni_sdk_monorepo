// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// The local evidence a `dataset.capture` node creates (US-066): one
/// directory per evidence under `storageDirectory/evidence/`, holding the
/// original `image` bytes and `evidence.json`, its metadata.
///
/// Each evidence is written to `<evidenceId>.tmp` and renamed into place, so
/// a directory named after an evidence ID is always complete. Sending it
/// (US-068 to US-072) reads those directories, skipping a `.tmp` one left by
/// a process that stopped mid-save, and removes each one once the server
/// confirms it.
class EvidenceStore {
  EvidenceStore(Directory storageDirectory)
    : _directory = Directory(
        '${storageDirectory.path}${Platform.pathSeparator}evidence',
      );

  final Directory _directory;
  Future<void> _work = Future<void>.value();

  /// Saves [image] and [record] as the evidence [evidenceId].
  Future<void> save(
    String evidenceId,
    Uint8List image,
    Map<String, Object?> record,
  ) => _serialize(() async {
    final temporary = Directory(
      '${_directory.path}${Platform.pathSeparator}$evidenceId.tmp',
    );
    try {
      await temporary.create(recursive: true);
      await File(
        '${temporary.path}${Platform.pathSeparator}image',
      ).writeAsBytes(image, flush: true);
      await File(
        '${temporary.path}${Platform.pathSeparator}evidence.json',
      ).writeAsString(jsonEncode(record), flush: true);
      await temporary.rename(
        '${_directory.path}${Platform.pathSeparator}$evidenceId',
      );
    } finally {
      if (await temporary.exists()) await temporary.delete(recursive: true);
    }
  });

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
