// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';

class TraceOutboxStore {
  TraceOutboxStore(Directory storageDirectory)
    : _directory = Directory(
        '${storageDirectory.path}${Platform.pathSeparator}diagnostics${Platform.pathSeparator}trace-outbox',
      );

  // ponytail: one lock serializes writes across directories; use per-directory
  // locks if concurrent applications show measurable contention.
  static Future<void> _work = Future<void>.value();

  final Directory _directory;

  Future<List<Map<String, Object?>>> pending() async {
    if (!await _directory.exists()) return [];
    final traces = <Map<String, Object?>>[];
    await for (final entity in _directory.list(followLinks: false)) {
      if (entity is! File || !entity.path.endsWith('.json')) continue;
      traces.add(await _read(entity));
    }
    traces.sort((left, right) {
      final byTimestamp = '${left['timestamp'] ?? ''}'.compareTo(
        '${right['timestamp'] ?? ''}',
      );
      return byTimestamp != 0
          ? byTimestamp
          : '${left['traceId']}'.compareTo('${right['traceId']}');
    });
    return traces;
  }

  Future<void> enqueue(Map<String, Object?> trace) async {
    final traceId = trace['traceId'];
    if (traceId is! String || traceId.trim().isEmpty) {
      throw const FormatException('Invalid trace outbox entry');
    }
    final encodedTrace = jsonEncode(trace);
    await _serialize(() async {
      final destination = _fileFor(traceId);
      if (await destination.exists()) {
        final existing = await _read(destination);
        if (existing['traceId'] == traceId) return;
      }

      await _directory.create(recursive: true);
      final temporary = File(
        '${destination.path}.${DateTime.now().microsecondsSinceEpoch}.tmp',
      );
      try {
        await temporary.writeAsString(encodedTrace, flush: true);
        await temporary.rename(destination.path);
      } finally {
        if (await temporary.exists()) await temporary.delete();
      }
    });
  }

  Future<void> clear() => _serialize(() async {
    if (await _directory.exists()) await _directory.delete(recursive: true);
  });

  Future<Map<String, Object?>> _read(File file) async {
    final decoded = jsonDecode(await file.readAsString());
    if (decoded is! Map || decoded['traceId'] is! String) {
      throw const FormatException('Invalid trace outbox entry');
    }
    return Map<String, Object?>.from(decoded);
  }

  File _fileFor(String traceId) {
    final name = base64Url.encode(utf8.encode(traceId)).replaceAll('=', '');
    return File('${_directory.path}${Platform.pathSeparator}$name.json');
  }

  Future<void> _serialize(Future<void> Function() operation) {
    final previous = _work;
    final result = previous.then((_) => operation());
    _work = result.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return result;
  }
}
