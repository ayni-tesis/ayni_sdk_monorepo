import 'dart:async';

/// Validates the input and verifies artifacts before allowing execution.
Future<void> prepareWorkflow({
  required Future<void> Function() validate,
  required Future<void> Function() verify,
}) async {
  final validation = Future<void>.sync(validate);
  final verification = Future<void>.sync(verify)
      .then<({Object? error, StackTrace? stack})>(
        (_) => (error: null, stack: null),
        onError: (Object error, StackTrace stack) =>
            (error: error, stack: stack),
      );
  try {
    await validation;
  } catch (error, stack) {
    // Finish file reads before returning an input error to the host app.
    await verification;
    Error.throwWithStackTrace(error, stack);
  }
  final result = await verification;
  if (result.error case final error?) {
    Error.throwWithStackTrace(error, result.stack!);
  }
}
