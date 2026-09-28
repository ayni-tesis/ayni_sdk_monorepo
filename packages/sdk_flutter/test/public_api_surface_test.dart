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
  // Dart accepts single- or double-quoted URIs; both must be recognized so a
  // leaking export cannot hide behind the other quote style.
  final pattern = RegExp(
    r'''export\s+(['"])([^'"]+)\1\s*([^;]*);''',
    multiLine: true,
  );
  final exports = <String, Set<String>>{};
  for (final match in pattern.allMatches(source)) {
    final uri = match.group(2)!;
    final clause = (match.group(3) ?? '').trim();
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

List<String> contractProblems(Map<String, Set<String>> actual) {
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
      problems.add("unexpected export of '${entry.key}': ${names.join(', ')}");
    }
  }
  return problems;
}

void main() {
  group('US-090 public export surface', () {
    test('the barrel exports exactly the contract symbols', () {
      final barrel = File('lib/ayni_sdk.dart').readAsStringSync();
      final problems = contractProblems(exportedSymbols(barrel));

      expect(
        problems,
        isEmpty,
        reason:
            'lib/ayni_sdk.dart must export exactly the US-090 contract '
            '(US-090). Problems:\n'
            '${problems.map((problem) => '- $problem').join('\n')}',
      );
    });

    test('an extra export written with double quotes fails the comparison', () {
      final barrel = File('lib/ayni_sdk.dart').readAsStringSync();
      final withLeak =
          "$barrel\n"
          'export "src/package_validator.dart" show PackageValidator;';
      final problems = contractProblems(exportedSymbols(withLeak));

      expect(
        problems,
        hasLength(1),
        reason:
            'a double-quoted export outside the contract must be reported '
            'exactly once, found:\n${problems.join('\n')}',
      );
      expect(
        problems.single,
        contains('src/package_validator.dart'),
        reason: 'the report must name the leaking export',
      );
    });

    test('every contract type is reachable from the public library', () {
      // Each value references a contract symbol through the public import, so
      // this file stops compiling if the barrel drops it, and the keys are
      // compared against `expectedExports`, the single source of truth for
      // the contract names — not against a count.
      final contractTypes = <String, Type>{
        'AyniConfig': AyniConfig,
        'AyniInitializationResult': AyniInitializationResult,
        'AyniSdk': AyniSdk,
        'AyniSdkConfig': AyniSdkConfig,
        'InitializationResult': InitializationResult,
        'InitializationStatus': InitializationStatus,
        'SyncResult': SyncResult,
        'SyncResourceResult': SyncResourceResult,
        'SyncResourceStatus': SyncResourceStatus,
        'SyncResourceType': SyncResourceType,
        'SyncStatus': SyncStatus,
        'BooleanResult': BooleanResult,
        'ClassificationResult': ClassificationResult,
        'Detection': Detection,
        'DetectionResult': DetectionResult,
        'WorkflowError': WorkflowError,
        'WorkflowErrorCategory': WorkflowErrorCategory,
        'WorkflowResult': WorkflowResult,
        'WorkflowValue': WorkflowValue,
      };
      final expectedNames = expectedExports.values
          .expand((names) => names)
          .toSet();

      expect(
        contractTypes.keys.toSet(),
        expectedNames,
        reason:
            'every symbol of the US-090 contract must be referenced through '
            'package:ayni_sdk/ayni_sdk.dart, and nothing else may appear here.',
      );
    });

    test('initialize, sync and run keep their published signatures', () {
      expect(
        AyniSdk.initialize,
        isA<AyniInitializationResult Function(AyniConfig)>(),
      );

      final sdk = AyniSdk(
        serverUrl: Uri.parse('https://sdk.example.test'),
        credential: 'ayni_sk_test',
        storageDirectory: Directory.systemTemp,
      );
      expect(sdk.sync, isA<Future<SyncResult> Function()>());
      expect(
        sdk.run,
        isA<Future<WorkflowResult> Function(String, Uint8List)>(),
      );
    });
  });

  group('README documents the public API contract', () {
    test('states the exact rule about internal src files', () {
      final readme = File('README.md').readAsStringSync();

      expect(
        readme,
        contains('No importes archivos src internos.'),
        reason:
            'US-090 requires the README to contain that exact sentence so '
            'integrators know lib/src/ is not part of the contract.',
      );
    });
  });

  group('internal implementation classes are not part of the contract', () {
    test(
      'the standard lint set reports an app importing package:ayni_sdk/src/...',
      () async {
        final fixture = Directory('test/fixtures/internal_import');
        expect(
          fixture.existsSync(),
          isTrue,
          reason: 'the negative fixture must exist at ${fixture.path}',
        );

        // The fixture must model an app with the tooling it would really
        // ship: `package:lints` recommended, the set `flutter_lints` builds
        // on for Flutter apps. The diagnostic has to come from that standard
        // rule set, not from this fixture configuring the rule by hand.
        final options = File(
          '${fixture.path}/analysis_options.yaml',
        ).readAsStringSync();
        expect(
          options,
          contains('package:lints/recommended.yaml'),
          reason:
              'the fixture must include the standard lint set, found:\n'
              '$options',
        );
        expect(
          options,
          isNot(contains('analyzer:')),
          reason:
              'the fixture must not escalate severities by hand, found:\n'
              '$options',
        );

        // Always resolve: the fixture is its own package, and a stale
        // package_config.json (for example after adding the `lints`
        // dependency) would hide the real diagnostic behind an unresolved
        // include.
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

        final analyze = await Process.run(Platform.resolvedExecutable, [
          'analyze',
        ], workingDirectory: fixture.path);
        final output = 'stdout:\n${analyze.stdout}\nstderr:\n${analyze.stderr}';

        // `implementation_imports` comes from `package:lints/recommended.yaml`
        // and is reported at info severity, so `dart analyze` prints the
        // diagnostic and exits 0 (`flutter analyze`, which apps like
        // apps/native run, treats infos as fatal by default).
        expect(
          output,
          contains('implementation_imports'),
          reason:
              'the standard lint set must report the internal import:\n'
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
