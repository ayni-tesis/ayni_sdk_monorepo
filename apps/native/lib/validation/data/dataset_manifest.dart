import 'dart:io';

class DatasetManifest {
  const DatasetManifest({
    required this.datasetVersionId,
    required this.datasetId,
    required this.version,
    required this.partition,
    required this.source,
    required this.license,
    required this.sha256,
    required this.sizeBytes,
    required this.downloadUrl,
    required this.downloadUrlExpiresAt,
  });

  static const maximumArchiveBytes = 128 * 1024 * 1024;

  final String datasetVersionId;
  final String datasetId;
  final String version;
  final String partition;
  final String source;
  final String license;
  final String sha256;
  final int sizeBytes;
  final Uri downloadUrl;
  final DateTime downloadUrlExpiresAt;

  bool isExpired(DateTime now) => !downloadUrlExpiresAt.isAfter(now.toUtc());

  factory DatasetManifest.fromJson(
    Map<String, Object?> json, {
    bool allowInsecureLoopback = false,
  }) {
    _requireKeys(json, const {'manifest'}, 'dataset response');
    final rawManifest = _asObject(json['manifest'], 'manifest');
    _requireKeys(rawManifest, const {
      'datasetVersionId',
      'datasetId',
      'version',
      'partition',
      'source',
      'license',
      'sha256',
      'sizeBytes',
      'downloadUrl',
      'downloadUrlExpiresAt',
    }, 'manifest');
    final urlText = _string(rawManifest['downloadUrl'], 'downloadUrl');
    final url = Uri.tryParse(urlText);
    if (url == null ||
        !url.isAbsolute ||
        url.host.isEmpty ||
        url.userInfo.isNotEmpty) {
      throw const FormatException(
        'downloadUrl must be an absolute URL without user information.',
      );
    }
    final isSecure = url.scheme == 'https';
    final isAllowedLoopback =
        allowInsecureLoopback && url.scheme == 'http' && _isLoopback(url.host);
    if (!isSecure && !isAllowedLoopback) {
      throw const FormatException('downloadUrl must use HTTPS.');
    }
    final digest = _string(rawManifest['sha256'], 'sha256');
    if (!RegExp(r'^[0-9a-f]{64}$').hasMatch(digest)) {
      throw const FormatException('sha256 must be a lowercase SHA-256 digest.');
    }
    final bytes = rawManifest['sizeBytes'];
    if (bytes is! int || bytes <= 0 || bytes > maximumArchiveBytes) {
      throw const FormatException(
        'sizeBytes is outside the supported ZIP size limit.',
      );
    }
    final expiryText = _string(
      rawManifest['downloadUrlExpiresAt'],
      'downloadUrlExpiresAt',
    );
    if (!expiryText.endsWith('Z')) {
      throw const FormatException(
        'downloadUrlExpiresAt must be an ISO-8601 UTC timestamp.',
      );
    }
    final expiry = DateTime.tryParse(expiryText);
    if (expiry == null || !expiry.isUtc) {
      throw const FormatException(
        'downloadUrlExpiresAt must be an ISO-8601 UTC timestamp.',
      );
    }
    final partition = _string(rawManifest['partition'], 'partition');
    if (!RegExp(r'^[A-Za-z0-9._-]{1,64}$').hasMatch(partition)) {
      throw const FormatException('partition is malformed.');
    }
    final version = _string(rawManifest['version'], 'version');
    if (!_isSemver(version)) {
      throw const FormatException('version must be semantic version.');
    }
    return DatasetManifest(
      datasetVersionId: _identifier(
        rawManifest['datasetVersionId'],
        'datasetVersionId',
      ),
      datasetId: _identifier(rawManifest['datasetId'], 'datasetId'),
      version: version,
      partition: partition,
      source: _string(rawManifest['source'], 'source'),
      license: _string(rawManifest['license'], 'license'),
      sha256: digest,
      sizeBytes: bytes,
      downloadUrl: url,
      downloadUrlExpiresAt: expiry,
    );
  }
}

Map<String, Object?> _asObject(Object? value, String field) {
  if (value is! Map) throw FormatException('$field must be an object.');
  return value.map((key, item) => MapEntry(key.toString(), item));
}

void _requireKeys(
  Map<String, Object?> object,
  Set<String> expected,
  String field,
) {
  if (object.keys.toSet().difference(expected).isNotEmpty ||
      expected.difference(object.keys.toSet()).isNotEmpty) {
    throw FormatException('$field has missing or unknown fields.');
  }
}

String _string(Object? value, String field) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$field must be non-empty.');
  }
  return value;
}

String _identifier(Object? value, String field) {
  final identifier = _string(value, field);
  if (!RegExp(r'^[A-Za-z0-9._-]+$').hasMatch(identifier) ||
      identifier == '.' ||
      identifier == '..') {
    throw FormatException('$field must be a safe identifier.');
  }
  return identifier;
}

bool _isSemver(String value) => RegExp(
  r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$',
).hasMatch(value);

bool _isLoopback(String host) {
  if (host.toLowerCase() == 'localhost') return true;
  return InternetAddress.tryParse(host)?.isLoopback ?? false;
}
