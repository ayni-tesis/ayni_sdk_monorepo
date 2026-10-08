import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

// ponytail: Mirrors `SDK_TRACE_ARTIFACT_MAX_BYTES` in
// `packages/api/src/sdk-trace-artifact.ts`. Replace if this CLI goes external
// or a shared generated contract is introduced.
const _maxArtifactBytes = 5363340410;
const _sdkCredentialPattern = r'^ayni_sk_[A-Za-z0-9_-]+$';

Future<void> main(List<String> arguments) async {
  final options = _parseArguments(arguments);
  final credential = Platform.environment['AYNI_SDK_CREDENTIAL'];
  if (credential == null ||
      !RegExp(_sdkCredentialPattern).hasMatch(credential)) {
    stderr.writeln(
      'Define AYNI_SDK_CREDENTIAL en el entorno del proceso con una credencial SDK activa.',
    );
    exitCode = 64;
    return;
  }

  final serverUrl = _serverUri(options['server-url']!);
  final traceId = options['trace-id']!;
  if (!RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    caseSensitive: false,
  ).hasMatch(traceId)) {
    throw const FormatException('trace-id debe ser un UUID.');
  }

  final file = File(options['file']!);
  final size = await file.length();
  if (size <= 0 || size > _maxArtifactBytes) {
    throw const FormatException(
      'El archivo debe tener entre 1 byte y 4.995 GiB.',
    );
  }
  final digest = await sha256.bind(file.openRead()).first;
  final uploadRequest = <String, Object>{
    'logicalName': options['logical-name']!,
    'byteLength': size,
    'sha256': digest.toString(),
    if (options['producer-tool'] != null)
      'producerTool': options['producer-tool']!,
    if (options['producer-version'] != null)
      'producerVersion': options['producer-version']!,
  };

  final client = HttpClient()..connectionTimeout = const Duration(seconds: 30);
  try {
    final intentUri = _appendPath(serverUrl, 'sdk/traces/$traceId/artifacts');
    final intent = await _postJson(
      client,
      intentUri,
      credential,
      uploadRequest,
    );
    final artifactId = intent['artifactId'] as String?;
    final uploadUrl = intent['uploadUrl'] as String?;
    final requiredHeaders = intent['requiredHeaders'];
    if (artifactId == null || uploadUrl == null || requiredHeaders is! Map) {
      throw const FormatException(
        'El servidor devolvió una autorización de carga inválida.',
      );
    }
    final uploadUri = _signedUploadUri(uploadUrl);
    final contentType = requiredHeaders['Content-Type'];
    final contentLength = requiredHeaders['Content-Length'];
    if (contentType != 'application/octet-stream' || contentLength != '$size') {
      throw const FormatException(
        'Los encabezados de carga no coinciden con el archivo.',
      );
    }

    try {
      final putRequest = await client.putUrl(uploadUri);
      putRequest.followRedirects = false;
      putRequest.contentLength = size;
      putRequest.headers.set(
        HttpHeaders.contentTypeHeader,
        contentType as String,
      );
      await putRequest.addStream(file.openRead());
      final putResponse = await putRequest.close();
      if (putResponse.statusCode >= 300 && putResponse.statusCode < 400) {
        _rejectRedirect(
          uploadUri,
          putResponse.headers.value(HttpHeaders.locationHeader),
        );
      }
      await putResponse.drain<void>();
      if (putResponse.statusCode < 200 || putResponse.statusCode >= 300) {
        throw _UploadFailure(
          'El almacenamiento rechazó la carga (HTTP ${putResponse.statusCode}).',
        );
      }
    } on _UploadFailure {
      rethrow;
    } catch (_) {
      // HttpClient exceptions can contain the full presigned URL. Never surface them.
      throw const _UploadFailure(
        'No se pudo completar la carga en el almacenamiento.',
      );
    }

    final completionUri = _appendPath(
      serverUrl,
      'sdk/traces/$traceId/artifacts/$artifactId/complete',
    );
    await _postJson(
      client,
      completionUri,
      credential,
      const <String, Object>{},
    );
    stdout.writeln('Artefacto $artifactId confirmado para la traza $traceId.');
  } finally {
    client.close(force: true);
  }
}

Map<String, String> _parseArguments(List<String> arguments) {
  const valueOptions = {
    'server-url',
    'trace-id',
    'file',
    'logical-name',
    'producer-tool',
    'producer-version',
  };
  final values = <String, String>{};
  for (var index = 0; index < arguments.length; index += 1) {
    final argument = arguments[index];
    if (!argument.startsWith('--')) {
      throw const FormatException('Usa opciones --nombre valor.');
    }
    final name = argument.substring(2);
    if (!valueOptions.contains(name) ||
        values.containsKey(name) ||
        index + 1 >= arguments.length) {
      throw FormatException('Opción inválida: --$name.');
    }
    values[name] = arguments[++index];
  }
  for (final required in ['server-url', 'trace-id', 'file', 'logical-name']) {
    if (values[required] == null || values[required]!.trim().isEmpty) {
      throw FormatException('Falta --$required.');
    }
  }
  if (values['logical-name']!.length > 160 ||
      RegExp(r'[\x00-\x1f\x7f]').hasMatch(values['logical-name']!)) {
    throw const FormatException('logical-name no es válido.');
  }
  return values;
}

Uri _serverUri(String value) {
  final uri = Uri.parse(value);
  final loopback = const {'localhost', '127.0.0.1', '::1'}.contains(uri.host);
  if (!uri.hasAuthority ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      !(uri.scheme == 'https' || (uri.scheme == 'http' && loopback))) {
    throw const FormatException(
      'server-url debe usar HTTPS (o HTTP local para desarrollo).',
    );
  }
  return uri.replace(path: uri.path.replaceFirst(RegExp(r'/+$'), ''));
}

Uri _appendPath(Uri base, String path) =>
    base.replace(path: '${base.path}/$path');

Uri _signedUploadUri(String value) {
  final uri = Uri.parse(value);
  if (uri.scheme != 'https' ||
      !uri.hasAuthority ||
      uri.userInfo.isNotEmpty ||
      uri.hasFragment) {
    throw const FormatException(
      'La URL firmada no es una dirección HTTPS válida.',
    );
  }
  return uri;
}

Future<Map<String, dynamic>> _postJson(
  HttpClient client,
  Uri uri,
  String credential,
  Map<String, Object> body,
) async {
  final request = await client.postUrl(uri);
  request.followRedirects = false;
  request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $credential');
  request.headers.contentType = ContentType.json;
  request.add(utf8.encode(jsonEncode(body)));
  final response = await request.close();
  if (response.statusCode >= 300 && response.statusCode < 400) {
    await response.drain<void>();
    throw HttpException(
      'El servidor de Ayni redirigió la solicitud; no se siguió.',
    );
  }
  final responseText = await utf8.decoder.bind(response).join();
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw HttpException(
      'El servidor de Ayni rechazó la solicitud (HTTP ${response.statusCode}).',
    );
  }
  final decoded = jsonDecode(responseText);
  if (decoded is! Map<String, dynamic>) {
    throw const FormatException('El servidor devolvió una respuesta inválida.');
  }
  return decoded;
}

Never _rejectRedirect(Uri source, String? location) {
  if (location != null) {
    try {
      final target = source.resolve(location);
      if (target.origin != source.origin) {
        throw const _UploadFailure(
          'La carga fue redirigida a otro origen y se detuvo.',
        );
      }
    } on FormatException {
      throw const _UploadFailure(
        'La carga fue redirigida a otro origen y se detuvo.',
      );
    }
  }
  throw const _UploadFailure(
    'El almacenamiento redirigió la carga y se detuvo.',
  );
}

class _UploadFailure implements Exception {
  const _UploadFailure(this.message);

  final String message;

  @override
  String toString() => message;
}
