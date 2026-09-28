// The site's Dart reference is generated from the `///` comments in `lib/`
// and from `README.md`, its package page (US-143). Every ```dart block in
// them must be a `#region` of a file under `example/`, which `dart analyze`
// checks, so the reference never shows code that does not compile (US-150).
import 'dart:io';

import 'package:test/test.dart';

void main() {
  group('docSnippets', () {
    test('reads each dart block of a doc comment with its line', () {
      const source = '''
/// Runs it.
///
/// ```dart
/// final result = await sdk.sync();
/// if (result.status == SyncStatus.offline) {
///   show();
/// }
/// ```
void run() {}
''';

      expect(docSnippets(source), [
        (
          line: 3,
          code:
              'final result = await sdk.sync();\n'
              'if (result.status == SyncStatus.offline) {\n'
              '  show();\n'
              '}',
        ),
      ]);
    });

    test('ignores dart blocks outside doc comments', () {
      const source = '''
// ```dart
// ignored();
// ```
void run() {}
''';

      expect(docSnippets(source), isEmpty);
    });

    test('reads the dart blocks of a Markdown file, which has no prefix', () {
      const source = '''
# ayni_sdk

```yaml
ignored: true
```

```dart
AyniSdk.instance;
```
''';

      expect(docSnippets(source, markdown: true), [
        (line: 7, code: 'AyniSdk.instance;'),
      ]);
    });
  });

  group('exampleRegions', () {
    test('returns each region without its shared indentation', () {
      const source = '''
void main() {
  // #region sincronizar
  final result = sdk.sync();
  if (ok) {
    show();
  }
  // #endregion sincronizar
}
''';

      expect(exampleRegions(source), {
        'final result = sdk.sync();\nif (ok) {\n  show();\n}',
      });
    });
  });

  group('snippetsOutsideExamples', () {
    const example = '''
void main() {
  // #region ejecutar
  run();
  // #endregion ejecutar
}
''';

    test('accepts a snippet that repeats an example region', () {
      final sources = {'lib/a.dart': '/// ```dart\n/// run();\n/// ```\n'};

      expect(snippetsOutsideExamples(sources, [example]), isEmpty);
    });

    test('names the file and line of a snippet no example contains', () {
      final sources = {
        'lib/a.dart': '/// Runs.\n/// ```dart\n/// runOld();\n/// ```\n',
      };

      expect(snippetsOutsideExamples(sources, [example]), ['lib/a.dart:2']);
    });
  });

  test('every dart block in the API docs is an analyzed example region', () {
    final sources = {
      for (final file in _dartFiles('lib'))
        file.path.replaceAll(r'\', '/'): file.readAsStringSync(),
      // `dart doc` publishes the README as the reference's package page.
      'README.md': File('README.md').readAsStringSync(),
    };
    final examples = [
      for (final file in _dartFiles('example')) file.readAsStringSync(),
    ];

    expect(
      snippetsOutsideExamples(sources, examples),
      isEmpty,
      reason:
          'Move each snippet into a `// #region` of a file under example/ '
          'and copy it into the doc comment unchanged.',
    );
  });
}

/// The ```dart blocks of the `///` comments in [source], or of the whole
/// file when it is [markdown], with the line of each opening fence.
List<({int line, String code})> docSnippets(
  String source, {
  bool markdown = false,
}) {
  final snippets = <({int line, String code})>[];
  final lines = source.split(RegExp(r'\r?\n'));
  int? start;
  final code = <String>[];
  for (var index = 0; index < lines.length; index++) {
    final text = markdown
        ? lines[index]
        : RegExp(r'^\s*/// ?(.*)$').firstMatch(lines[index])?.group(1);
    if (start == null) {
      if (text?.trim() == '```dart') start = index + 1;
    } else if (text == null || text.trim() == '```') {
      snippets.add((line: start, code: code.join('\n')));
      start = null;
      code.clear();
    } else {
      code.add(text);
    }
  }
  return snippets;
}

/// The code of every `// #region` in [source], without blank edge lines or
/// the indentation its lines share.
Set<String> exampleRegions(String source) {
  final regions = <String>{};
  final lines = source.split(RegExp(r'\r?\n'));
  for (var index = 0; index < lines.length; index++) {
    final name = RegExp(r'^\s*// #region (\S+)$').firstMatch(lines[index]);
    if (name == null) continue;
    final end = lines.indexWhere(
      (line) => line.trim() == '// #endregion ${name.group(1)}',
      index,
    );
    if (end == -1) continue;
    final body = lines.sublist(index + 1, end);
    final first = body.indexWhere((line) => line.trim().isNotEmpty);
    if (first == -1) continue;
    final last = body.lastIndexWhere((line) => line.trim().isNotEmpty);
    final code = body.sublist(first, last + 1);
    final indent = code
        .where((line) => line.trim().isNotEmpty)
        .map((line) => line.length - line.trimLeft().length)
        .reduce((a, b) => a < b ? a : b);
    regions.add(
      code
          .map((line) => line.length < indent ? '' : line.substring(indent))
          .join('\n'),
    );
  }
  return regions;
}

/// The `<file>:<line>` of each doc snippet in [sources] (keyed by path) that
/// is not a region of any of the [examples].
List<String> snippetsOutsideExamples(
  Map<String, String> sources,
  List<String> examples,
) {
  final regions = {for (final example in examples) ...exampleRegions(example)};
  return [
    for (final MapEntry(key: path, value: source) in sources.entries)
      for (final snippet in docSnippets(source, markdown: path.endsWith('.md')))
        if (!regions.contains(snippet.code)) '$path:${snippet.line}',
  ];
}

Iterable<File> _dartFiles(String directory) => Directory(directory)
    .listSync(recursive: true)
    .whereType<File>()
    .where((file) => file.path.endsWith('.dart'));
