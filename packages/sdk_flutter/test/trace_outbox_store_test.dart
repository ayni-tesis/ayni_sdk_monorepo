import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/src/trace_outbox_store.dart';
import 'package:test/test.dart';

void main() {
  late Directory directory;

  setUp(
    () async =>
        directory = await Directory.systemTemp.createTemp('ayni-trace-'),
  );
  tearDown(() async => directory.delete(recursive: true));

  test(
    'keeps pending traces across store recreation and deduplicates IDs',
    () async {
      final firstStore = TraceOutboxStore(directory);
      await firstStore.enqueue({'traceId': 'trace-1', 'status': 'success'});
      await TraceOutboxStore(
        directory,
      ).enqueue({'traceId': 'trace-1', 'status': 'error'});

      final pending = await TraceOutboxStore(directory).pending();
      final outbox = Directory('${directory.path}/diagnostics/trace-outbox');
      final files = (await outbox.list().toList()).whereType<File>().toList();

      expect(pending, [
        {'traceId': 'trace-1', 'status': 'success'},
      ]);
      expect(files, hasLength(1));
      expect(jsonDecode(await files.single.readAsString()), pending.single);
    },
  );

  test('clears pending traces', () async {
    final store = TraceOutboxStore(directory);
    await store.enqueue({'traceId': 'trace-1'});

    await store.clear();

    expect(await store.pending(), isEmpty);
  });
}
