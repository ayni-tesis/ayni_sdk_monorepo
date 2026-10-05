import 'package:better_fullstack_app/validation/validation_lab_launch.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses a valid cold-start benchmark launch without credentials', () {
    final launch = ValidationLabLaunch.parseRoute(
      '/__ayni_lab/perf-01/control/PERF-01-007',
    );

    expect(launch?.condition.name, 'control');
    expect(launch?.runLabel, 'PERF-01-007');
  });

  test('leaves normal app routes outside the lab path', () {
    expect(ValidationLabLaunch.parseRoute('/'), isNull);
    expect(ValidationLabLaunch.parseRoute('/dashboard'), isNull);
  });

  test('rejects malformed or out-of-plan lab labels', () {
    for (final route in [
      '/__ayni_lab/perf-01/control/PERF-01-000',
      '/__ayni_lab/perf-01/control/PERF-01-031',
      '/__ayni_lab/perf-01/selector/PERF-01-007',
      '/__ayni_lab/perf-01/treatment/../secret',
    ]) {
      expect(
        () => ValidationLabLaunch.parseRoute(route),
        throwsFormatException,
        reason: route,
      );
    }
  });
}
