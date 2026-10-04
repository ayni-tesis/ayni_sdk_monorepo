import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final projectDirectory = Directory.current;

  test('pins ayni_sdk to the hosted 0.2.0 package without a local override', () {
    final pubspec = File('${projectDirectory.path}/pubspec.yaml').readAsStringSync();

    expect(pubspec, contains(RegExp(r'^  ayni_sdk: 0[.]2[.]0\s*$', multiLine: true)));
    expect(pubspec, isNot(contains('dependency_overrides:')));
    expect(pubspec, isNot(contains('path: ../../packages/sdk_flutter')));
  });

  test('keeps the Android host at API 26 or newer', () {
    final buildFile = File(
      '${projectDirectory.path}/android/app/build.gradle.kts',
    );

    expect(buildFile.existsSync(), isTrue);
    final buildConfiguration = buildFile.readAsStringSync();
    final minSdkMatch = RegExp(r'minSdk\s*=\s*(\d+)').firstMatch(buildConfiguration);
    final compileSdkMatch = RegExp(r'compileSdk\s*=\s*(\d+)').firstMatch(buildConfiguration);

    expect(minSdkMatch, isNotNull);
    expect(int.parse(minSdkMatch!.group(1)!), greaterThanOrEqualTo(26));
    expect(compileSdkMatch, isNotNull);
    expect(int.parse(compileSdkMatch!.group(1)!), 36);
  });
}
