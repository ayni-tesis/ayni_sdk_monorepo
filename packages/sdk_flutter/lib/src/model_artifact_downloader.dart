import 'dart:io';
import 'dart:math';

/// Where and how to download one model version, as the server describes it.
class ModelDownloadManifest {
  /// Creates a manifest for [modelVersionId].
  const ModelDownloadManifest({
    required this.modelVersionId,
    required this.version,
    required this.sha256,
    required this.sizeBytes,
    required this.downloadUrl,
    required this.downloadUrlExpiresAt,
  });

  /// Reads a manifest from the server's JSON fields.
  ///
  /// Throws when a field is missing or has the wrong type, or when a URL or
  /// date cannot be parsed.
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

  /// The ID of the model version to download.
  final String modelVersionId;

  /// The model's published version, such as `1.0.0`.
  final String version;

  /// The expected SHA-256 hash of the model file, in hexadecimal.
  final String sha256;

  /// The exact size of the model file, in bytes.
  final int sizeBytes;

  /// The signed URL the model file is downloaded from.
  final Uri downloadUrl;

  /// When [downloadUrl] stops working.
  final DateTime downloadUrlExpiresAt;
}

/// The outcome of [ModelArtifactDownloader.download].
enum ModelArtifactDownloadStatus {
  /// The whole file was saved to
  /// [ModelArtifactDownloadResult.temporaryArtifact].
  downloaded,

  /// The connection failed before the URL expired; a later sync retries.
  pending,

  /// The download cannot succeed with this manifest: the URL expired or is
  /// not allowed, the server refused it, or the file size did not match.
  downloadFailed,
}

/// The result of downloading one model file.
class ModelArtifactDownloadResult {
  /// Creates a download result for [modelVersionId].
  const ModelArtifactDownloadResult({
    required this.modelVersionId,
    required this.status,
    required this.message,
    this.temporaryArtifact,
  });

  /// The ID of the model version that was requested.
  final String modelVersionId;

  /// Whether the file was downloaded, can be retried, or failed.
  final ModelArtifactDownloadStatus status;

  /// A Spanish message about the outcome.
  final String message;

  /// The attempt-owned artifact to pass to integrity verification after a
  /// successful download. It is absent when no complete artifact was created.
  final String? temporaryArtifact;
}

/// Downloads model files described by a [ModelDownloadManifest].
class ModelArtifactDownloader {
  /// Downloads the file of [manifest] into a new attempt file next to
  /// [temporaryArtifact], whose path the result returns.
  ///
  /// [onProgress] receives the bytes received so far and the expected total.
  /// [httpClient] is reused when given, and closed after the download
  /// otherwise. Network failures return a result instead of throwing.
  Future<ModelArtifactDownloadResult> download({
    required ModelDownloadManifest manifest,
    required File temporaryArtifact,
    void Function(String message, int receivedBytes, int totalBytes)?
    onProgress,
    HttpClient? httpClient,
    bool allowInsecureLoopback = false,
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

    if ((!_canDownloadFrom(manifest.downloadUrl, allowInsecureLoopback)) ||
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

  bool _canDownloadFrom(Uri url, bool allowInsecureLoopback) =>
      url.scheme == 'https' ||
      (allowInsecureLoopback &&
          url.scheme == 'http' &&
          (url.host == 'localhost' ||
              InternetAddress.tryParse(url.host)?.isLoopback == true));
}
