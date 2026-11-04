import 'dart:async';

import 'package:ayni_sdk/src/workflow_preflight.dart';
import 'package:test/test.dart';

void main() {
  test(
    'starts integrity verification while input validation is pending',
    () async {
      final validation = Completer<void>();
      final integrity = Completer<void>();
      var integrityStarted = false;
      var finished = false;
      final result = prepareWorkflow(
        validate: () => validation.future,
        verify: () {
          integrityStarted = true;
          return integrity.future;
        },
      ).then((_) => finished = true);
      expect(integrityStarted, isTrue);
      validation.complete();
      await Future<void>.delayed(Duration.zero);
      expect(finished, isFalse);
      integrity.complete();
      await result;
      expect(finished, isTrue);
    },
  );

  test(
    'input failure takes precedence over an earlier integrity failure',
    () async {
      final validation = Completer<void>();
      final result = prepareWorkflow(
        validate: () => validation.future,
        verify: () async => throw StateError('integrity'),
      );
      final expectation = expectLater(result, throwsA(isA<FormatException>()));
      await Future<void>.delayed(Duration.zero);
      validation.completeError(const FormatException('input'));
      await expectation;
    },
  );

  test('integrity failure prevents successful preparation', () async {
    await expectLater(
      prepareWorkflow(
        validate: () async {},
        verify: () async => throw StateError('integrity'),
      ),
      throwsStateError,
    );
  });

  test(
    'does not return an input failure while verification is still active',
    () async {
      final integrity = Completer<void>();
      var completed = false;
      final result = prepareWorkflow(
        validate: () async => throw const FormatException('input'),
        verify: () => integrity.future,
      );
      final observed = result.then<void>(
        (_) => completed = true,
        onError: (Object _, StackTrace __) => completed = true,
      );
      await Future<void>.delayed(Duration.zero);
      expect(completed, isFalse);
      integrity.complete();
      await observed;
      expect(completed, isTrue);
    },
  );
}
