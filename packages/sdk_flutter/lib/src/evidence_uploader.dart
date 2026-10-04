// ignore_for_file: public_member_api_docs

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import 'evidence_store.dart';

final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

/// Uploads one pending evidence to the Ayni server (US-070), in three
/// requests:
///
/// 1. `POST /sdk/evidence` with the credential and the data of
///    `evidence.json`, plus the size and SHA-256 of its `image`. The server
///    checks that the evidence is of the credential's application and answers
///    a signed URL for the image, or that it already received it.
/// 2. `PUT` of the image to that URL, in the object storage, without the
///    credential.
/// 3. `POST /sdk/evidence/<evidenceId>/complete` with the credential, which
///    the server confirms once it checked the image.
///
/// Only that confirmation, or the server saying it already received the
/// evidence, is [EvidenceUploadOutcome.received]. It never follows a
/// redirect, so the credential only reaches [serverUrl].
class EvidenceUploadClient {
  EvidenceUploadClient({
    required HttpClient client,
    required this.serverUrl,
    required String credential,
    required bool Function(Uri url) canUploadTo,
    required Duration Function() requestTimeout,
    required Duration Function() uploadTimeout,
    required bool Function() cancelled,
  }) : _client = client,
       _credential = credential,
       _canUploadTo = canUploadTo,
       _requestTimeout = requestTimeout,
       _uploadTimeout = uploadTimeout,
       _cancelled = cancelled;

  final HttpClient _client;
  final String _credential;

  /// The Ayni server, which receives the credential.
  final Uri serverUrl;

  /// Whether the SDK may send the image to the signed URL the server gave.
  final bool Function(Uri url) _canUploadTo;

  /// How long each request to [serverUrl] may still wait.
  final Duration Function() _requestTimeout;

  /// How long the upload of the image may still wait.
  final Duration Function() _uploadTimeout;

  /// Whether the SDK must stop, for example because the app cleared the
  /// pending evidence or the sync ran out of time.
  final bool Function() _cancelled;

  static const _failed = (
    outcome: EvidenceUploadOutcome.failed,
    receivedAt: null,
  );
  static const _rejected = (
    outcome: EvidenceUploadOutcome.rejected,
    receivedAt: null,
  );

  Future<EvidenceUploadResult> upload(Directory evidence) async {
    try {
      final read = await _read(evidence);
      if (read == null) return _rejected;
      return await _upload(read.evidenceId, read.image, read.body);
    } on TimeoutException {
      return _failed;
    } on IOException {
      return _failed;
    } on FormatException {
      return _failed;
    }
  }

  /// The ID, image and upload body of [evidence], or `null` when its files
  /// do not describe a valid evidence of this SDK.
  Future<({String evidenceId, Uint8List image, Map<String, Object?> body})?>
  _read(Directory evidence) async {
    final evidenceId = evidence.uri.pathSegments.lastWhere((s) => s != '');
    Object? record;
    try {
      record = jsonDecode(
        await File(
          '${evidence.path}${Platform.pathSeparator}evidence.json',
        ).readAsString(),
      );
    } on FormatException {
      return null;
    }
    if (record is! Map ||
        record['evidenceId'] != evidenceId ||
        !_uuid.hasMatch(evidenceId) ||
        record['image'] is! Map) {
      return null;
    }
    final image = await File(
      '${evidence.path}${Platform.pathSeparator}image',
    ).readAsBytes();
    return (
      evidenceId: evidenceId,
      image: image,
      body: <String, Object?>{
        ...record.cast<String, Object?>(),
        'image': <String, Object?>{
          ...(record['image'] as Map).cast<String, Object?>(),
          'byteSize': image.length,
          'sha256': sha256.convert(image).toString(),
        },
      },
    );
  }

  Future<EvidenceUploadResult> _upload(
    String evidenceId,
    Uint8List image,
    Map<String, Object?> body,
  ) async {
    if (_stopped(_requestTimeout)) return _failed;
    final start = await _client.postUrl(serverUrl.resolve('/sdk/evidence'));
    start.followRedirects = false;
    start.headers
      ..set(HttpHeaders.authorizationHeader, 'Bearer $_credential')
      ..contentType = ContentType.json;
    start.write(jsonEncode(body));
    final started = await _answer(
      start,
      await start.close().timeout(
        _requestTimeout(),
        onTimeout: () {
          start.abort();
          throw TimeoutException('Evidence request timed out');
        },
      ),
    );
    if (started.statusCode != HttpStatus.ok) return _rejection(started);
    final answer = started.body;
    if (answer is! Map || answer['evidenceId'] != evidenceId) return _failed;
    if (answer['status'] == 'received') return _received(answer);
    final uploadUrl = answer['status'] == 'uploadRequired'
        ? Uri.tryParse('${answer['uploadUrl']}')
        : null;
    if (uploadUrl == null || !_canUploadTo(uploadUrl)) return _failed;

    if (_stopped(_uploadTimeout)) return _failed;
    final upload = await _client.putUrl(uploadUrl);
    upload.followRedirects = false;
    upload.headers.contentType = ContentType('image', 'jpeg');
    upload.contentLength = image.length;
    upload.add(image);
    final uploaded = await upload.close().timeout(
      _uploadTimeout(),
      onTimeout: () {
        upload.abort();
        throw TimeoutException('Evidence image upload timed out');
      },
    );
    await uploaded.drain<void>().timeout(
      _uploadTimeout(),
      onTimeout: () {
        upload.abort();
        throw TimeoutException('Evidence image upload timed out');
      },
    );
    if (uploaded.statusCode < 200 || uploaded.statusCode >= 300) {
      return _failed;
    }

    if (_stopped(_requestTimeout)) return _failed;
    final complete = await _client.postUrl(
      serverUrl.resolve('/sdk/evidence/$evidenceId/complete'),
    );
    complete.followRedirects = false;
    complete.headers.set(
      HttpHeaders.authorizationHeader,
      'Bearer $_credential',
    );
    final completed = await _answer(
      complete,
      await complete.close().timeout(
        _requestTimeout(),
        onTimeout: () {
          complete.abort();
          throw TimeoutException('Evidence request timed out');
        },
      ),
    );
    if (completed.statusCode != HttpStatus.ok) return _rejection(completed);
    final receipt = completed.body;
    return receipt is Map &&
            receipt['evidenceId'] == evidenceId &&
            receipt['status'] == 'received'
        ? _received(receipt)
        : _failed;
  }

  bool _stopped(Duration Function() timeout) =>
      _cancelled() || timeout() <= Duration.zero;

  /// The status of [response] and its JSON body, or `null` for a body that is
  /// not JSON.
  Future<({int statusCode, Object? body})> _answer(
    HttpClientRequest request,
    HttpClientResponse response,
  ) async {
    final text = await utf8.decoder
        .bind(response)
        .join()
        .timeout(
          _requestTimeout(),
          onTimeout: () {
            request.abort();
            throw TimeoutException('Evidence response timed out');
          },
        );
    Object? body;
    try {
      body = jsonDecode(text);
    } on FormatException {
      body = null;
    }
    return (statusCode: response.statusCode, body: body);
  }

  EvidenceUploadResult _received(Map answer) {
    final receivedAt = DateTime.tryParse('${answer['receivedAt']}');
    return receivedAt == null
        ? _failed
        : (outcome: EvidenceUploadOutcome.received, receivedAt: receivedAt);
  }

  /// What a server error means for the evidence: a revoked credential stops
  /// every upload, an error about this evidence lets the next one go, and
  /// anything else stops the queue until a later sync.
  EvidenceUploadResult _rejection(({int statusCode, Object? body}) answer) {
    if (answer.statusCode == HttpStatus.unauthorized) {
      final body = answer.body;
      return body is Map && body['code'] == 'credentialRevoked'
          ? (outcome: EvidenceUploadOutcome.credentialRevoked, receivedAt: null)
          : _failed;
    }
    return const [
          HttpStatus.badRequest,
          HttpStatus.notFound,
          HttpStatus.conflict,
          HttpStatus.requestEntityTooLarge,
        ].contains(answer.statusCode)
        ? _rejected
        : _failed;
  }
}
