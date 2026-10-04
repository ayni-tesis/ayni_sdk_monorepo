import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import '../execution/validation_condition_runner.dart';

abstract interface class WorkflowDefinitionRepository {
  Future<Map<String, Object?>> fetch(String workflowVersionId);
}

class HttpWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  HttpWorkflowDefinitionRepository({
    required Uri serverUrl,
    required String credential,
    HttpClient? httpClient,
    this.allowInsecureLoopback = false,
  }) : _serverUrl = serverUrl,
       _credential = credential,
       _httpClient = httpClient ?? HttpClient() {
    _requireAllowedUrl(serverUrl, allowInsecureLoopback: allowInsecureLoopback);
    if (serverUrl.userInfo.isNotEmpty ||
        serverUrl.query.isNotEmpty ||
        serverUrl.fragment.isNotEmpty ||
        credential.trim().isEmpty) {
      throw const FormatException('SDK server configuration is invalid.');
    }
    _httpClient.connectionTimeout = const Duration(seconds: 20);
  }

  final Uri _serverUrl;
  final String _credential;
  final HttpClient _httpClient;
  final bool allowInsecureLoopback;

  @override
  Future<Map<String, Object?>> fetch(String workflowVersionId) async {
    if (!_safeIdentifier(workflowVersionId)) {
      throw const ValidationExecutionException(
        'invalidWorkflowVersionId',
        'La versión del workflow configurada no es válida.',
      );
    }
    final uri = _serverUrl.resolve(
      '/sdk/workflow-versions/${Uri.encodeComponent(workflowVersionId)}',
    );
    try {
      final request = await _httpClient.getUrl(uri);
      request.followRedirects = false;
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_credential',
      );
      request.headers.set(HttpHeaders.acceptHeader, ContentType.json.mimeType);
      final response = await request.close().timeout(
        const Duration(seconds: 30),
      );
      if (response.statusCode != HttpStatus.ok) {
        await response.drain<void>();
        throw const ValidationExecutionException(
          'workflowVersionUnavailable',
          'No se pudo obtener la versión publicada del workflow.',
        );
      }
      final body = await _readLimited(response, 2 * 1024 * 1024);
      final decoded = jsonDecode(utf8.decode(body));
      if (decoded is! Map) {
        throw const FormatException('Workflow must be an object.');
      }
      return decoded.map((key, value) => MapEntry(key.toString(), value));
    } on ValidationExecutionException {
      rethrow;
    } on Object {
      throw const ValidationExecutionException(
        'workflowVersionUnavailable',
        'No se pudo obtener la versión publicada del workflow.',
      );
    }
  }

  void close({bool force = false}) => _httpClient.close(force: force);
}

Future<List<int>> _readLimited(HttpClientResponse response, int maximum) async {
  final bytes = BytesBuilder(copy: false);
  var received = 0;
  await for (final chunk in response) {
    received += chunk.length;
    if (received > maximum) {
      throw const FormatException('Response is too large.');
    }
    bytes.add(chunk);
  }
  return bytes.takeBytes();
}

bool _safeIdentifier(String value) =>
    RegExp(r'^[A-Za-z0-9._-]+$').hasMatch(value) &&
    value != '.' &&
    value != '..';

void _requireAllowedUrl(Uri url, {required bool allowInsecureLoopback}) {
  final secure = url.scheme == 'https';
  final loopback =
      allowInsecureLoopback &&
      url.scheme == 'http' &&
      (url.host.toLowerCase() == 'localhost' ||
          (InternetAddress.tryParse(url.host)?.isLoopback ?? false));
  if (!secure && !loopback) {
    throw const FormatException('serverUrl must use HTTPS.');
  }
}
