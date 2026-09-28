import 'dart:io';

import 'package:ayni_sdk/src/package_validator.dart';
import 'package:test/test.dart';

import '../bin/package.dart';

/// The US-089 rejection contract every invalid package must answer with.
const _appConfigRejectionMessage =
    'El paquete no puede incluir configuración específica de una aplicación.';

/// The US-089 success message for a package that passes every rule.
const _packageCreatedMessage = 'Paquete ayni_sdk creado.';

void createValidMinimalPackage(
  Directory dir, {
  String? pubspecContent,
  String? libContent,
  String? readmeContent,
}) {
  if (!dir.existsSync()) {
    dir.createSync(recursive: true);
  }
  File('${dir.path}/pubspec.yaml').writeAsStringSync(
    pubspecContent ??
        '''
name: ayni_sdk
description: Test SDK package
version: 0.1.0
''',
  );
  Directory('${dir.path}/lib').createSync(recursive: true);
  File('${dir.path}/lib/ayni_sdk.dart').writeAsStringSync(
    libContent ??
        '''
// Public library entrypoint
class AyniSdk {}
''',
  );
  File('${dir.path}/README.md').writeAsStringSync(
    readmeContent ??
        '''
# ayni_sdk
Test SDK documentation.
''',
  );
  Directory('${dir.path}/test').createSync(recursive: true);
  File('${dir.path}/test/sample_test.dart').writeAsStringSync('''
void main() {}
''');
}

void main() {
  group('PackageValidator on real package', () {
    test('successfully validates packages/sdk_flutter', () {
      final packageDir = Directory.current;
      final result = PackageValidator.validate(packageDir);

      expect(result.isValid, isTrue);
      expect(result.message, equals(_packageCreatedMessage));
      expect(result.detail, isNull);
    });

    test('isPackageDirectory identifies packages/sdk_flutter', () {
      expect(PackageValidator.isPackageDirectory(Directory.current), isTrue);
    });
  });

  group('PackageValidator structural rules', () {
    late Directory tempDir;

    setUp(() {
      tempDir = Directory.systemTemp.createTempSync('ayni_pkg_test_');
      createValidMinimalPackage(tempDir);
    });

    tearDown(() {
      if (tempDir.existsSync()) {
        tempDir.deleteSync(recursive: true);
      }
    });

    test('rejects non-existent directory', () {
      final nonExistent = Directory('${tempDir.path}/non_existent_dir');
      final result = PackageValidator.validate(nonExistent);

      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
      expect(result.detail, contains('El directorio no existe'));
    });

    test('rejects missing pubspec.yaml', () {
      File('${tempDir.path}/pubspec.yaml').deleteSync();

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
      expect(result.detail, equals('Falta el archivo requerido pubspec.yaml.'));
    });

    test('rejects missing lib/ayni_sdk.dart', () {
      File('${tempDir.path}/lib/ayni_sdk.dart').deleteSync();

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
      expect(
        result.detail,
        equals('Falta el archivo requerido lib/ayni_sdk.dart.'),
      );
    });

    test('rejects missing README.md', () {
      File('${tempDir.path}/README.md').deleteSync();

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
      expect(result.detail, equals('Falta el archivo requerido README.md.'));
    });

    test('rejects missing test/ directory', () {
      Directory('${tempDir.path}/test').deleteSync(recursive: true);

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
      expect(result.detail, equals('Falta el directorio requerido test/.'));
    });

    test('rejects test/ directory without Dart test files', () {
      File('${tempDir.path}/test/sample_test.dart').deleteSync();
      File('${tempDir.path}/test/not_a_test.txt').writeAsStringSync('notes');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
      expect(
        result.detail,
        equals('El directorio test/ no contiene archivos de prueba Dart.'),
      );
    });
  });

  group('PackageValidator pubspec.yaml rules', () {
    late Directory tempDir;

    setUp(() {
      tempDir = Directory.systemTemp.createTempSync('ayni_pubspec_test_');
      createValidMinimalPackage(tempDir);
    });

    tearDown(() {
      if (tempDir.existsSync()) {
        tempDir.deleteSync(recursive: true);
      }
    });

    test('rejects pubspec with wrong package name', () {
      File('${tempDir.path}/pubspec.yaml').writeAsStringSync('''
name: different_package
description: Not ayni_sdk
version: 0.1.0
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    for (final key in [
      'app_id',
      'application_id',
      'workspace_id',
      'secret',
      'credential',
      'api_key',
      'client_secret',
      'server_url',
      'backend_url',
    ]) {
      test('rejects pubspec containing app-specific key "$key"', () {
        File('${tempDir.path}/pubspec.yaml').writeAsStringSync('''
name: ayni_sdk
description: Test SDK package
version: 0.1.0

$key: "some-hardcoded-value"
''');

        final result = PackageValidator.validate(tempDir);
        expect(result.isValid, isFalse);
        expect(result.message, equals(_appConfigRejectionMessage));
      });
    }

    test('rejects pubspec depending on apps/ path', () {
      File('${tempDir.path}/pubspec.yaml').writeAsStringSync('''
name: ayni_sdk
dependencies:
  native_app:
    path: ../../apps/native
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test('rejects pubspec depending on better_fullstack_app', () {
      File('${tempDir.path}/pubspec.yaml').writeAsStringSync('''
name: ayni_sdk
dependencies:
  better_fullstack_app: ^1.0.0
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test('rejects pubspec depending on @ayni/api', () {
      File('${tempDir.path}/pubspec.yaml').writeAsStringSync('''
name: ayni_sdk
dependencies:
  "@ayni/api": ^1.0.0
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });
  });

  group('PackageValidator forbidden app config files', () {
    late Directory tempDir;

    setUp(() {
      tempDir = Directory.systemTemp.createTempSync(
        'ayni_forbidden_files_test_',
      );
      createValidMinimalPackage(tempDir);
    });

    tearDown(() {
      if (tempDir.existsSync()) {
        tempDir.deleteSync(recursive: true);
      }
    });

    for (final filename in [
      '.env',
      '.env.local',
      '.env.production',
      'ayni.config.json',
      'app.config.json',
      'app_config.json',
      'google-services.json',
      'GoogleService-Info.plist',
    ]) {
      test('rejects presence of forbidden file "$filename"', () {
        File('${tempDir.path}/$filename').writeAsStringSync('{}');

        final result = PackageValidator.validate(tempDir);
        expect(result.isValid, isFalse);
        expect(result.message, equals(_appConfigRejectionMessage));
      });
    }

    test(
      'does not skip forbidden file scanning when packageDir path contains build in parent',
      () {
        final parentBuildDir = Directory('${tempDir.path}/build/nested');
        parentBuildDir.createSync(recursive: true);
        final subPackageDir = Directory('${parentBuildDir.path}/pkg');
        createValidMinimalPackage(subPackageDir);
        File('${subPackageDir.path}/.env').writeAsStringSync('KEY=VAL');

        final result = PackageValidator.validate(subPackageDir);
        expect(result.isValid, isFalse);
        expect(result.message, equals(_appConfigRejectionMessage));
        expect(result.detail, contains('.env'));
      },
    );
  });

  group('PackageValidator hardcoded secrets and application IDs', () {
    late Directory tempDir;

    setUp(() {
      tempDir = Directory.systemTemp.createTempSync('ayni_secrets_test_');
      createValidMinimalPackage(tempDir);
    });

    tearDown(() {
      if (tempDir.existsSync()) {
        tempDir.deleteSync(recursive: true);
      }
    });

    test('rejects hardcoded ayni_sk_ secret in lib/', () {
      File('${tempDir.path}/lib/secrets.dart').writeAsStringSync('''
const hardcodedSecret = 'ayni_sk_live_1234567890';
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test('rejects hardcoded secret_ token in lib/', () {
      File('${tempDir.path}/lib/secrets.dart').writeAsStringSync('''
final token = "secret_prod_abcdef123";
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test('rejects hardcoded sk_live_ token in lib/', () {
      File('${tempDir.path}/lib/secrets.dart').writeAsStringSync('''
const apiKey = 'sk_live_abcdef123456';
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test('rejects hardcoded app_ identifier in lib/', () {
      File('${tempDir.path}/lib/config.dart').writeAsStringSync('''
const targetApp = 'app_production_12345';
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test(
      'allows comments referencing credential patterns without false-positive',
      () {
        File('${tempDir.path}/lib/docs_sample.dart').writeAsStringSync('''
/// Reference format: (`ayni_sk_...`)
// Example: pass your credential securely in runtime
class SecureSample {}
''');

        final result = PackageValidator.validate(tempDir);
        expect(result.isValid, isTrue);
        expect(result.message, equals(_packageCreatedMessage));
      },
    );

    test('rejects secret in URL string containing comment delimiter //', () {
      File('${tempDir.path}/lib/api.dart').writeAsStringSync('''
const endpoint = 'https://api.ayni.dev/ayni_sk_live_abcdef123';
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test(
      'rejects secret in string containing block comment delimiters /* */',
      () {
        File('${tempDir.path}/lib/api.dart').writeAsStringSync('''
const val = "/* pseudo comment */ ayni_sk_live_abcdef123";
''');

        final result = PackageValidator.validate(tempDir);
        expect(result.isValid, isFalse);
        expect(result.message, equals(_appConfigRejectionMessage));
      },
    );

    test('rejects secret in raw string', () {
      File('${tempDir.path}/lib/api.dart').writeAsStringSync('''
const rawKey = r'ayni_sk_live_abcdef123';
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test('rejects secret in triple-quoted multiline string', () {
      File('${tempDir.path}/lib/api.dart').writeAsStringSync('''
const multiline = """
prefix
ayni_sk_live_abcdef123
suffix
""";
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test('rejects secret in string containing escaped quotes', () {
      File('${tempDir.path}/lib/api.dart').writeAsStringSync('''
const escaped = "key: \\" ayni_sk_live_abcdef123 \\"";
''');

      final result = PackageValidator.validate(tempDir);
      expect(result.isValid, isFalse);
      expect(result.message, equals(_appConfigRejectionMessage));
    });

    test(
      'strips nested block comments containing secret without false positive',
      () {
        File('${tempDir.path}/lib/api.dart').writeAsStringSync('''
/*
  Outer comment
  /*
    Nested comment with ayni_sk_live_abcdef123
  */
  Back to outer
*/
class CleanClass {}
''');

        final result = PackageValidator.validate(tempDir);
        expect(result.isValid, isTrue);
        expect(result.message, equals(_packageCreatedMessage));
      },
    );
  });

  group('CLI runPackageCommand', () {
    test('returns 0 and outputs success message for valid package', () async {
      final out = StringBuffer();
      final err = StringBuffer();

      final exitCode = await runPackageCommand([], outSink: out, errSink: err);

      expect(exitCode, equals(0));
      expect(out.toString().trim(), equals(_packageCreatedMessage));
      expect(err.toString(), isEmpty);
    });

    test(
      'returns 1 and outputs failure message with detail for invalid package directory',
      () async {
        final out = StringBuffer();
        final err = StringBuffer();
        final invalidDir = Directory.systemTemp.createTempSync('invalid_pkg_');

        try {
          final exitCode = await runPackageCommand(
            [invalidDir.path],
            outSink: out,
            errSink: err,
          );

          expect(exitCode, equals(1));
          final errOutput = err.toString();
          expect(errOutput, contains(_appConfigRejectionMessage));
          expect(
            errOutput,
            contains('Falta el archivo requerido pubspec.yaml.'),
          );
          expect(out.toString(), isEmpty);
        } finally {
          invalidDir.deleteSync(recursive: true);
        }
      },
    );
  });
}
