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
    if (result.detail != null) {
      err.writeln(result.detail);
    }
    return 1;
  }
}

Directory _resolvePackageDirectory() {
  final candidateDirectories = <Directory>[
    Directory.current,
    if (Platform.script.scheme == 'file')
      File.fromUri(Platform.script).parent.parent,
  ];

  for (final candidate in candidateDirectories) {
    if (PackageValidator.isPackageDirectory(candidate)) {
      return candidate;
    }
  }

  return Directory.current;
}

Future<void> main(List<String> args) async {
  final exitCode = await runPackageCommand(args);
  exit(exitCode);
}
