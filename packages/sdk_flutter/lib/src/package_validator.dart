import 'dart:io';

/// The result of validating an SDK package structure and configuration.
class PackageValidationResult {
  /// Whether the package satisfies all validation rules.
  final bool isValid;

  /// The summary message describing the validation outcome.
  final String message;

  /// Detailed explanation of why validation failed, if any.
  final String? detail;

  /// Creates a validation result.
  const PackageValidationResult({
    required this.isValid,
    required this.message,
    this.detail,
  });

  /// Success message according to US-089 specification.
  static const successMessage = 'Paquete ayni_sdk creado.';

  /// Failure message according to US-089 specification.
  static const failureMessage =
      'El paquete no puede incluir configuración específica de una aplicación.';

  /// Canonical successful validation result.
  static const success = PackageValidationResult(
    isValid: true,
    message: successMessage,
  );

  /// Creates a failure result with the standard failure message and optional [detail].
  static PackageValidationResult failure([String? detail]) =>
      PackageValidationResult(
        isValid: false,
        message: failureMessage,
        detail: detail,
      );

  @override
  String toString() =>
      'PackageValidationResult(isValid: $isValid, message: $message, detail: $detail)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PackageValidationResult &&
          runtimeType == other.runtimeType &&
          isValid == other.isValid &&
          message == other.message &&
          detail == other.detail;

  @override
  int get hashCode => Object.hash(isValid, message, detail);
}

/// Validates that the `ayni_sdk` Flutter/Dart package is self-contained, generic,
/// and contains no app-specific configuration, secrets, or dashboard dependencies.
abstract final class PackageValidator {
  PackageValidator._();

  /// Keys in `pubspec.yaml` that represent app-specific configuration and must be rejected.
  static const appSpecificKeys = [
    'app_id',
    'application_id',
    'workspace_id',
    'secret',
    'credential',
    'api_key',
    'client_secret',
    'server_url',
    'backend_url',
  ];

  /// Configuration file names associated with specific applications that must not be in the package.
  static const forbiddenAppFilePatterns = [
    'ayni.config.json',
    'app.config.json',
    'app_config.json',
    'google-services.json',
    'googleservice-info.plist',
  ];

  static final _secretPatterns = [
    RegExp(r'\bayni_sk_[a-zA-Z0-9_\-]{4,}'),
    RegExp(r'\bsecret_[a-zA-Z0-9_\-]{4,}'),
    RegExp(r'\bsk_live_[a-zA-Z0-9_\-]{4,}'),
  ];

  static final _appIdPatterns = [
    RegExp(r'\bapp_[a-zA-Z0-9_\-]{4,}'),
    RegExp(r'\bworkspace_[a-zA-Z0-9_\-]{4,}'),
  ];

  /// Whether [dir] appears to be an `ayni_sdk` package root directory by having
  /// a `pubspec.yaml` declaring `name: ayni_sdk`.
  static bool isPackageDirectory(Directory dir) {
    if (!dir.existsSync()) return false;
    final pubspec = File('${dir.path.replaceAll(r'\', '/')}/pubspec.yaml');
    if (!pubspec.existsSync()) return false;
    try {
      final content = pubspec.readAsStringSync();
      return RegExp(
        r'^\s*name:\s*ayni_sdk\s*$',
        multiLine: true,
      ).hasMatch(content);
    } catch (_) {
      return false;
    }
  }

  /// Validates the given [packageDir].
  static PackageValidationResult validate(Directory packageDir) {
    // 1. Verify directory existence
    if (!packageDir.existsSync()) {
      return PackageValidationResult.failure(
        'El directorio no existe: ${packageDir.path}',
      );
    }

    final normalizedPackagePath = packageDir.path.replaceAll(r'\', '/');

    // 2. Verify required files and structure
    final pubspecFile = File('$normalizedPackagePath/pubspec.yaml');
    if (!pubspecFile.existsSync()) {
      return PackageValidationResult.failure(
        'Falta el archivo requerido pubspec.yaml.',
      );
    }

    final publicLibFile = File('$normalizedPackagePath/lib/ayni_sdk.dart');
    if (!publicLibFile.existsSync()) {
      return PackageValidationResult.failure(
        'Falta el archivo requerido lib/ayni_sdk.dart.',
      );
    }

    final readmeFile = File('$normalizedPackagePath/README.md');
    if (!readmeFile.existsSync()) {
      return PackageValidationResult.failure(
        'Falta el archivo requerido README.md.',
      );
    }

    final testDir = Directory('$normalizedPackagePath/test');
    if (!testDir.existsSync()) {
      return PackageValidationResult.failure(
        'Falta el directorio requerido test/.',
      );
    }

    final hasTestFiles = testDir
        .listSync(recursive: true, followLinks: false)
        .whereType<File>()
        .any((f) => f.path.endsWith('.dart'));
    if (!hasTestFiles) {
      return PackageValidationResult.failure(
        'El directorio test/ no contiene archivos de prueba Dart.',
      );
    }

    // 3. Inspect pubspec.yaml
    final pubspecContent = pubspecFile.readAsStringSync();

    // Must declare name: ayni_sdk
    final nameRegex = RegExp(r'^\s*name:\s*ayni_sdk\s*$', multiLine: true);
    if (!nameRegex.hasMatch(pubspecContent)) {
      return PackageValidationResult.failure(
        'El archivo pubspec.yaml debe declarar name: ayni_sdk.',
      );
    }

    // Reject app-specific configuration keys in pubspec.yaml
    for (final key in appSpecificKeys) {
      final keyPattern = RegExp(
        r'^\s*' + RegExp.escape(key) + r'\s*:',
        multiLine: true,
        caseSensitive: false,
      );
      if (keyPattern.hasMatch(pubspecContent)) {
        return PackageValidationResult.failure(
          'pubspec.yaml contiene la clave específica de aplicación: $key',
        );
      }
    }

    // Reject dependencies pointing to applications or dashboard/backend
    if (RegExp(
          r'path:\s*.*apps[/\\]',
          caseSensitive: false,
        ).hasMatch(pubspecContent) ||
        pubspecContent.contains('better_fullstack_app') ||
        pubspecContent.contains('@ayni/api') ||
        RegExp(
          r'apps[/\\](web|server|native|docs)',
          caseSensitive: false,
        ).hasMatch(pubspecContent) ||
        RegExp(
          r'^\s*(?:better_fullstack_app|ayni_web|ayni_server)\s*:',
          multiLine: true,
          caseSensitive: false,
        ).hasMatch(pubspecContent)) {
      return PackageValidationResult.failure(
        'pubspec.yaml depende de una aplicación o dashboard/backend.',
      );
    }

    // 4. Reject forbidden application configuration files
    for (final entity in packageDir.listSync(
      recursive: true,
      followLinks: false,
    )) {
      final normalizedEntityPath = entity.path.replaceAll(r'\', '/');
      final relativePath =
          normalizedEntityPath.startsWith(normalizedPackagePath)
          ? normalizedEntityPath
                .substring(normalizedPackagePath.length)
                .replaceFirst(RegExp(r'^/'), '')
          : normalizedEntityPath;
      final pathSegments = relativePath.split('/');
      if (pathSegments.any(
        (seg) => seg == '.git' || seg == '.dart_tool' || seg == 'build',
      )) {
        continue;
      }

      if (entity is File) {
        final segments = entity.uri.pathSegments
            .where((s) => s.isNotEmpty)
            .toList();
        final fileName = segments.isNotEmpty
            ? segments.last
            : entity.path.split(RegExp(r'[/\\]')).last;
        final lowerName = fileName.toLowerCase();

        if (lowerName == '.env' ||
            lowerName.startsWith('.env.') ||
            forbiddenAppFilePatterns.contains(lowerName)) {
          return PackageValidationResult.failure(
            'Archivo de configuración de aplicación prohibido: $fileName',
          );
        }
      }
    }

    // 5. Scan lib/ Dart files for hardcoded secrets and application IDs
    final libDir = Directory('$normalizedPackagePath/lib');
    if (libDir.existsSync()) {
      for (final entity in libDir.listSync(
        recursive: true,
        followLinks: false,
      )) {
        if (entity is File && entity.path.endsWith('.dart')) {
          final normalizedEntityPath = entity.path.replaceAll(r'\', '/');
          // Skip validator self to avoid false-positives on regex patterns or docstrings
          if (normalizedEntityPath.endsWith(
            '/lib/src/package_validator.dart',
          )) {
            continue;
          }

          final rawContent = entity.readAsStringSync();
          final contentWithoutComments = _stripComments(rawContent);

          for (final pattern in _secretPatterns) {
            if (pattern.hasMatch(contentWithoutComments)) {
              return PackageValidationResult.failure(
                'Credencial o secreto hardcodeado en ${entity.path}',
              );
            }
          }

          for (final pattern in _appIdPatterns) {
            if (pattern.hasMatch(contentWithoutComments)) {
              return PackageValidationResult.failure(
                'Identificador de aplicación o workspace hardcodeado en ${entity.path}',
              );
            }
          }
        }
      }
    }

    return PackageValidationResult.success;
  }

  static String _stripComments(String source) {
    final buffer = StringBuffer();
    final length = source.length;
    var i = 0;

    while (i < length) {
      // Raw string literal: 'r' or 'R' immediately followed by quote
      if ((source[i] == 'r' || source[i] == 'R') &&
          i + 1 < length &&
          (source[i + 1] == "'" || source[i + 1] == '"')) {
        final isIdentifier =
            i > 0 && RegExp(r'[a-zA-Z0-9_$]').hasMatch(source[i - 1]);
        if (!isIdentifier) {
          buffer.write(source[i]);
          i++;
          final quoteChar = source[i];
          final isTriple =
              i + 2 < length &&
              source[i + 1] == quoteChar &&
              source[i + 2] == quoteChar;
          if (isTriple) {
            buffer.write(quoteChar * 3);
            i += 3;
            while (i < length) {
              if (i + 2 < length &&
                  source[i] == quoteChar &&
                  source[i + 1] == quoteChar &&
                  source[i + 2] == quoteChar) {
                buffer.write(quoteChar * 3);
                i += 3;
                break;
              }
              buffer.write(source[i]);
              i++;
            }
          } else {
            buffer.write(quoteChar);
            i++;
            while (i < length) {
              if (source[i] == quoteChar) {
                buffer.write(quoteChar);
                i++;
                break;
              }
              buffer.write(source[i]);
              i++;
            }
          }
          continue;
        }
      }

      // Regular string literal: ' or "
      if (source[i] == "'" || source[i] == '"') {
        final quoteChar = source[i];
        final isTriple =
            i + 2 < length &&
            source[i + 1] == quoteChar &&
            source[i + 2] == quoteChar;
        if (isTriple) {
          buffer.write(quoteChar * 3);
          i += 3;
          while (i < length) {
            if (source[i] == r'\' && i + 1 < length) {
              buffer.write(source[i]);
              buffer.write(source[i + 1]);
              i += 2;
            } else if (i + 2 < length &&
                source[i] == quoteChar &&
                source[i + 1] == quoteChar &&
                source[i + 2] == quoteChar) {
              buffer.write(quoteChar * 3);
              i += 3;
              break;
            } else {
              buffer.write(source[i]);
              i++;
            }
          }
        } else {
          buffer.write(quoteChar);
          i++;
          while (i < length) {
            if (source[i] == r'\' && i + 1 < length) {
              buffer.write(source[i]);
              buffer.write(source[i + 1]);
              i += 2;
            } else if (source[i] == quoteChar) {
              buffer.write(quoteChar);
              i++;
              break;
            } else {
              buffer.write(source[i]);
              i++;
            }
          }
        }
        continue;
      }

      // Line comment //
      if (source[i] == '/' && i + 1 < length && source[i + 1] == '/') {
        i += 2;
        while (i < length && source[i] != '\n') {
          i++;
        }
        if (i < length && source[i] == '\n') {
          buffer.write('\n');
          i++;
        }
        continue;
      }

      // Block comment /* (with nesting support)
      if (source[i] == '/' && i + 1 < length && source[i + 1] == '*') {
        i += 2;
        var depth = 1;
        while (i < length && depth > 0) {
          if (source[i] == '/' && i + 1 < length && source[i + 1] == '*') {
            depth++;
            i += 2;
          } else if (source[i] == '*' &&
              i + 1 < length &&
              source[i + 1] == '/') {
            depth--;
            i += 2;
          } else {
            if (source[i] == '\n') {
              buffer.write('\n');
            }
            i++;
          }
        }
        continue;
      }

      buffer.write(source[i]);
      i++;
    }

    return buffer.toString();
  }
}
