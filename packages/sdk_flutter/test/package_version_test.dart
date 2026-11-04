import 'dart:io';

import 'package:test/test.dart';

void main() {
  test(
    'the 0.4.1 package documents detection tensor roles and segmentation',
    () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      final readme = File('README.md').readAsStringSync();
      final changelog = File('CHANGELOG.md').readAsStringSync();

      expect(
        pubspec,
        matches(RegExp(r'^version:\s*0\.4\.1\s*$', multiLine: true)),
      );
      expect(readme, contains('tensorIndices'));
      expect(
        changelog,
        matches(
          RegExp(r'^## 0\.4\.1 - \d{4}-\d{2}-\d{2}\r?$', multiLine: true),
        ),
      );
      for (final role in ['boxes', 'classes', 'scores', 'count']) {
        expect(readme, contains('`$role`'));
      }
      expect(readme, contains('sin `tensorIndices`'));
      expect(readme, contains('`SegmentationResult`'));
      expect(readme, contains('`areaFractions`'));
      expect(readme, isNot(contains('package:ayni_sdk/src/')));
    },
  );
}
