import 'dart:io';

import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:better_fullstack_app/validation/validation_build_mode.dart';
import 'package:better_fullstack_app/validation/validation_run_metadata_reader.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('pins the hosted SDK and Android API floor for the thesis harness', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final android = File('android/app/build.gradle.kts').readAsStringSync();

    expect(pubspec, matches(RegExp(r'^  ayni_sdk: 0\.3\.0$', multiLine: true)));
    expect(validationSdkVersion, '0.3.0');
    expect(android, contains('compileSdk = 36'));
    expect(android, contains('minSdk = 26'));
  });

  test('keeps app data out of Android backups and device transfers', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();
    final extractionRules = File(
      'android/app/src/main/res/xml/data_extraction_rules.xml',
    ).readAsStringSync();
    final legacyRules = File(
      'android/app/src/main/res/xml/backup_rules.xml',
    ).readAsStringSync();

    expect(manifest, contains('android:allowBackup="false"'));
    for (final domain in [
      'root',
      'file',
      'database',
      'sharedpref',
      'external',
    ]) {
      final exclusion = '<exclude domain="$domain" path="." />';
      expect(extractionRules.split(exclusion).length - 1, 2);
      expect(legacyRules, contains(exclusion));
    }
  });

  test('declares selector and isolated compile-time modes', () {
    final buildMode = File(
      'lib/validation/validation_build_mode.dart',
    ).readAsStringSync();
    final directRunner = File(
      'lib/validation/execution/direct_tflite_runner.dart',
    ).readAsStringSync();

    expect(
      buildMode,
      matches(RegExp(r"String\.fromEnvironment\(\s*'VALIDATION_CONDITION'")),
    );
    expect(buildMode, contains("defaultValue: 'selector'"));
    for (final mode in ['selector', 'control', 'treatment']) {
      expect(buildMode, contains("'$mode'"));
    }
    expect(directRunner, contains('TfliteCpuInferenceEngine'));
    expect(
      validationRunnerKindFor(
        buildMode: 'selector',
        condition: ValidationCondition.control,
      ),
      ValidationRunnerKind.direct,
    );
    expect(
      validationRunnerKindFor(
        buildMode: 'selector',
        condition: ValidationCondition.treatment,
      ),
      ValidationRunnerKind.sdk,
    );
  });

  test('isolated builds expose exactly their matching runner', () {
    expect(
      validationRunnerKindFor(
        buildMode: 'control',
        condition: ValidationCondition.control,
      ),
      ValidationRunnerKind.direct,
    );
    expect(
      validationRunnerKindFor(
        buildMode: 'control',
        condition: ValidationCondition.treatment,
      ),
      ValidationRunnerKind.unavailable,
    );
    expect(
      validationRunnerKindFor(
        buildMode: 'treatment',
        condition: ValidationCondition.treatment,
      ),
      ValidationRunnerKind.sdk,
    );
    expect(
      validationRunnerKindFor(
        buildMode: 'treatment',
        condition: ValidationCondition.control,
      ),
      ValidationRunnerKind.unavailable,
    );
    expect(
      validationRunnerKindFor(
        buildMode: 'invalid',
        condition: ValidationCondition.control,
      ),
      ValidationRunnerKind.unavailable,
    );
  });
}
