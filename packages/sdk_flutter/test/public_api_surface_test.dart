import 'dart:io';
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

const Map<String, Set<String>> expectedExports = {
  'src/ayni_sdk.dart': {
    'AyniConfig',
    'AyniInitializationResult',
    'AyniSdk',
    'AyniSdkConfig',
    'InitializationResult',
    'InitializationStatus',
    'SyncResult',
    'SyncResourceResult',
    'SyncResourceStatus',
    'SyncResourceType',
    'SyncStatus',
  },
  'src/workflow_execution.dart': {
    'BooleanResult',
    'ClassificationResult',
    'Detection',
    'DetectionResult',
    'WorkflowError',
    'WorkflowErrorCategory',
    'WorkflowResult',
    'WorkflowValue',
  },
};

String stripComments(String source) {
  final withoutBlockComments = source.replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '');
  final lines = withoutBlockComments
      .split('\n')
      .where((line) => !line.trimLeft().startsWith('//'));
  return lines.join('\n');
}

Map<String, Set<String>> exportedSymbols(String barrelSource) {
  final source = stripComments(barrelSource);
  final pattern = RegExp(r"export\s+'([^']+)'\s*([^;]*);", multiLine: true);
  final exports = <String, Set<String>>{};
  for (final match in pattern.allMatches(source)) {
    final uri = match.group(1)!;
    final clause = (match.group(2) ?? '').trim();
    if (clause.isEmpty) {
      fail(
        "export '$uri' is a whole-library export; narrow it with an explicit "
        'show clause so every public symbol is listed',
      );
    }
    if (!clause.startsWith('show')) {
      fail("export '$uri' must use an explicit show clause; found: $clause");
    }
    if (exports.containsKey(uri)) {
      fail("export '$uri' appears more than once in the barrel");
    }
    final names = clause
        .substring('show'.length)
        .split(',')
        .map((name) => name.trim())
        .where((name) => name.isNotEmpty)
        .toSet();
    if (names.isEmpty) {
      fail("export '$uri' has an empty show clause");
    }
    exports[uri] = names;
  }
  if (exports.isEmpty) {
    fail('lib/ayni_sdk.dart contains no export directives');
  }
  return exports;
}

void main() {
  group('US-090 public export surface', () {
    test('the barrel exports exactly the contract symbols', () {
      final barrel = File('lib/ayni_sdk.dart').readAsStringSync();
      final actual = exportedSymbols(barrel);
      final problems = <String>[];

      for (final entry in expectedExports.entries) {
        final actualNames = actual[entry.key];
        if (actualNames == null) {
          problems.add("missing export of '${entry.key}'");
          continue;
        }
        final leaked = actualNames.difference(entry.value).toList()..sort();
        if (leaked.isNotEmpty) {
          problems.add(
            "'${entry.key}' exports symbols outside the US-090 contract: "
            '${leaked.join(', ')}',
          );
        }
        final missing = entry.value.difference(actualNames).toList()..sort();
        if (missing.isNotEmpty) {
          problems.add(
            "'${entry.key}' does not export contract symbols: "
            '${missing.join(', ')}',
          );
        }
      }
      for (final entry in actual.entries) {
        if (!expectedExports.containsKey(entry.key)) {
          final names = entry.value.toList()..sort();
          problems.add(
            "unexpected export of '${entry.key}': ${names.join(', ')}",
          );
        }
      }

      expect(
        problems,
        isEmpty,
        reason:
            'lib/ayni_sdk.dart must export exactly the US-090 contract '
            '(US-090). Problems:\n'
            '${problems.map((problem) => '- $problem').join('\n')}',
      );
    });

    test('every contract type is reachable from the public library', () {
      final List<Type> contractTypes = <Type>[
        AyniConfig,
        AyniInitializationResult,
        AyniSdk,
        AyniSdkConfig,
        InitializationResult,
        InitializationStatus,
        SyncResult,
        SyncResourceResult,
        SyncResourceStatus,
        SyncResourceType,
        SyncStatus,
        BooleanResult,
        ClassificationResult,
        Detection,
        DetectionResult,
        WorkflowError,
        WorkflowErrorCategory,
        WorkflowResult,
        WorkflowValue,
      ];
      final expectedCount = expectedExports.values.fold<int>(
        0,
        (total, names) => total + names.length,
      );
      expect(contractTypes, hasLength(expectedCount));
    });

    test('initialize, sync and run keep their published signatures', () {
      final AyniInitializationResult Function(AyniConfig) initialize =
          AyniSdk.initialize;
      final Future<SyncResult> Function(AyniSdk) sync = (AyniSdk sdk) =>
          sdk.sync();
      final Future<WorkflowResult> Function(AyniSdk, String, Uint8List) run =
          (AyniSdk sdk, String workflowId, Uint8List input) =>
              sdk.run(workflowId, input);

      expect(initialize, isNotNull);
      expect(sync, isNotNull);
      expect(run, isNotNull);
    });
  });

  group('internal implementation classes are not part of the contract', () {
    test(
      'dart analyze rejects an app importing package:ayni_sdk/src/...',
      () async {
        final fixture = Directory('test/fixtures/internal_import');
        expect(
          fixture.existsSync(),
          isTrue,
          reason: 'the negative fixture must exist at ${fixture.path}',
        );

        final packageConfig = File(
          '${fixture.path}/.dart_tool/package_config.json',
        );
        if (!packageConfig.existsSync()) {
          final pubGet = await Process.run(Platform.resolvedExecutable, [
            'pub',
            'get',
          ], workingDirectory: fixture.path);
          expect(
            pubGet.exitCode,
            0,
            reason:
                'dart pub get failed for the fixture:\n'
                '${pubGet.stdout}\n${pubGet.stderr}',
          );
        }

        final analyze = await Process.run(Platform.resolvedExecutable, [
          'analyze',
        ], workingDirectory: fixture.path);
        final output = 'stdout:\n${analyze.stdout}\nstderr:\n${analyze.stderr}';

        expect(
          analyze.exitCode,
          isNot(0),
          reason:
              'importing package:ayni_sdk/src/... from an app must be an '
              'analyze error, but dart analyze passed:\n$output',
        );
        expect(
          output,
          contains('implementation_imports'),
          reason:
              'the fixture must fail with implementation_imports:\n'
              '$output',
        );
        expect(
          output,
          contains('leak.dart'),
          reason: 'the failure must point at the leaking import:\n$output',
        );
        expect(
          output,
          isNot(contains('ok.dart')),
          reason: 'importing the public library must stay clean:\n$output',
        );
      },
      timeout: const Timeout(Duration(minutes: 3)),
    );
  });
}
