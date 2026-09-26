import 'dart:io';
import 'dart:math';

enum WorkflowVersionDownloadStatus { downloaded, workflowUnavailable }

class WorkflowVersionDownloadResult {
  const WorkflowVersionDownloadResult({
    required this.workflowVersionId,
    required this.status,
    required this.message,
    this.temporaryDefinition,
  });

  final String workflowVersionId;
  final WorkflowVersionDownloadStatus status;
  final String message;

  /// The attempt-owned immutable definition. It is available only after a
  /// complete successful download and must be validated before installation.
  final String? temporaryDefinition;
}

/// Downloads a published workflow definition without changing local storage.
class WorkflowVersionDownloader {
  Future<WorkflowVersionDownloadResult> download({
    required Uri serverUrl,
    required String credential,
    required String workflowVersionId,
    required String workflowName,
    required File temporaryDefinition,
    bool allowInsecureLoopback = false,
    void Function(String message)? onProgress,
    HttpClient? httpClient,
  }) async {
    if (!_canSendCredentialTo(serverUrl, allowInsecureLoopback)) {
      throw ArgumentError.value(
        serverUrl,
        'serverUrl',
        'La credencial solo se puede enviar por HTTPS o HTTP loopback autorizado.',
      );
    }
    final client = httpClient ?? HttpClient();
    final ownsClient = httpClient == null;
    if (serverUrl.scheme == 'http') client.findProxy = (_) => 'DIRECT';
    final attemptDefinition = File(
      '${temporaryDefinition.path}.${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 32)}.part',
    );
    IOSink? sink;
    var ownsAttemptDefinition = false;

    Future<void> cleanup() async {
      try {
        await sink?.close();
        sink = null;
      } catch (_) {}
      if (ownsAttemptDefinition) {
        try {
          await attemptDefinition.delete();
        } on IOException {
          // Preserve the original error when cleanup cannot remove the attempt.
        }
      }
    }

    try {
      final request = await client.getUrl(
        serverUrl.resolve('/sdk/workflow-versions/$workflowVersionId'),
      );
      request.followRedirects = false;
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $credential',
      );
      final response = await request.close();
      if (response.statusCode == HttpStatus.notFound) {
        await response.drain<void>();
        return WorkflowVersionDownloadResult(
          workflowVersionId: workflowVersionId,
          status: WorkflowVersionDownloadStatus.workflowUnavailable,
          message:
              'El workflow ya no está disponible. Se mantuvo la versión anterior.',
        );
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.drain<void>();
        throw HttpException(
          'No se pudo descargar la versión del workflow.',
          uri: request.uri,
        );
      }

      await attemptDefinition.parent.create(recursive: true);
      await attemptDefinition.create(exclusive: true);
      ownsAttemptDefinition = true;
      sink = attemptDefinition.openWrite();
      onProgress?.call('Descargando workflow $workflowName…');
      await response.forEach(sink!.add);
      await sink!.flush();
      await sink!.close();
      sink = null;

      return WorkflowVersionDownloadResult(
        workflowVersionId: workflowVersionId,
        status: WorkflowVersionDownloadStatus.downloaded,
        message: 'Workflow $workflowName descargado.',
        temporaryDefinition: attemptDefinition.path,
      );
    } on IOException {
      await cleanup();
      rethrow;
    } catch (error, stackTrace) {
      await cleanup();
      Error.throwWithStackTrace(error, stackTrace);
    } finally {
      if (ownsClient) client.close(force: true);
    }
  }

  bool _canSendCredentialTo(Uri url, bool allowInsecureLoopback) =>
      url.scheme == 'https' ||
      (allowInsecureLoopback &&
          url.scheme == 'http' &&
          (url.host == 'localhost' ||
              InternetAddress.tryParse(url.host)?.isLoopback == true));
}
