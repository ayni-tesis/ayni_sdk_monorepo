import 'package:ayni_sdk/src/performance_profile.dart';
import 'package:test/test.dart';

void main() {
  test('reports start and finish while preserving the result', () async {
    final events = <String>[];
    final result = await profileStage(
      'validation',
      () async => 42,
      enabled: true,
      onEvent: (name, start) => events.add('$name:$start'),
    );
    expect(result, 42);
    expect(events, ['validation:true', 'validation:false']);
  });

  test('finishes the stage and preserves errors', () async {
    final events = <String>[];
    await expectLater(
      profileStage<void>(
        'validation',
        () async => throw StateError('failure'),
        enabled: true,
        onEvent: (name, start) => events.add('$name:$start'),
      ),
      throwsStateError,
    );
    expect(events, ['validation:true', 'validation:false']);
  });

  test('disabled profiling does not emit events', () async {
    final events = <String>[];
    expect(
      await profileStage(
        'validation',
        () async => 42,
        enabled: false,
        onEvent: (name, start) => events.add(name),
      ),
      42,
    );
    expect(events, isEmpty);
  });

  test('synchronous stages finish even when they throw', () {
    final events = <String>[];
    expect(
      () => profileStageSync<void>(
        'model.load',
        () => throw StateError('x'),
        enabled: true,
        onEvent: (name, start) => events.add('$name:$start'),
      ),
      throwsStateError,
    );
    expect(events, ['model.load:true', 'model.load:false']);
  });
}
