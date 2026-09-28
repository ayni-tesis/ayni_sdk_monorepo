// Example of the Dart API reference (US-143). The `///` comments of
// `AyniSdk.sync` and `SyncResult` show the `sincronizar` region, and
// `test/doc_examples_test.dart` fails if they drift from it, so
// `dart analyze` checks the snippet.
import 'package:ayni_sdk/ayni_sdk.dart';

/// Syncs [sdk] and shows the message of every resource that did not update.
Future<void> syncAyni(
  AyniSdk sdk,
  void Function(String message) showMessage,
) async {
  // #region sincronizar
  final result = await sdk.sync();
  if (result.status == SyncStatus.offline) {
    showMessage('Sin conexión. Se usarán los workflows instalados.');
  }
  for (final resource in result.resources) {
    final message = resource.message;
    if (message != null) showMessage(message);
  }
  // #endregion sincronizar
}
