import 'dart:io';

import 'package:crypto/crypto.dart';

enum ModelArtifactIntegrityStatus { verified, integrityFailed }

class ModelArtifactIntegrityResult {
  const ModelArtifactIntegrityResult({
    required this.modelVersionId,
    required this.status,
  });

  final String modelVersionId;
  final ModelArtifactIntegrityStatus status;

  String get message => switch (status) {
    ModelArtifactIntegrityStatus.verified => 'verified',
    ModelArtifactIntegrityStatus.integrityFailed => 'integrityFailed',
  };

  bool get isVerified => status == ModelArtifactIntegrityStatus.verified;
}

class ModelArtifactIntegrityVerifier {
  Future<ModelArtifactIntegrityResult> verify({
    required String modelVersionId,
    required File temporaryArtifact,
    required File verifiedArtifact,
    required String expectedSha256,
    required bool isDownloadComplete,
  }) async {
    if (!isDownloadComplete || !await temporaryArtifact.exists()) {
      await _invalidate(temporaryArtifact);
      return _integrityFailed(modelVersionId);
    }

    try {
      final computedSha256 =
          (await sha256.bind(temporaryArtifact.openRead()).first).toString();

      if (computedSha256 != expectedSha256.trim().toLowerCase()) {
        await _invalidate(temporaryArtifact);
        return _integrityFailed(modelVersionId);
      }

      await _promote(temporaryArtifact, verifiedArtifact);
      return ModelArtifactIntegrityResult(
        modelVersionId: modelVersionId,
        status: ModelArtifactIntegrityStatus.verified,
      );
    } on FileSystemException {
      await _invalidate(temporaryArtifact);
      return _integrityFailed(modelVersionId);
    }
  }

  ModelArtifactIntegrityResult _integrityFailed(String modelVersionId) {
    return ModelArtifactIntegrityResult(
      modelVersionId: modelVersionId,
      status: ModelArtifactIntegrityStatus.integrityFailed,
    );
  }

  Future<void> _invalidate(File temporaryArtifact) async {
    if (await temporaryArtifact.exists()) {
      await temporaryArtifact.delete();
    }
  }

  Future<void> _promote(File temporaryArtifact, File verifiedArtifact) async {
    await verifiedArtifact.parent.create(recursive: true);
    final backup = File('${verifiedArtifact.path}.backup');
    var priorArtifactMoved = false;

    if (await backup.exists()) {
      await backup.delete();
    }

    try {
      if (await verifiedArtifact.exists()) {
        await verifiedArtifact.rename(backup.path);
        priorArtifactMoved = true;
      }

      await temporaryArtifact.rename(verifiedArtifact.path);

      if (priorArtifactMoved && await backup.exists()) {
        await backup.delete();
      }
    } on FileSystemException {
      if (priorArtifactMoved && await backup.exists()) {
        if (await verifiedArtifact.exists()) {
          await verifiedArtifact.delete();
        }
        await backup.rename(verifiedArtifact.path);
      }
      rethrow;
    }
  }
}
