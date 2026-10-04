import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;

import 'model_artifact_integrity_verifier.dart';
import 'sdk_internal.dart';

/// The state of a model installation by [ModelArtifactInstaller.install].
enum ModelArtifactInstallStatus {
  /// The installation started; reported through `onStateChanged` only.
  installing,

  /// The model version is installed and can run offline.
  availableOffline,

  /// The model version could not be installed; the message says why.
  notAvailable,
}

/// A state reported by [ModelArtifactInstaller.install].
class ModelArtifactInstallResult {
  /// Creates an installation state with its Spanish [message].
  const ModelArtifactInstallResult({
    required this.status,
    required this.message,
  });

  /// The installation state.
  final ModelArtifactInstallStatus status;

  /// A Spanish message about the state, such as `Modelo <versión> disponible
  /// offline.` or `No hay espacio suficiente para instalar el modelo.`
  final String message;
}

/// Installs integrity-verified model artifacts for offline workflow execution.
///
/// Each model version is stored as `<modelId>/<modelVersionId>.tflite` with a
/// `.json` metadata file under [storageDirectory]. [AyniSdk.sync] and
/// [AyniSdk.run] use it internally; apps do not need to call it.
class ModelArtifactInstaller {
  /// Creates an installer that stores models under [storageDirectory].
  ModelArtifactInstaller({required this.storageDirectory});

  static final Map<String, Future<void>> _installQueues = {};

  /// The directory that holds one subdirectory per model.
  final Directory storageDirectory;

  /// Installs [verifiedArtifact] when its verification result and hash match.
  ///
  /// A model version gets its own immutable path, so a failed installation of
  /// another version cannot replace an already available offline version.
  ///
  /// [integrity] must be a verified [ModelArtifactIntegrityResult] for the
  /// same file, and [modelId] and the model version ID may contain only
  /// letters, digits, `_`, and `-`. [onStateChanged] receives
  /// [ModelArtifactInstallStatus.installing] before the files are copied.
  /// The result is [ModelArtifactInstallStatus.availableOffline] when the
  /// version is installed, including when it already was, and
  /// [ModelArtifactInstallStatus.notAvailable] otherwise; file errors do not
  /// throw.
  Future<ModelArtifactInstallResult> install({
    required String modelId,
    required String version,
    required File verifiedArtifact,
    required ModelArtifactIntegrityResult integrity,
    void Function(ModelArtifactInstallResult result)? onStateChanged,
  }) async {
    final versionId = integrity.modelVersionId;
    if (!integrity.isVerified ||
        !_isSafeId(modelId) ||
        !_isSafeId(versionId) ||
        !await verifiedArtifact.exists()) {
      return _notAvailable(
        'El modelo no superó la verificación de integridad.',
      );
    }

    final expectedHash = integrity.sha256;
    if (expectedHash == null) {
      return _notAvailable(
        'El modelo no superó la verificación de integridad.',
      );
    }
    late final String artifactHash;
    try {
      artifactHash =
          (await crypto.sha256.bind(verifiedArtifact.openRead()).first)
              .toString();
    } on FileSystemException {
      return _notAvailable(
        'El modelo no superó la verificación de integridad.',
      );
    }
    if (artifactHash != expectedHash) {
      return _notAvailable(
        'El modelo no superó la verificación de integridad.',
      );
    }

    final modelDirectory = Directory('${storageDirectory.path}/$modelId');
    final artifact = File('${modelDirectory.path}/$versionId.tflite');
    final metadata = File('${modelDirectory.path}/$versionId.json');
    await modelDirectory.create(recursive: true);
    final lockPath = '${modelDirectory.path}/$versionId.lock';
    final releaseQueue = await _acquireInstallQueue(lockPath);
    RandomAccessFile? lock;
    try {
      lock = await File(lockPath).open(mode: FileMode.append);
      await lock.lock(FileLock.exclusive);
      if (await artifact.exists() || await metadata.exists()) {
        final available = await _isVersionAvailable(
          modelId: modelId,
          modelVersionId: versionId,
        );
        if (available) {
          final existing = jsonDecode(await metadata.readAsString()) as Map;
          return existing['sha256'] == expectedHash
              ? _available(version)
              : _notAvailable('No disponible');
        }

        // Incomplete/corrupt pairs are not available offline. Remove them so
        // a verified download can repair the version; valid conflicting
        // versions are preserved by the branch above.
        if (await artifact.exists()) await artifact.delete();
        if (await metadata.exists()) await metadata.delete();
      }

      onStateChanged?.call(
        const ModelArtifactInstallResult(
          status: ModelArtifactInstallStatus.installing,
          message: 'Instalando',
        ),
      );
      final nonce =
          '${pid}_${DateTime.now().microsecondsSinceEpoch}_'
          '${identityHashCode(this)}';
      final artifactTemporary = File('${artifact.path}.$nonce.part');
      final metadataTemporary = File('${metadata.path}.$nonce.part');
      var createdArtifact = false;
      try {
        await verifiedArtifact.copy(artifactTemporary.path);
        final copiedHash =
            (await crypto.sha256.bind(artifactTemporary.openRead()).first)
                .toString();
        if (copiedHash != artifactHash) return _notAvailable('No disponible');

        await metadataTemporary.writeAsString(
          _metadata(modelId, versionId, copiedHash),
          flush: true,
        );
        await artifactTemporary.rename(artifact.path);
        createdArtifact = true;
        await metadataTemporary.rename(metadata.path);
        return _available(version);
      } on FileSystemException catch (error) {
        if (createdArtifact && await artifact.exists()) await artifact.delete();
        return _notAvailable(
          isOutOfStorage(error)
              ? 'No hay espacio suficiente para instalar el modelo.'
              : 'No disponible',
        );
      } finally {
        if (await artifactTemporary.exists()) await artifactTemporary.delete();
        if (await metadataTemporary.exists()) await metadataTemporary.delete();
      }
    } on FileSystemException {
      return _notAvailable('No disponible');
    } finally {
      // Closing the handle releases its exclusive file lock on every platform.
      await lock?.close();
      releaseQueue();
    }
  }

  ModelArtifactInstallResult _available(String version) =>
      ModelArtifactInstallResult(
        status: ModelArtifactInstallStatus.availableOffline,
        message: 'Modelo $version disponible offline.',
      );

  ModelArtifactInstallResult _notAvailable(String message) =>
      ModelArtifactInstallResult(
        status: ModelArtifactInstallStatus.notAvailable,
        message: message,
      );

  /// Returns whether the exact model version is present and hash-valid offline.
  ///
  /// It is `false` when either file is missing, the metadata does not name
  /// [modelId] and [modelVersionId], the file's hash differs from the stored
  /// one, or the storage cannot be read.
  Future<bool> isVersionAvailable({
    required String modelId,
    required String modelVersionId,
  }) async {
    try {
      return await _isVersionAvailable(
        modelId: modelId,
        modelVersionId: modelVersionId,
      );
    } on FileSystemException {
      return false;
    }
  }

  Future<bool> _isVersionAvailable({
    required String modelId,
    required String modelVersionId,
  }) async {
    if (!_isSafeId(modelId) || !_isSafeId(modelVersionId)) return false;
    final modelDirectory = Directory('${storageDirectory.path}/$modelId');
    final artifact = File('${modelDirectory.path}/$modelVersionId.tflite');
    final metadata = File('${modelDirectory.path}/$modelVersionId.json');
    if (!await artifact.exists() || !await metadata.exists()) return false;

    try {
      final decoded = jsonDecode(await metadata.readAsString());
      if (decoded is! Map<String, dynamic> ||
          decoded['modelId'] != modelId ||
          decoded['modelVersionId'] != modelVersionId ||
          decoded['sha256'] is! String) {
        return false;
      }
      final storedHash = decoded['sha256'] as String;
      final actualHash = (await crypto.sha256.bind(artifact.openRead()).first)
          .toString();
      return storedHash == actualHash;
    } on FormatException {
      return false;
    }
  }

  bool _isSafeId(String value) =>
      value.isNotEmpty && RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(value);

  String _metadata(String modelId, String versionId, String hash) => jsonEncode(
    {'modelId': modelId, 'modelVersionId': versionId, 'sha256': hash},
  );

  Future<void Function()> _acquireInstallQueue(String key) async {
    final previous = _installQueues[key] ?? Future<void>.value();
    final turn = Completer<void>();
    _installQueues[key] = turn.future;
    await previous;
    return () {
      if (identical(_installQueues[key], turn.future)) {
        _installQueues.remove(key);
      }
      turn.complete();
    };
  }
}
