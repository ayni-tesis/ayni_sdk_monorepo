// Example of the Dart API reference (US-143). The `///` comments of
// `AyniSdk` and the package README show its regions, and
// `test/doc_examples_test.dart` fails if they drift from them, so
// `dart analyze` checks the snippets.
import 'dart:io';

// #region importar
import 'package:ayni_sdk/ayni_sdk.dart';

// #endregion importar

/// Initializes the shared client, or returns `null` after showing why it
/// could not.
AyniSdk? initializeAyni(
  String credential,
  Directory storageDirectory,
  void Function(String message) showMessage,
) {
  // #region inicializar
  final result = AyniSdk.initialize(
    AyniConfig(
      serverUrl: Uri.parse('https://tu-servidor-ayni.example'),
      credential: credential,
      storageDirectory: storageDirectory,
    ),
  );
  if (!result.isReady) {
    showMessage(result.message);
    return null;
  }
  return AyniSdk.instance;
  // #endregion inicializar
}
