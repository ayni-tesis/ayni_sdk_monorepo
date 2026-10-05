import 'dart:io';

import 'package:test/test.dart';

void main() {
  test('the 0.3.1 package documents detection tensor roles', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    final readme = File('README.md').readAsStringSync();

    expect(
      pubspec,
      matches(RegExp(r'^version:\s*0\.3\.1\s*$', multiLine: true)),
    );
    expect(readme, contains('tensorIndices'));
    for (final role in ['boxes', 'classes', 'scores', 'count']) {
      expect(readme, contains('`$role`'));
    }
    expect(readme, contains('sin `tensorIndices`'));
    expect(readme, isNot(contains('package:ayni_sdk/src/')));
  });
}
