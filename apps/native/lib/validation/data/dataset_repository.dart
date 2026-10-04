import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';


import 'dataset_bundle_loader.dart';
import 'dataset_manifest.dart';

enum DatasetTransportErrorCode {
  networkFailure,
  invalidResponse,
  unauthorized,
  signedUrlExpired,
  archiveTooLarge,
  incompleteDownload,
  offline,
}

class DatasetTransportException implements Exception {
  const DatasetTransportException(this.code);

  final DatasetTransportErrorCode code;

  @override
  String toString() => 'DatasetTransportException(${code.name})';
}

abstract interface class DatasetTransport {
  Future<DatasetManifest> fetchManifest(String datasetVersionId);

  Future<File> downloadArchive(
    DatasetManifest manifest, {
    required Directory temporaryDirectory,
    void Function(int receivedBytes, int totalBytes)? onProgress,
  });
}

class HttpDatasetTransport implements DatasetTransport {
  HttpDatasetTransport({
    required Uri serverUrl,
    required String credential,
    HttpClient? httpClient,
    this.allowInsecureLoopback = false,
  }) : _serverUrl = serverUrl,
       _credential = credential,
       _httpClient = httpClient ?? HttpClient() {
    _requireAllowedUrl(serverUrl, allowInsecureLoopback: allowInsecureLoopback);
    if (credential.trim().isEmpty) {
      throw const FormatException('SDK credential is required.');
    }
    if (serverUrl.userInfo.isNotEmpty ||
        serverUrl.query.isNotEmpty ||
        serverUrl.fragment.isNotEmpty) {
      throw const FormatException(
        'serverUrl must not contain user information, query, or fragment.',
      );
    }
    _httpClient.connectionTimeout = const Duration(seconds: 20);
  }

  final Uri _serverUrl;
  final String _credential;
  final HttpClient _httpClient;
  final bool allowInsecureLoopback;

  @override
  Future<DatasetManifest> fetchManifest(String datasetVersionId) async {
    if (!RegExp(r'^[A-Za-z0-9._-]+$').hasMatch(datasetVersionId) ||
        datasetVersionId == '.' ||
        datasetVersionId == '..') {
      throw const DatasetTransportException(
        DatasetTransportErrorCode.invalidResponse,
      );
    }
    final uri = _serverUrl.resolve(
      '/sdk/dataset-versions/${Uri.encodeComponent(datasetVersionId)}/manifest',
    );
    late final HttpClientRequest request;
    try {
      request = await _httpClient.getUrl(uri);
      request.followRedirects = false;
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $_credential',
      );
      request.headers.set(HttpHeaders.acceptHeader, ContentType.json.mimeType);
    } on Object {
      throw const DatasetTransportException(
        DatasetTransportErrorCode.networkFailure,
      );
    }
    late final HttpClientResponse response;
    try {
      response = await request.close().timeout(const Duration(seconds: 30));
    } on Object {
      throw const DatasetTransportException(
        DatasetTransportErrorCode.networkFailure,
      );
    }
    if (response.statusCode != HttpStatus.ok) {
      await response.drain<void>();
      final code = response.statusCode == HttpStatus.unauthorized
          ? DatasetTransportErrorCode.unauthorized
          : DatasetTransportErrorCode.invalidResponse;
      throw DatasetTransportException(code);
    }
    final body = await _readLimited(response, 1024 * 1024);
    try {
      final decoded = jsonDecode(utf8.decode(body));
      final manifest = DatasetManifest.fromJson(
        _object(decoded),
        allowInsecureLoopback: allowInsecureLoopback,
      );
      if (manifest.datasetVersionId != datasetVersionId) {
        throw const FormatException(
          'The server returned a different dataset version.',
        );
      }
      return manifest;
    } on DatasetTransportException {
      rethrow;
    } on Object {
      throw const DatasetTransportException(
        DatasetTransportErrorCode.invalidResponse,
      );
    }
  }

  @override
  Future<File> downloadArchive(
    DatasetManifest manifest, {
    required Directory temporaryDirectory,
    void Function(int receivedBytes, int totalBytes)? onProgress,
  }) async {
    _requireAllowedUrl(
      manifest.downloadUrl,
      allowInsecureLoopback: allowInsecureLoopback,
    );
    await temporaryDirectory.create(recursive: true);
    final token = List.generate(
      24,
      (_) => Random.secure().nextInt(16).toRadixString(16),
    ).join();
    final file = File(
      '${temporaryDirectory.path}${Platform.pathSeparator}.dataset-$token.part',
    );
    try {
      final request = await _httpClient.getUrl(manifest.downloadUrl);
      request.followRedirects = false;
      // The signed object URL is a separate request and never receives the SDK credential.
      final response = await request.close().timeout(
        const Duration(minutes: 2),
      );
      if (response.statusCode != HttpStatus.ok) {
        await response.drain<void>();
        final expired = const {401, 403, 410}.contains(response.statusCode);
        throw DatasetTransportException(
          expired
              ? DatasetTransportErrorCode.signedUrlExpired
              : DatasetTransportErrorCode.invalidResponse,
        );
      }
      if (response.contentLength > manifest.sizeBytes ||
          response.contentLength > DatasetManifest.maximumArchiveBytes) {
        await response.drain<void>();
        throw const DatasetTransportException(
          DatasetTransportErrorCode.archiveTooLarge,
        );
      }
      final output = file.openWrite();
      var received = 0;
      var complete = false;
      try {
        await for (final chunk in response) {
          received += chunk.length;
          if (received > manifest.sizeBytes ||
              received > DatasetManifest.maximumArchiveBytes) {
            throw const DatasetTransportException(
              DatasetTransportErrorCode.archiveTooLarge,
            );
          }
          output.add(chunk);
          onProgress?.call(received, manifest.sizeBytes);
        }
        await output.flush();
        complete = true;
      } finally {
        await output.close();
        if (!complete && await file.exists()) await file.delete();
      }
      if (received != manifest.sizeBytes) {
        await file.delete();
        throw const DatasetTransportException(
          DatasetTransportErrorCode.incompleteDownload,
        );
      }
      return file;
    } on DatasetTransportException {
      rethrow;
    } on Object {
      if (await file.exists()) await file.delete();
      throw const DatasetTransportException(
        DatasetTransportErrorCode.networkFailure,
      );
    }
  }

  void close({bool force = false}) => _httpClient.close(force: force);
}

class DatasetRepository {
  DatasetRepository({
    required DatasetTransport transport,
    required Directory datasetsDirectory,
    required String datasetVersionId,
    required String expectedArchiveSha256,
    required String expectedPartition,
    DatasetBundleLoader loader = const DatasetBundleLoader(),
    DateTime Function()? now,
  }) : _transport = transport,
       _datasetsDirectory = datasetsDirectory,
       _datasetVersionId = datasetVersionId,
       _expectedArchiveSha256 = expectedArchiveSha256,
       _expectedPartition = expectedPartition,
       _loader = loader,
       _now = now ?? DateTime.now {
    if (!RegExp(r'^[A-Za-z0-9._-]+$').hasMatch(datasetVersionId) ||
        datasetVersionId == '.' ||
        datasetVersionId == '..') {
      throw const FormatException(
        'datasetVersionId must be a safe identifier.',
      );
    }
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(expectedArchiveSha256) ||
        expectedArchiveSha256 == '0' * 64) {
      throw const FormatException(
        'A published dataset SHA-256 is required before download.',
      );
    }
    if (!RegExp(r'^[A-Za-z0-9._-]{1,64}$').hasMatch(expectedPartition)) {
      throw const FormatException('Dataset partition is malformed.');
    }
  }

  final DatasetTransport _transport;
  final Directory _datasetsDirectory;
  final String _datasetVersionId;
  final String _expectedArchiveSha256;
  final String _expectedPartition;
  final DatasetBundleLoader _loader;
  final DateTime Function() _now;

  Future<VerifiedDataset> prepare(
    String datasetVersionId, {
    void Function(int receivedBytes, int totalBytes)? onProgress,
    bool forceRefresh = false,
  }) async {
    if (datasetVersionId != _datasetVersionId) {
      throw const DatasetBundleException(
        DatasetBundleErrorCode.resourceMismatch,
        'La versión solicitada no coincide con el perfil activo.',
      );
    }
    if (!forceRefresh) {
      try {
        final cached = await _loader.loadVerified(
          datasetsDirectory: _datasetsDirectory,
          datasetVersionId: _datasetVersionId,
          expectedArchiveSha256: _expectedArchiveSha256,
          expectedPartition: _expectedPartition,
        );
        if (cached != null) return cached;
      } on DatasetBundleException {
        // A corrupt local copy is ignored and only replaced after a new copy verifies.
      }
    }
    await _datasetsDirectory.create(recursive: true);
    var manifest = await _transport.fetchManifest(_datasetVersionId);
    _checkManifest(manifest);
    if (manifest.isExpired(_now())) {
      manifest = await _transport.fetchManifest(_datasetVersionId);
      _checkManifest(manifest);
      if (manifest.isExpired(_now())) {
        throw const DatasetTransportException(
          DatasetTransportErrorCode.signedUrlExpired,
        );
      }
    }

    for (var attempt = 0; attempt < 2; attempt++) {
      File? archiveFile;
      try {
        archiveFile = await _transport.downloadArchive(
          manifest,
          temporaryDirectory: _datasetsDirectory,
          onProgress: onProgress,
        );
        if (await archiveFile.length() != manifest.sizeBytes) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.resourceMismatch,
            'El tamaño descargado no coincide con el manifiesto publicado.',
          );
        }
        return await _loader.install(
          archiveFile: archiveFile,
          datasetsDirectory: _datasetsDirectory,
          expectedDatasetVersionId: _datasetVersionId,
          expectedArchiveSha256: _expectedArchiveSha256,
          expectedDatasetId: manifest.datasetId,
          expectedVersion: manifest.version,
          expectedPartition: manifest.partition,
          expectedSource: manifest.source,
          expectedLicense: manifest.license,
        );
      } on DatasetTransportException catch (error) {
        if (error.code != DatasetTransportErrorCode.signedUrlExpired ||
            attempt > 0) {
          rethrow;
        }
        manifest = await _transport.fetchManifest(_datasetVersionId);
        _checkManifest(manifest);
        if (manifest.isExpired(_now())) {
          throw const DatasetTransportException(
            DatasetTransportErrorCode.signedUrlExpired,
          );
        }
      } finally {
        if (archiveFile != null && await archiveFile.exists()) {
          await archiveFile.delete();
        }
      }
    }
    throw const DatasetTransportException(
      DatasetTransportErrorCode.signedUrlExpired,
    );
  }

  void _checkManifest(DatasetManifest manifest) {
    if (manifest.datasetVersionId != _datasetVersionId ||
        manifest.sha256 != _expectedArchiveSha256 ||
        manifest.partition != _expectedPartition) {
      throw const DatasetBundleException(
        DatasetBundleErrorCode.resourceMismatch,
        'El manifiesto recibido no coincide con el perfil aprobado.',
      );
    }
  }
}

Future<List<int>> _readLimited(
  HttpClientResponse response,
  int maximumBytes,
) async {
  if (response.contentLength > maximumBytes) {
    await response.drain<void>();
    throw const DatasetTransportException(
      DatasetTransportErrorCode.invalidResponse,
    );
  }
  final builder = BytesBuilder(copy: false);
  await for (final chunk in response) {
    if (builder.length + chunk.length > maximumBytes) {
      throw const DatasetTransportException(
        DatasetTransportErrorCode.invalidResponse,
      );
    }
    builder.add(chunk);
  }
  return builder.takeBytes();
}

Map<String, Object?> _object(Object? value) {
  if (value is! Map) throw const FormatException('Response must be an object.');
  return value.map((key, item) => MapEntry(key.toString(), item));
}

void _requireAllowedUrl(Uri url, {required bool allowInsecureLoopback}) {
  final allowedLoopback =
      allowInsecureLoopback &&
      url.scheme == 'http' &&
      (url.host.toLowerCase() == 'localhost' ||
          (InternetAddress.tryParse(url.host)?.isLoopback ?? false));
  if ((!allowedLoopback && url.scheme != 'https') ||
      url.host.isEmpty ||
      url.userInfo.isNotEmpty) {
    throw const DatasetTransportException(
      DatasetTransportErrorCode.invalidResponse,
    );
  }
}
