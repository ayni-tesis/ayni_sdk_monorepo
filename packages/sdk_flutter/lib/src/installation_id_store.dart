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
    final file = File(
      '${storageDirectory.path}${Platform.pathSeparator}installation-id',
    );
    if (file.existsSync()) {
      final existingId = file.readAsStringSync();
      if (isUuidV4(existingId)) return existingId;
    }

    final installationId = createUuidV4();
    file.writeAsStringSync(installationId, flush: true);
    return installationId;
  }
}
