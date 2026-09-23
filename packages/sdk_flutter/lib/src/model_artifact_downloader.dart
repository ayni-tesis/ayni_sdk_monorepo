import 'dart:io';
import 'dart:math';

class ModelDownloadManifest {
  const ModelDownloadManifest({
    required this.modelVersionId,
    required this.version,
    required this.sha256,
    required this.sizeBytes,
    required this.downloadUrl,
    required this.downloadUrlExpiresAt,
  });

  factory ModelDownloadManifest.fromJson(Map<String, dynamic> json) =>
      ModelDownloadManifest(
        modelVersionId: json['modelVersionId'] as String,
        version: json['version'] as String,
        sha256: json['sha256'] as String,
        sizeBytes: json['sizeBytes'] as int,
        downloadUrl: Uri.parse(json['downloadUrl'] as String),
        downloadUrlExpiresAt: DateTime.parse(
          json['downloadUrlExpiresAt'] as String,
        ),
      );

  final String modelVersionId;
  final String version;
  final String sha256;
  final int sizeBytes;
  final Uri downloadUrl;
  final DateTime downloadUrlExpiresAt;
}

enum ModelArtifactDownloadStatus { downloaded, pending, downloadFailed }

class ModelArtifactDownloadResult {
  const ModelArtifactDownloadResult({
    required this.modelVersionId,
    required this.status,
    required this.message,
    this.temporaryArtifact,
  });

  final String modelVersionId;
  final ModelArtifactDownloadStatus status;
  final String message;

  /// The attempt-owned artifact to pass to integrity verification after a
  /// successful download. It is absent when no complete artifact was created.
  final String? temporaryArtifact;
}

class ModelArtifactDownloader {
  Future<ModelArtifactDownloadResult> download({
    required ModelDownloadManifest manifest,
    required File temporaryArtifact,
    void Function(String message, int receivedBytes, int totalBytes)?
    onProgress,
    HttpClient? httpClient,
  }) async {
    const expiredMessage =
        'La descarga del modelo venció. Intenta sincronizar nuevamente.';
    const interruptedMessage =
        'La descarga se interrumpió. Se reintentará cuando haya conexión.';
    final id = manifest.modelVersionId;

    if (manifest.sizeBytes <= 0) {
      return ModelArtifactDownloadResult(
        modelVersionId: id,
        status: ModelArtifactDownloadStatus.downloadFailed,
        message: interruptedMessage,
      );
    }

    if (manifest.downloadUrl.scheme != 'https' ||
        !manifest.downloadUrlExpiresAt.isAfter(DateTime.now())) {
      return ModelArtifactDownloadResult(
        modelVersionId: id,
        status: ModelArtifactDownloadStatus.downloadFailed,
        message: expiredMessage,
      );
    }

    final client = httpClient ?? HttpClient();
    final ownsClient = httpClient == null;
    final attemptArtifact = File(
      '${temporaryArtifact.path}.${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 32)}.part',
    );
    IOSink? sink;
    var ownsAttemptArtifact = false;
    var receivedBytes = 0;
    Future<void> cleanup() async {
      try {
        await sink?.close();
        sink = null;
      } catch (_) {}
      if (ownsAttemptArtifact) {
        try {
          await attemptArtifact.delete();
        } on IOException {
          // Preserve the original download or callback failure.
        }
      }
    }

    try {
      await attemptArtifact.parent.create(recursive: true);
      final request = await client.getUrl(manifest.downloadUrl);
      request.followRedirects = false;
      final response = await request.close();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.drain<void>();
        return ModelArtifactDownloadResult(
          modelVersionId: id,
          status: ModelArtifactDownloadStatus.downloadFailed,
          message:
              response.statusCode == HttpStatus.forbidden ||
                  response.statusCode == HttpStatus.notFound
              ? expiredMessage
              : interruptedMessage,
        );
      }

      await attemptArtifact.create(exclusive: true);
      ownsAttemptArtifact = true;
      sink = attemptArtifact.openWrite();
      await for (final chunk in response) {
        if (receivedBytes + chunk.length > manifest.sizeBytes) {
          await cleanup();
          return ModelArtifactDownloadResult(
            modelVersionId: id,
            status: ModelArtifactDownloadStatus.downloadFailed,
            message: interruptedMessage,
          );
        }
        sink!.add(chunk);
        receivedBytes += chunk.length;
        onProgress?.call(
          'Descargando modelo ${manifest.version}…',
          receivedBytes,
          manifest.sizeBytes,
        );
      }
      await sink!.flush();
      await sink!.close();
      sink = null;

      if (receivedBytes != manifest.sizeBytes) {
        await cleanup();
        return ModelArtifactDownloadResult(
          modelVersionId: id,
          status: ModelArtifactDownloadStatus.downloadFailed,
          message: interruptedMessage,
        );
      }

      return ModelArtifactDownloadResult(
        modelVersionId: id,
        status: ModelArtifactDownloadStatus.downloaded,
        message:
            'Modelo ${manifest.version} descargado. Verificando integridad…',
        temporaryArtifact: attemptArtifact.path,
      );
    } on IOException {
      await cleanup();
      final urlExpired = !manifest.downloadUrlExpiresAt.isAfter(DateTime.now());
      return ModelArtifactDownloadResult(
        modelVersionId: id,
        status: urlExpired
            ? ModelArtifactDownloadStatus.downloadFailed
            : ModelArtifactDownloadStatus.pending,
        message: urlExpired ? expiredMessage : interruptedMessage,
      );
    } catch (error, stackTrace) {
      await cleanup();
      Error.throwWithStackTrace(error, stackTrace);
    } finally {
      if (ownsClient) client.close(force: true);
    }
  }
}
