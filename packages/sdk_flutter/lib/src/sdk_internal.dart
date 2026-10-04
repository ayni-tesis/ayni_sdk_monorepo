/// Shared internal primitives for the Ayni SDK.
///
/// These helpers are deliberately kept out of the public barrel
/// (`package:ayni_sdk/ayni_sdk.dart`): they are implementation detail, exposed
/// only so the SDK's own source files and tests can share one copy.
library;

import 'dart:convert';
import 'dart:io';

/// Whether [value] is a `String` with at least one character.
///
/// The single source of truth for the non-empty-string check the inventory
/// parser ([ayni_sdk.dart]) and the workflow definition validator
/// ([workflow_definition_validator.dart]) both rely on when reading JSON.
bool isNonEmptyString(Object? value) => value is String && value.isNotEmpty;

/// `ENOSPC` (`No space left on device`), the same number on Android (Linux)
/// and iOS (XNU). `dart:io` reports the operating system's own code in
/// [OSError.errorCode].
const _noSpaceLeftOnDevice = 28;

/// `ERROR_HANDLE_DISK_FULL` and `ERROR_DISK_FULL`, Windows system error codes.
const _windowsDiskFull = {39, 112};

/// Whether [error] says the device has no space left to write a file, for
/// the model installer and the evidence queue alike. [windows] is the
/// platform whose error codes apply; it defaults to the current one.
bool isOutOfStorage(FileSystemException error, {bool? windows}) {
  final code = error.osError?.errorCode;
  return (windows ?? Platform.isWindows)
      ? _windowsDiskFull.contains(code)
      : code == _noSpaceLeftOnDevice;
}

/// The permanent file a validated, downloaded workflow definition is installed
/// to: `workflow-definitions/<base64url(versionId)>.json` under
/// [storageDirectory].
///
/// The downloader uses this path only as the base for its isolated temporary
/// attempt file (a `<path>.<nonce>.part`); the definition is promoted to this
/// exact path only after [WorkflowDefinitionValidator] accepts it, so a
/// rejected download never occupies it. Tests derive the installed path from
/// here rather than re-implementing the encoding.
File installedWorkflowDefinitionFile(
  Directory storageDirectory,
  String versionId,
) => File(
  '${storageDirectory.path}${Platform.pathSeparator}workflow-definitions'
  '${Platform.pathSeparator}${base64Url.encode(utf8.encode(versionId))}.json',
);
