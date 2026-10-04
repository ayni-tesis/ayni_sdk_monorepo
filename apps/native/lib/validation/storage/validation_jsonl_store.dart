import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../models/validation_run_record.dart';

class ValidationJsonlStore {
  ValidationJsonlStore(this.file);

  final File file;
  static final Map<String, _AsyncGate> _gates = {};
  static final Map<String, int> _validatedLengths = {};
  static final Map<String, bool> _missingTrailingNewline = {};

  Future<List<ValidationRunRecord>> readAll() => _gate.run(_readAndRecover);

  Future<void> append(ValidationRunRecord record) => _gate.run(() async {
    await file.parent.create(recursive: true);
    if (await file.exists()) {
      final currentLength = await file.length();
      if (_validatedLengths[_path] != currentLength) {
        await _readAndRecover();
      }
      if (_missingTrailingNewline[_path] ?? false) {
        await file.writeAsString('\n', mode: FileMode.append, flush: true);
      }
    } else {
      _validatedLengths[_path] = 0;
      _missingTrailingNewline[_path] = false;
    }
    await file.writeAsString(
      '${jsonEncode(record.toJson())}\n',
      mode: FileMode.append,
      flush: true,
    );
    _validatedLengths[_path] = await file.length();
    _missingTrailingNewline[_path] = false;
  });

  String get _path => file.absolute.path;

  _AsyncGate get _gate => _gates.putIfAbsent(_path, _AsyncGate.new);

  Future<List<ValidationRunRecord>> _readAndRecover() async {
    if (!await file.exists()) {
      _validatedLengths[_path] = 0;
      _missingTrailingNewline[_path] = false;
      return const [];
    }
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) {
      _validatedLengths[_path] = 0;
      _missingTrailingNewline[_path] = false;
      return const [];
    }

    final records = <ValidationRunRecord>[];
    var lineStart = 0;
    var lineNumber = 0;
    for (var cursor = 0; cursor <= bytes.length; cursor++) {
      if (cursor != bytes.length && bytes[cursor] != 0x0a) continue;
      lineNumber++;
      var lineEnd = cursor;
      if (lineEnd > lineStart && bytes[lineEnd - 1] == 0x0d) lineEnd--;
      if (lineEnd > lineStart) {
        try {
          final source = utf8.decode(bytes.sublist(lineStart, lineEnd));
          final decoded = jsonDecode(source);
          if (decoded is! Map) {
            throw const FormatException('Expected JSON object.');
          }
          final object = decoded.map<String, Object?>(
            (key, value) => MapEntry(key.toString(), value),
          );
          records.add(ValidationRunRecord.fromJson(object));
        } on Object {
          final onlyLineBreaksRemain = bytes
              .skip(cursor + 1)
              .every((byte) => byte == 0x0a || byte == 0x0d);
          if (!onlyLineBreaksRemain) {
            throw ValidationJsonlException(
              'La línea $lineNumber del registro JSONL está dañada.',
            );
          }
          final validPrefix = bytes.sublist(0, lineStart);
          await file.writeAsBytes(validPrefix, flush: true);
          _validatedLengths[_path] = validPrefix.length;
          _missingTrailingNewline[_path] =
              validPrefix.isNotEmpty && validPrefix.last != 0x0a;
          return records;
        }
      }
      lineStart = cursor + 1;
    }
    _validatedLengths[_path] = bytes.length;
    _missingTrailingNewline[_path] = bytes.last != 0x0a;
    return List.unmodifiable(records);
  }
}

class ValidationJsonlException implements Exception {
  const ValidationJsonlException(this.message);

  final String message;

  @override
  String toString() => message;
}

class _AsyncGate {
  Future<void> _tail = Future<void>.value();

  Future<T> run<T>(Future<T> Function() operation) async {
    final previous = _tail;
    final release = Completer<void>();
    _tail = release.future;
    await previous;
    try {
      return await operation();
    } finally {
      release.complete();
    }
  }
}
