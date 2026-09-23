import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;

import 'model_artifact_integrity_verifier.dart';

/// Installs integrity-verified model artifacts for offline workflow execution.
enum ModelArtifactInstallStatus { installing, availableOffline, notAvailable }

class ModelArtifactInstallResult {
  const ModelArtifactInstallResult({
    required this.status,
    required this.message,
  });

  final ModelArtifactInstallStatus status;
  final String message;
}

class ModelArtifactInstaller {
  ModelArtifactInstaller({required this.storageDirectory});

  static final Map<String, Future<void>> _installQueues = {};

  final Directory storageDirectory;

  /// Installs [verifiedArtifact] when its verification result and hash match.
  ///
  /// A model version gets its own immutable path, so a failed installation of
  /// another version cannot replace an already available offline version.
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
        final available = await isVersionAvailable(
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
          _isNoSpace(error)
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

  bool _isNoSpace(FileSystemException error) {
    final code = error.osError?.errorCode;
    return code == 28 || code == 112;
  }

  /// Returns whether the exact model version is present and hash-valid offline.
  Future<bool> isVersionAvailable({
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
    } on (FormatException, FileSystemException) {
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
