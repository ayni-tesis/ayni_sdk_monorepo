import 'dart:io';

import 'package:ayni_sdk/src/sdk_internal.dart';

/// Writes the sync inventory and one installed workflow definition exactly
/// where `AyniSdk.run` reads them.
///
/// Shared by `ayni_sdk_test.dart` and `typed_results_test.dart`, which
/// otherwise re-implemented this install helper. The definition path comes
/// from the SDK's own production builder (`installedWorkflowDefinitionFile`),
/// never from a re-implemented base64Url encoding.
Future<void> installWorkflowFiles({
  required Directory storageDirectory,
  required String inventoryJson,
  required String workflowVersionId,
  required String definitionJson,
}) async {
  await File(
    '${storageDirectory.path}${Platform.pathSeparator}sync-inventory.json',
  ).writeAsString(inventoryJson);
  final definition = installedWorkflowDefinitionFile(
    storageDirectory,
    workflowVersionId,
  );
  await definition.create(recursive: true);
  await definition.writeAsString(definitionJson);
}
