import 'package:flutter/services.dart';

class ValidationPerformanceTrace {
  const ValidationPerformanceTrace({required this.enabled});

  static const firstInference = 'AyniValidation.Perf01.FirstInference';
  static const coldStartToFirstInference =
      'AyniValidation.Perf01.ColdStartToFirstInference';
  static const _channel = MethodChannel('ayni_validation/performance_trace');

  final bool enabled;

  Future<T> measure<T>(String section, Future<T> Function() action) async {
    if (!enabled) return action();
    await _channel.invokeMethod<void>('beginSection', section);
    try {
      return await action();
    } finally {
      await _channel.invokeMethod<void>('endSection');
    }
  }

  Future<void> finishColdStart() async {
    if (enabled) await _channel.invokeMethod<void>('finishColdStart');
  }
}
