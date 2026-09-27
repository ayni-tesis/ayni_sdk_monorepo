// Quick start of the SDK documentation (US-139). The site shows each
// `#region` of this file as a step, so `dart analyze` checks every snippet.
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';

// #region guardar-credencial
const credential = String.fromEnvironment('AYNI_CREDENTIAL');
// #endregion guardar-credencial

/// Syncs the application's published workflows into [storageDirectory] and
/// returns the message to show.
Future<String> syncAyni(Directory storageDirectory) async {
  // #region crear-cliente
  final sdk = AyniSdk(
    serverUrl: Uri.parse('https://tu-servidor-ayni.example'),
    credential: credential,
    storageDirectory: storageDirectory,
  );
  // #endregion crear-cliente

  // #region sincronizar
  final result = await sdk.sync();
  // #endregion sincronizar

  return syncMessage(result);
}

// #region revisar-resultado
String syncMessage(SyncResult result) {
  return switch (result.status) {
    SyncStatus.updated => 'Sincronización completada.',
    SyncStatus.upToDate => 'Ya estás al día.',
    SyncStatus.offline => 'Sin conexión.',
    SyncStatus.error =>
      'No se completó la sincronización. Revisa los recursos afectados.',
  };
}

// #endregion revisar-resultado
