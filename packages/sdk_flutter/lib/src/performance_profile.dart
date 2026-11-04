import 'dart:async';
import 'dart:developer' as developer;

const _profilingEnabled = bool.fromEnvironment('AYNI_PROFILE');

/// Measures an asynchronous stage only in explicitly enabled profiling builds.
Future<T> profileStage<T>(
  String name,
  Future<T> Function() action, {
  bool enabled = _profilingEnabled,
  void Function(String name, bool start)? onEvent,
}) {
  if (!enabled) return action();
  final task = onEvent == null ? developer.TimelineTask() : null;
  task?.start('Ayni.$name');
  onEvent?.call(name, true);
  return Future.sync(action).whenComplete(() {
    task?.finish();
    onEvent?.call(name, false);
  });
}

/// Measures a synchronous stage only in explicitly enabled profiling builds.
T profileStageSync<T>(
  String name,
  T Function() action, {
  bool enabled = _profilingEnabled,
  void Function(String name, bool start)? onEvent,
}) {
  if (!enabled) return action();
  final task = onEvent == null ? developer.TimelineTask() : null;
  task?.start('Ayni.$name');
  onEvent?.call(name, true);
  try {
    return action();
  } finally {
    task?.finish();
    onEvent?.call(name, false);
  }
}
