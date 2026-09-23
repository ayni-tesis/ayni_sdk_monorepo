import 'dart:io';

enum ModelArtifactDownloadStatus { downloaded, pending, downloadFailed }

class ModelArtifactDownloadResult {
  const ModelArtifactDownloadResult({
    required this.modelVersionId,
    required this.status,
    required this.message,
  });

  final String modelVersionId;
  final ModelArtifactDownloadStatus status;
  final String message;
}

class ModelArtifactDownloader {
  Future<ModelArtifactDownloadResult> download({
    required String modelVersionId,
    required String version,
    required Uri downloadUrl,
    required DateTime downloadUrlExpiresAt,
    required int expectedSizeBytes,
    required File temporaryArtifact,
    void Function(int receivedBytes, int totalBytes)? onProgress,
    HttpClient? httpClient,
  }) async {
    const expiredMessage =
        'La descarga del modelo venció. Intenta sincronizar nuevamente.';
    const interruptedMessage =
        'La descarga se interrumpió. Se reintentará cuando haya conexión.';

    if (expectedSizeBytes <= 0) {
      return ModelArtifactDownloadResult(
        modelVersionId: modelVersionId,
        status: ModelArtifactDownloadStatus.downloadFailed,
        message: interruptedMessage,
      );
    }

    if (downloadUrl.scheme != 'https' ||
        !downloadUrlExpiresAt.isAfter(DateTime.now())) {
      return ModelArtifactDownloadResult(
        modelVersionId: modelVersionId,
        status: ModelArtifactDownloadStatus.downloadFailed,
        message: expiredMessage,
      );
    }

    final client = httpClient ?? HttpClient();
    final ownsClient = httpClient == null;
    IOSink? sink;
    var receivedBytes = 0;
    try {
      await temporaryArtifact.parent.create(recursive: true);
      if (await temporaryArtifact.exists()) {
        await temporaryArtifact.delete();
      }
      final request = await client.getUrl(downloadUrl);
      request.followRedirects = false;
      final response = await request.close();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.drain<void>();
        return ModelArtifactDownloadResult(
          modelVersionId: modelVersionId,
          status: ModelArtifactDownloadStatus.downloadFailed,
          message: response.statusCode == HttpStatus.forbidden ||
                  response.statusCode == HttpStatus.notFound
              ? expiredMessage
              : interruptedMessage,
        );
      }

      sink = temporaryArtifact.openWrite();
      await for (final chunk in response) {
        if (receivedBytes + chunk.length > expectedSizeBytes) {
          await sink.close();
          sink = null;
          await temporaryArtifact.delete();
          return ModelArtifactDownloadResult(
            modelVersionId: modelVersionId,
            status: ModelArtifactDownloadStatus.downloadFailed,
            message: interruptedMessage,
          );
        }
        sink.add(chunk);
        receivedBytes += chunk.length;
        onProgress?.call(receivedBytes, expectedSizeBytes);
      }
      await sink.flush();
      await sink.close();
      sink = null;

      if (receivedBytes != expectedSizeBytes) {
        await temporaryArtifact.delete();
        return ModelArtifactDownloadResult(
          modelVersionId: modelVersionId,
          status: ModelArtifactDownloadStatus.downloadFailed,
          message: interruptedMessage,
        );
      }

      return ModelArtifactDownloadResult(
        modelVersionId: modelVersionId,
        status: ModelArtifactDownloadStatus.downloaded,
        message: 'Modelo $version descargado. Verificando integridad…',
      );
    } on IOException {
      await sink?.close();
      if (await temporaryArtifact.exists()) {
        await temporaryArtifact.delete();
      }
      return ModelArtifactDownloadResult(
        modelVersionId: modelVersionId,
        status: ModelArtifactDownloadStatus.pending,
        message: interruptedMessage,
      );
    } finally {
      if (ownsClient) client.close(force: true);
    }
  }
}
