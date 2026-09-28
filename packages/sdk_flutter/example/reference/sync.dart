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
  switch (result.status) {
    case SyncStatus.offline:
      showMessage('Sin conexión. Se usarán los workflows instalados.');
    case SyncStatus.error:
      showMessage('La sincronización terminó con errores. Revisa cada recurso.');
    case SyncStatus.updated:
    case SyncStatus.upToDate:
      break;
  }
  for (final resource in result.resources) {
    switch (resource.status) {
      case SyncResourceStatus.updated:
        showMessage('Recurso actualizado.');
      case SyncResourceStatus.upToDate:
        showMessage('El recurso ya está actualizado.');
      case SyncResourceStatus.invalidRemoteResource:
      case SyncResourceStatus.invalidWorkflow:
      case SyncResourceStatus.unsupportedWorkflowVersion:
      case SyncResourceStatus.installationFailed:
      case SyncResourceStatus.dependencyFailed:
      case SyncResourceStatus.workflowUnavailable:
        showMessage(resource.message ?? 'No se pudo actualizar un recurso.');
    }
  }
  // #endregion sincronizar
}
