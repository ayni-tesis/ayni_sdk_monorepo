// Data and privacy of the SDK documentation (US-147). The site shows each
// `#region` of this file in `Datos y privacidad`, so `dart analyze` checks
// every snippet.
import 'package:ayni_sdk/ayni_sdk.dart';

/// Deletes everything [sdk] keeps on this device.
///
/// Call it while no `sync()` is running. The workflows are not available
/// offline again until the next `sync()` downloads them.
Future<void> deleteAyniData(AyniSdk sdk) async {
  // #region borrar-datos
  final directory = sdk.storageDirectory;
  if (await directory.exists()) {
    await directory.delete(recursive: true);
  }
  // #endregion borrar-datos
}

/// Generates a new local installation identity for future traces.
Future<void> resetAyniInstallationId(AyniSdk sdk) async {
  // #region restablecer-identificador-instalacion
  await sdk.resetInstallationId();
  // #endregion restablecer-identificador-instalacion
}
