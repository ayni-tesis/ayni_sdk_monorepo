import 'dart:io';
import 'dart:math';

/// The outcome of [WorkflowVersionDownloader.download].
enum WorkflowVersionDownloadStatus {
  /// The whole definition was saved to
  /// [WorkflowVersionDownloadResult.temporaryDefinition].
  downloaded,

  /// The server answered `404 Not Found`: the workflow version is no longer
  /// available.
  workflowUnavailable,
}

/// The result of downloading one workflow version's definition.
///
/// The SDK passes each result to the `onWorkflowDownload` callback of
/// [AyniConfig] during a sync.
class WorkflowVersionDownloadResult {
  /// Creates a download result for [workflowVersionId].
  ///
  /// [temporaryDefinition] is set only for
  /// [WorkflowVersionDownloadStatus.downloaded].
  const WorkflowVersionDownloadResult({
    required this.workflowVersionId,
    required this.status,
    required this.message,
    this.temporaryDefinition,
  });

  /// The ID of the workflow version that was requested.
  final String workflowVersionId;

  /// Whether the definition was downloaded or is no longer available.
  final WorkflowVersionDownloadStatus status;

  /// A Spanish message about the outcome: `Workflow <nombre> descargado.` or
  /// `El workflow ya no está disponible. Se mantuvo la versión anterior.`
  final String message;

  /// The attempt-owned immutable definition. It is available only after a
  /// complete successful download and must be validated before installation.
  final String? temporaryDefinition;
}

/// Downloads a published workflow definition without changing local storage.
///
/// [AyniSdk.sync] uses it internally; apps do not need to call it.
class WorkflowVersionDownloader {
  /// Downloads the definition of [workflowVersionId] from [serverUrl], using
  /// [credential].
  ///
  /// The definition is written to a new attempt file next to
  /// [temporaryDefinition] (a `<path>.<nonce>.part` file), whose path the
  /// result returns; the caller validates it before installing it.
  /// [onProgress] receives `Descargando workflow <workflowName>…` when the
  /// download starts. [httpClient] is reused when given, and closed after the
  /// download otherwise. [allowInsecureLoopback] defaults to `false`.
  ///
  /// Throws an [ArgumentError] when [serverUrl] is neither HTTPS nor an
  /// allowed loopback HTTP URL, and an [HttpException] when the server
  /// answers any non-2xx status other than `404`, which returns
  /// [WorkflowVersionDownloadStatus.workflowUnavailable] instead. Network and
  /// file errors are rethrown after the attempt file is deleted.
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
