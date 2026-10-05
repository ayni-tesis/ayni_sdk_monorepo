import 'models/validation_run_record.dart';

class ValidationLabLaunch {
  const ValidationLabLaunch({required this.condition, required this.runLabel});

  static final _routePattern = RegExp(
    r'^/__ayni_lab/perf-01/(control|treatment)/(PERF-01-(?:00[1-9]|0[12][0-9]|030))$',
  );

  final ValidationCondition condition;
  final String runLabel;

  static ValidationLabLaunch? parseRoute(String route) {
    if (!route.startsWith('/__ayni_lab/')) return null;
    final match = _routePattern.firstMatch(route);
    if (match == null) {
      throw const FormatException('Invalid validation lab launch route.');
    }
    final condition = ValidationCondition.values.singleWhere(
      (value) => value.name == match.group(1),
    );
    return ValidationLabLaunch(condition: condition, runLabel: match.group(2)!);
  }
}
