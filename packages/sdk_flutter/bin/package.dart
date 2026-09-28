import 'dart:io';

import 'package:ayni_sdk/src/package_validator.dart';

/// Runs the package validator command for ayni_sdk.
///
/// Resolves the package directory from [args] if provided, or infers it from
/// the current working directory or the script location.
///
/// Writes the outcome message to [outSink] (defaults to [stdout]) on success,
/// or [errSink] (defaults to [stderr]) on failure.
///
/// Returns 0 on success, 1 on failure.
Future<int> runPackageCommand(
  List<String> args, {
  StringSink? outSink,
  StringSink? errSink,
}) async {
  final out = outSink ?? stdout;
  final err = errSink ?? stderr;

  Directory packageDir;
  if (args.isNotEmpty) {
    packageDir = Directory(args.first);
  } else {
    packageDir = _resolvePackageDirectory();
  }

  final result = PackageValidator.validate(packageDir);
  if (result.isValid) {
    out.writeln(result.message);
    return 0;
  } else {
    err.writeln(result.message);
    return 1;
  }
}

Directory _resolvePackageDirectory() {
  // 1. Check if current working directory has a pubspec.yaml with name: ayni_sdk
  final currentPubspec = File('${Directory.current.path}/pubspec.yaml');
  if (currentPubspec.existsSync()) {
    try {
      final content = currentPubspec.readAsStringSync();
      if (RegExp(r'^\s*name:\s*ayni_sdk\s*$', multiLine: true).hasMatch(content)) {
        return Directory.current;
      }
    } catch (_) {}
  }

  // 2. Check if script location resolves to the package directory (e.g. packages/sdk_flutter/bin/package.dart)
  try {
    final scriptUri = Platform.script;
    if (scriptUri.scheme == 'file') {
      final scriptFile = File.fromUri(scriptUri);
      final binDir = scriptFile.parent;
      final candidateDir = binDir.parent;
      final candidatePubspec = File('${candidateDir.path}/pubspec.yaml');
      if (candidatePubspec.existsSync()) {
        final content = candidatePubspec.readAsStringSync();
        if (RegExp(r'^\s*name:\s*ayni_sdk\s*$', multiLine: true).hasMatch(content)) {
          return candidateDir;
        }
      }
    }
  } catch (_) {}

  // 3. Fallback to current directory
  return Directory.current;
}

Future<void> main(List<String> args) async {
  final exitCode = await runPackageCommand(args);
  exit(exitCode);
}
