import 'dart:io';

import 'uuid_v4.dart';

/// Reads or creates the UUID v4 associated with this local SDK installation.
class InstallationIdStore {
  /// Creates a store in the app-provided directory.
  InstallationIdStore(this.storageDirectory);

  /// Directory owned by the host app for persistent SDK data.
  final Directory storageDirectory;

  /// Returns the valid persisted ID, replacing absent or malformed data.
  String loadOrCreate() {
    storageDirectory.createSync(recursive: true);
    final file = _file;
    if (file.existsSync()) {
      final existingId = file.readAsStringSync();
      if (isUuidV4(existingId)) return existingId;
    }

    final installationId = createUuidV4();
    file.writeAsStringSync(installationId, flush: true);
    return installationId;
  }

  /// Persists and returns a fresh UUID v4 without exposing an incomplete file.
  String reset() {
    storageDirectory.createSync(recursive: true);
    final file = _file;
    final installationId = createUuidV4();
    final temporary = File(
      '${file.path}.${DateTime.now().microsecondsSinceEpoch}.tmp',
    );
    try {
      temporary.writeAsStringSync(installationId, flush: true);
      temporary.renameSync(file.path);
    } finally {
      if (temporary.existsSync()) temporary.deleteSync();
    }
    return installationId;
  }

  File get _file =>
      File('${storageDirectory.path}${Platform.pathSeparator}installation-id');
}
