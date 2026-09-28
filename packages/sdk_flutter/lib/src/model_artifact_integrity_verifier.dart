import 'dart:io';

import 'package:crypto/crypto.dart';

/// The outcome of [ModelArtifactIntegrityVerifier.verify].
enum ModelArtifactIntegrityStatus {
  /// The downloaded model matches its expected SHA-256 hash and was moved to
  /// the verified path.
  verified,

  /// The download was incomplete, missing, unreadable, or its hash did not
  /// match; the downloaded file was deleted.
  integrityFailed,
}

/// The result of checking a downloaded model file against its expected
/// SHA-256 hash.
///
/// Only [ModelArtifactIntegrityVerifier.verify] creates it, and
/// [ModelArtifactInstaller.install] accepts only a verified result.
class ModelArtifactIntegrityResult {
  const ModelArtifactIntegrityResult._({
    required this.modelVersionId,
    required this.status,
    required this.sha256,
  });

  /// The ID of the model version that was checked.
  final String modelVersionId;

  /// Whether the model file passed the check.
  final ModelArtifactIntegrityStatus status;

  /// The SHA-256 hash of the verified file, in lowercase hexadecimal, or
  /// `null` when the check failed.
  final String? sha256;

  /// The name of [status]: `verified` or `integrityFailed`.
  String get message => switch (status) {
    ModelArtifactIntegrityStatus.verified => 'verified',
    ModelArtifactIntegrityStatus.integrityFailed => 'integrityFailed',
  };

  /// Whether [status] is [ModelArtifactIntegrityStatus.verified].
  bool get isVerified => status == ModelArtifactIntegrityStatus.verified;
}

/// Checks downloaded model files against the SHA-256 hash the server
/// published.
///
/// [AyniSdk.sync] uses it internally; apps do not need to call it.
class ModelArtifactIntegrityVerifier {
  /// Checks [temporaryArtifact] against [expectedSha256] (hexadecimal, case
  /// insensitive) for model version [modelVersionId].
  ///
  /// When the download is complete ([isDownloadComplete]) and the hash
  /// matches, the file is moved to [verifiedArtifact], replacing any previous
  /// file there, and the result is [ModelArtifactIntegrityStatus.verified].
  /// Otherwise [temporaryArtifact] is deleted and the result is
  /// [ModelArtifactIntegrityStatus.integrityFailed]; file errors are reported
  /// the same way.
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
