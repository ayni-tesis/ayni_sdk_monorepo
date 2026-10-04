import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import '../execution/validation_condition_runner.dart';
import '../models/experiment_plan.dart';

class VerifiedModelArtifact {
  VerifiedModelArtifact({
    required this.file,
    required this.modelVersionId,
    required this.sha256,
    required this.version,
    required Map<String, Object?> contract,
  }) : contract = _freezeMap(contract);

  final File file;
  final String modelVersionId;
  final String sha256;
  final String version;
  final Map<String, Object?> contract;
}

abstract interface class ValidationModelRepository {
  Future<VerifiedModelArtifact> prepare(ValidationResourceProfile profile);
}

class HttpValidationModelRepository implements ValidationModelRepository {
  HttpValidationModelRepository({
    required Uri serverUrl,
    required String credential,
    required Directory modelsDirectory,
    HttpClient? httpClient,
    this.allowInsecureLoopback = false,
    DateTime Function()? now,
  }) : _serverUrl = serverUrl,
       _credential = credential,
       _modelsDirectory = modelsDirectory,
       _httpClient = httpClient ?? HttpClient(),
       _now = now ?? DateTime.now {
    _requireAllowedUrl(serverUrl, allowInsecureLoopback: allowInsecureLoopback);
    if (serverUrl.userInfo.isNotEmpty ||
        serverUrl.query.isNotEmpty ||
        serverUrl.fragment.isNotEmpty ||
        credential.trim().isEmpty) {
      throw const FormatException('SDK server configuration is invalid.');
    }
    _httpClient.connectionTimeout = const Duration(seconds: 20);
  }

  static const maximumModelBytes = 512 * 1024 * 1024;

  final Uri _serverUrl;
  final String _credential;
  final Directory _modelsDirectory;
  final HttpClient _httpClient;
  final bool allowInsecureLoopback;
  final DateTime Function() _now;

  @override
  Future<VerifiedModelArtifact> prepare(
    ValidationResourceProfile profile,
  ) async {
    _validateProfile(profile);
    final manifest = await _fetchManifest(profile.controlModelVersionId);
    if (manifest.modelVersionId != profile.controlModelVersionId ||
        manifest.sha256 != profile.controlModelSha256 ||
        !modelContractMatchesValidationProfile(manifest.contract, profile)) {
      throw const ValidationExecutionException(
        'modelManifestMismatch',
        'El manifiesto del modelo no coincide con el perfil de validación.',
      );
    }
    final targetDirectory = Directory(
      '${_modelsDirectory.path}${Platform.pathSeparator}${manifest.modelVersionId}',
    );
    final targetFile = File(
      '${targetDirectory.path}${Platform.pathSeparator}model.tflite',
    );
    if (await targetFile.exists() &&
        await _sha256File(targetFile) == manifest.sha256) {
      return VerifiedModelArtifact(
        file: targetFile,
        modelVersionId: manifest.modelVersionId,
        sha256: manifest.sha256,
        version: manifest.version,
        contract: manifest.contract,
      );
    }

    await targetDirectory.create(recursive: true);
    final token = List.generate(
      20,
      (_) => Random.secure().nextInt(16).toRadixString(16),
    ).join();
    final stageFile = File('${targetFile.path}.$token.part');
    final backupFile = File('${targetFile.path}.$token.previous');
    try {
      await _downloadArtifact(manifest, stageFile);
      if (await _sha256File(stageFile) != manifest.sha256) {
        throw const ValidationExecutionException(
          'modelHashMismatch',
          'La integridad del modelo no pudo verificarse.',
        );
      }
      if (await targetFile.exists()) await targetFile.rename(backupFile.path);
      try {
        await stageFile.rename(targetFile.path);
        if (await backupFile.exists()) await backupFile.delete();
      } on Object {
        if (await backupFile.exists() && !await targetFile.exists()) {
          await backupFile.rename(targetFile.path);
        }
        rethrow;
      }
    } on ValidationExecutionException {
      if (await stageFile.exists()) await stageFile.delete();
      if (await backupFile.exists() && !await targetFile.exists()) {
        await backupFile.rename(targetFile.path);
      }
      rethrow;
    } on Object {
      if (await stageFile.exists()) await stageFile.delete();
      if (await backupFile.exists() && !await targetFile.exists()) {
        await backupFile.rename(targetFile.path);
      }
      throw const ValidationExecutionException(
        'modelDownloadFailed',
        'No se pudo descargar el modelo de validación.',
      );
    }
    return VerifiedModelArtifact(
      file: targetFile,
      modelVersionId: manifest.modelVersionId,
      sha256: manifest.sha256,
      version: manifest.version,
      contract: manifest.contract,
    );
  }

  Future<_ModelManifest> _fetchManifest(String modelVersionId) async {
    if (!_safeIdentifier(modelVersionId)) {
      throw const ValidationExecutionException(
        'invalidModelVersionId',
        'La versión del modelo configurada no es válida.',
      );
    }
    final uri = _serverUrl.resolve(
      '/sdk/model-versions/${Uri.encodeComponent(modelVersionId)}/manifest',
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
          'modelManifestUnavailable',
          'No se pudo obtener el manifiesto del modelo.',
        );
      }
      final bytes = await _readLimited(response, 1024 * 1024);
      final decoded = jsonDecode(utf8.decode(bytes));
      final root = _asObject(decoded, 'model response');
      _requireKeys(root, const {'manifest'}, 'model response');
      return _ModelManifest.fromJson(
        _asObject(root['manifest'], 'manifest'),
        allowInsecureLoopback: allowInsecureLoopback,
        now: _now(),
      );
    } on ValidationExecutionException {
      rethrow;
    } on Object {
      throw const ValidationExecutionException(
        'modelManifestUnavailable',
        'No se pudo obtener el manifiesto del modelo.',
      );
    }
  }

  Future<void> _downloadArtifact(
    _ModelManifest manifest,
    File destination,
  ) async {
    _requireAllowedUrl(
      manifest.downloadUrl,
      allowInsecureLoopback: allowInsecureLoopback,
    );
    try {
      final request = await _httpClient.getUrl(manifest.downloadUrl);
      request.followRedirects = false;
      // Presigned object requests never receive the SDK credential.
      final response = await request.close().timeout(
        const Duration(minutes: 2),
      );
      if (response.statusCode != HttpStatus.ok) {
        await response.drain<void>();
        throw const ValidationExecutionException(
          'modelDownloadFailed',
          'No se pudo descargar el modelo de validación.',
        );
      }
      if (response.contentLength > manifest.sizeBytes ||
          response.contentLength > maximumModelBytes) {
        await response.drain<void>();
        throw const ValidationExecutionException(
          'modelTooLarge',
          'El archivo del modelo supera el tamaño permitido.',
        );
      }
      final sink = destination.openWrite();
      var received = 0;
      var complete = false;
      try {
        await for (final chunk in response) {
          received += chunk.length;
          if (received > manifest.sizeBytes || received > maximumModelBytes) {
            throw const ValidationExecutionException(
              'modelTooLarge',
              'El archivo del modelo supera el tamaño permitido.',
            );
          }
          sink.add(chunk);
        }
        await sink.flush();
        complete = true;
      } finally {
        await sink.close();
        if (!complete && await destination.exists()) await destination.delete();
      }
      if (received != manifest.sizeBytes) {
        throw const ValidationExecutionException(
          'modelDownloadIncomplete',
          'La descarga del modelo quedó incompleta.',
        );
      }
    } on ValidationExecutionException {
      rethrow;
    } on Object {
      throw const ValidationExecutionException(
        'modelDownloadFailed',
        'No se pudo descargar el modelo de validación.',
      );
    }
  }

  void close({bool force = false}) => _httpClient.close(force: force);
}

class _ModelManifest {
  const _ModelManifest({
    required this.modelVersionId,
    required this.version,
    required this.sha256,
    required this.sizeBytes,
    required this.downloadUrl,
    required this.contract,
  });

  final String modelVersionId;
  final String version;
  final String sha256;
  final int sizeBytes;
  final Uri downloadUrl;
  final Map<String, Object?> contract;

  factory _ModelManifest.fromJson(
    Map<String, Object?> json, {
    required bool allowInsecureLoopback,
    required DateTime now,
  }) {
    _requireKeys(json, const {
      'modelVersionId',
      'version',
      'sha256',
      'sizeBytes',
      'downloadUrl',
      'downloadUrlExpiresAt',
      'contract',
    }, 'model manifest');
    final modelVersionId = _string(json['modelVersionId'], 'modelVersionId');
    if (!_safeIdentifier(modelVersionId)) {
      throw const FormatException('modelVersionId is malformed.');
    }
    final version = _string(json['version'], 'version');
    if (!_isSemver(version)) {
      throw const FormatException('version is malformed.');
    }
    final digest = _string(json['sha256'], 'sha256');
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(digest)) {
      throw const FormatException('sha256 is malformed.');
    }
    final sizeBytes = json['sizeBytes'];
    if (sizeBytes is! int ||
        sizeBytes <= 0 ||
        sizeBytes > HttpValidationModelRepository.maximumModelBytes) {
      throw const FormatException('sizeBytes is outside the supported limit.');
    }
    final url = Uri.tryParse(_string(json['downloadUrl'], 'downloadUrl'));
    if (url == null ||
        !url.isAbsolute ||
        url.host.isEmpty ||
        url.userInfo.isNotEmpty) {
      throw const FormatException('downloadUrl is malformed.');
    }
    _requireAllowedUrl(url, allowInsecureLoopback: allowInsecureLoopback);
    final expiryText = _string(
      json['downloadUrlExpiresAt'],
      'downloadUrlExpiresAt',
    );
    final expiry = DateTime.tryParse(expiryText);
    if (expiry == null || !expiry.isUtc || !expiry.isAfter(now.toUtc())) {
      throw const FormatException(
        'downloadUrlExpiresAt is expired or invalid.',
      );
    }
    return _ModelManifest(
      modelVersionId: modelVersionId,
      version: version,
      sha256: digest,
      sizeBytes: sizeBytes,
      downloadUrl: url,
      contract: _asObject(json['contract'], 'contract'),
    );
  }
}

Map<String, Object?> _freezeMap(Map<String, Object?> source) =>
    Map.unmodifiable({
      for (final entry in source.entries) entry.key: _freezeValue(entry.value),
    });

Object? _freezeValue(Object? value) {
  if (value is Map<String, Object?>) return _freezeMap(value);
  if (value is Map) {
    return _freezeMap(
      value.map((key, nested) => MapEntry(key.toString(), nested)),
    );
  }
  if (value is List) return List.unmodifiable(value.map(_freezeValue));
  return value;
}

void _validateProfile(ValidationResourceProfile profile) {
  if (!profile.isConfigured) {
    throw const ValidationExecutionException(
      'resourcesNotConfigured',
      'Configura las versiones publicadas del perfil antes de preparar.',
    );
  }
}

bool modelContractMatchesValidationProfile(
  Map<String, Object?> rawContract,
  ValidationResourceProfile profile,
) {
  try {
    _requireKeys(rawContract, const {'input', 'output'}, 'model contract');
    final input = _asObject(rawContract['input'], 'contract.input');
    _requireKeys(input, const {
      'type',
      'width',
      'height',
      'channels',
      'normalization',
    }, 'contract.input');
    final expectedInput = profile.inputContract;
    if (input['type'] != 'image' ||
        input['width'] != expectedInput.width ||
        input['height'] != expectedInput.height ||
        input['channels'] != expectedInput.channels ||
        input['normalization'] != expectedInput.normalization) {
      return false;
    }
    if (profile.outputContract.length != 1) return false;
    final expectedOutput = profile.outputContract.single;
    final output = _asObject(rawContract['output'], 'contract.output');
    final type = switch (expectedOutput.resultType) {
      ValidationResultType.classification => 'classification',
      ValidationResultType.detection => 'detection',
      ValidationResultType.boolean => null,
    };
    if (type == null || output['type'] != type) return false;
    final labels = output['labels'];
    if (labels is! List ||
        labels.length != expectedOutput.labels.length ||
        !List.generate(
          labels.length,
          (index) => labels[index] == expectedOutput.labels[index],
        ).every((match) => match)) {
      return false;
    }
    if (expectedOutput.resultType == ValidationResultType.detection &&
        output['scoreThreshold'] != expectedOutput.scoreThreshold) {
      return false;
    }
    final expectedOutputKeys = type == 'detection'
        ? const {'type', 'labels', 'scoreThreshold'}
        : const {'type', 'labels'};
    _requireKeys(output, expectedOutputKeys, 'contract.output');
    return true;
  } on Object {
    return false;
  }
}

Future<String> _sha256File(File file) async =>
    (await sha256.bind(file.openRead()).first).toString();

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

Map<String, Object?> _asObject(Object? value, String field) {
  if (value is! Map) throw FormatException('$field must be an object.');
  return value.map((key, item) => MapEntry(key.toString(), item));
}

void _requireKeys(Map<String, Object?> object, Set<String> keys, String field) {
  if (object.keys.toSet().difference(keys).isNotEmpty ||
      keys.difference(object.keys.toSet()).isNotEmpty) {
    throw FormatException('$field has missing or unknown fields.');
  }
}

String _string(Object? value, String field) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$field must be non-empty.');
  }
  return value;
}

bool _safeIdentifier(String value) =>
    RegExp(r'^[A-Za-z0-9._-]+$').hasMatch(value) &&
    value != '.' &&
    value != '..';

bool _isSemver(String value) => RegExp(
  r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$',
).hasMatch(value);

void _requireAllowedUrl(Uri url, {required bool allowInsecureLoopback}) {
  final secure = url.scheme == 'https';
  final loopback =
      allowInsecureLoopback &&
      url.scheme == 'http' &&
      (url.host.toLowerCase() == 'localhost' ||
          (InternetAddress.tryParse(url.host)?.isLoopback ?? false));
  if (!secure && !loopback) {
    throw const FormatException('URLs must use HTTPS.');
  }
}
