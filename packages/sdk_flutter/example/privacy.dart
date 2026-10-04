// Data and privacy of the SDK documentation (US-147). The site shows each
// `#region` of this file in `Datos y privacidad`, so `dart analyze` checks
// every snippet.
import 'dart:typed_data';

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

/// Runs [workflowId] on [image] and keeps evidence for a dataset only while
/// the person accepts evidence collection in the app.
Future<WorkflowResult> runWithEvidence(
  AyniSdk sdk,
  String workflowId,
  Uint8List image, {
  required bool evidenceAccepted,
  required void Function(String message) log,
}) async {
  // #region capturar-evidencia
  final result = await sdk.run(
    workflowId,
    image,
    evidenceConsent: evidenceAccepted,
    onEvidence: (event) => log(event.message),
  );
  // #endregion capturar-evidencia
  return result;
}

/// Shows `Evidencia pendiente de envío` while evidence waits on this device
/// for its upload.
Future<void> showPendingEvidence(
  AyniSdk sdk, {
  required void Function(String status) showStatus,
}) async {
  // #region evidencia-pendiente
  final pending = await sdk.pendingEvidenceCount();
  if (pending > 0) {
    showStatus('Evidencia pendiente de envío ($pending)');
  }
  // #endregion evidencia-pendiente
}

/// Shows the state of the evidence queue, such as `Pendiente de Wi-Fi` while
/// the collection policy only allows Wi-Fi and the device does not use it.
Future<void> showEvidenceQueueStatus(
  AyniSdk sdk, {
  required void Function(String status) showStatus,
}) async {
  // #region estado-cola-evidencia
  final status = await sdk.evidenceQueueStatus();
  if (status != EvidenceQueueStatus.empty) {
    showStatus(status.message);
  }
  // #endregion estado-cola-evidencia
}

/// Deletes the evidence kept on this device after the person withdraws their
/// consent for evidence collection.
Future<void> withdrawEvidenceConsent(AyniSdk sdk) async {
  // #region borrar-evidencia
  await sdk.clearPendingEvidence();
  // #endregion borrar-evidencia
}
