import 'dart:io';

import 'package:crypto/crypto.dart';

enum ModelArtifactIntegrityStatus { verified, integrityFailed }

class ModelArtifactIntegrityResult {
  const ModelArtifactIntegrityResult._({
    required this.modelVersionId,
    required this.status,
    required this.sha256,
  });

  final String modelVersionId;
  final ModelArtifactIntegrityStatus status;
  final String? sha256;

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
      return ModelArtifactIntegrityResult._(
        modelVersionId: modelVersionId,
        status: ModelArtifactIntegrityStatus.verified,
        sha256: computedSha256,
      );
    } on FileSystemException {
      await _invalidate(temporaryArtifact);
      return _integrityFailed(modelVersionId);
    }
  }

  ModelArtifactIntegrityResult _integrityFailed(String modelVersionId) {
    return ModelArtifactIntegrityResult._(
      modelVersionId: modelVersionId,
      status: ModelArtifactIntegrityStatus.integrityFailed,
      sha256: null,
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
      if (await verifiedArtifact.exists()) {
        await backup.delete();
      } else {
        await backup.rename(verifiedArtifact.path);
      }
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
