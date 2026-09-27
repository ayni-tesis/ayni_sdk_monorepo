// Configuration of the SDK documentation (US-140). The site shows each
// `#region` of this file in `Instalación y configuración`, so `dart analyze`
// checks every snippet.
import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';

const credential = String.fromEnvironment('AYNI_CREDENTIAL');

/// A client for the production server of Ayni.
AyniSdk productionClient(Directory storageDirectory) {
  // #region produccion
  final sdk = AyniSdk(
    serverUrl: Uri.parse('https://tu-servidor-ayni.example'),
    credential: credential,
    storageDirectory: storageDirectory,
  );
  // #endregion produccion
  return sdk;
}

/// A client for the Ayni server running on this computer.
AyniSdk localDevelopmentClient(Directory storageDirectory) {
  // #region desarrollo-local
  final sdk = AyniSdk(
    serverUrl: Uri.parse('http://localhost:3000'),
    credential: credential,
    storageDirectory: storageDirectory,
    allowInsecureLoopback: true,
  );
  // #endregion desarrollo-local
  return sdk;
}
