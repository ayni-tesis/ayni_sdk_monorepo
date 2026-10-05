import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final projectDirectory = Directory.current;

  test('resolves ayni_sdk from the hosted package, not a local override', () {
    final overrides = File('${projectDirectory.path}/pubspec_overrides.yaml');
    final lockfile = File('${projectDirectory.path}/pubspec.lock');
    final lockContents = lockfile.readAsStringSync();
    final lines = lockContents.split('\n');
    final packageStart = lines.indexOf('  ayni_sdk:');
    final packageEnd = packageStart < 0
        ? -1
        : lines.indexWhere(
            (line) => line.startsWith('  ') && !line.startsWith('    '),
            packageStart + 1,
          );
    final packageLines = packageStart < 0
        ? ''
        : lines
              .sublist(
                packageStart + 1,
                packageEnd < 0 ? lines.length : packageEnd,
              )
              .join('\n');

    expect(overrides.existsSync(), isFalse);
    expect(packageStart, greaterThanOrEqualTo(0));
    expect(packageLines, contains('source: hosted'));
    expect(packageLines, contains('url: "https://pub.dev"'));
  });
}
