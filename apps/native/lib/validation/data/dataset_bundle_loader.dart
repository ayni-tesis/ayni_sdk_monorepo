import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

enum DatasetBundleErrorCode {
  archiveTooLarge,
  hashMismatch,
  invalidArchive,
  expandedContentTooLarge,
  unsafePath,
  duplicateEntry,
  invalidManifest,
  resourceMismatch,
  missingImage,
  imageHashMismatch,
  installationFailed,
}

class DatasetBundleException implements Exception {
  const DatasetBundleException(this.code, this.message);

  final DatasetBundleErrorCode code;
  final String message;

  @override
  String toString() => 'DatasetBundleException(${code.name}): $message';
}

class VerifiedDatasetCase {
  const VerifiedDatasetCase({
    required this.scenario,
    required this.caseId,
    required this.path,
    required this.sha256,
    required this.localPath,
  });

  final String scenario;
  final String caseId;
  final String path;
  final String sha256;
  final String localPath;
}

class VerifiedDataset {
  VerifiedDataset._({
    required this.datasetVersionId,
    required this.datasetId,
    required this.version,
    required this.partition,
    required this.source,
    required this.license,
    required this.zipSha256,
    required this.directory,
    required List<VerifiedDatasetCase> cases,
  }) : cases = List.unmodifiable(cases);

  final String datasetVersionId;
  final String datasetId;
  final String version;
  final String partition;
  final String source;
  final String license;
  final String zipSha256;
  final Directory directory;
  final List<VerifiedDatasetCase> cases;
}

class DatasetBundleLoader {
  static const maximumArchiveBytes = 128 * 1024 * 1024;
  static const maximumExpandedBytes = 1024 * 1024 * 1024;
  static const maximumEntryBytes = 64 * 1024 * 1024;
  static const maximumManifestBytes = 1024 * 1024;
  static const maximumEntries = 12000;

  const DatasetBundleLoader();

  Future<VerifiedDataset?> loadVerified({
    required Directory datasetsDirectory,
    required String datasetVersionId,
    required String expectedArchiveSha256,
    required String expectedPartition,
  }) async {
    final safeVersionId = _safeIdentifier(datasetVersionId);
    if (!_digestPattern.hasMatch(expectedArchiveSha256)) {
      throw const DatasetBundleException(
        DatasetBundleErrorCode.hashMismatch,
        'El hash esperado del ZIP no es válido.',
      );
    }
    final directory = Directory(_join(datasetsDirectory.path, safeVersionId));
    if (!await directory.exists()) return null;
    try {
      final receiptFile = File(_join(directory.path, 'verified_dataset.json'));
      if (!await receiptFile.exists() ||
          await receiptFile.length() > maximumManifestBytes) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.invalidManifest,
          'El registro local del dataset no es válido.',
        );
      }
      final receipt = _object(
        jsonDecode(await receiptFile.readAsString()),
        'verified dataset receipt',
      );
      _exactKeys(receipt, const {
        'schemaVersion',
        'datasetVersionId',
        'datasetId',
        'version',
        'partition',
        'source',
        'license',
        'zipSha256',
        'cases',
      });
      if (_text(receipt['schemaVersion'], 'schemaVersion') != '1' ||
          _text(receipt['datasetVersionId'], 'datasetVersionId') !=
              safeVersionId ||
          _text(receipt['zipSha256'], 'zipSha256') != expectedArchiveSha256 ||
          _partition(receipt['partition']) != expectedPartition) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.resourceMismatch,
          'El dataset local no corresponde a la versión solicitada.',
        );
      }
      final rawCases = receipt['cases'];
      if (rawCases is! List ||
          rawCases.isEmpty ||
          rawCases.length > maximumEntries) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.invalidManifest,
          'El registro local del dataset no contiene casos válidos.',
        );
      }
      final rootRealPath = await directory.resolveSymbolicLinks();
      final ids = <String>{};
      final paths = <String>{};
      final cases = <VerifiedDatasetCase>[];
      var expandedBytes = 0;
      for (final rawCase in rawCases) {
        final item = _object(rawCase, 'case');
        _exactKeys(item, const {'scenario', 'caseId', 'path', 'sha256'});
        final path = _safeRelativePath(_text(item['path'], 'path'));
        final caseId = _identifier(item['caseId'], 'caseId');
        final digest = _text(item['sha256'], 'sha256');
        if (!_digestPattern.hasMatch(digest) ||
            !ids.add(caseId) ||
            !paths.add(path.toLowerCase()) ||
            {
              'manifest.json',
              'verified_dataset.json',
            }.contains(path.toLowerCase())) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.invalidManifest,
            'El registro local del dataset contiene casos repetidos o inválidos.',
          );
        }
        final image = File(_joinSegments(directory.path, path));
        if (!await image.exists()) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.missingImage,
            'Falta una imagen verificada del dataset local.',
          );
        }
        final realPath = await image.resolveSymbolicLinks();
        if (!_isContainedPath(rootRealPath, realPath)) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.unsafePath,
            'Una imagen local sale del directorio privado del dataset.',
          );
        }
        final imageLength = await image.length();
        if (imageLength <= 0 ||
            imageLength > maximumEntryBytes ||
            imageLength > maximumExpandedBytes - expandedBytes) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.expandedContentTooLarge,
            'El dataset local supera el límite permitido.',
          );
        }
        expandedBytes += imageLength;
        final actualHash = await sha256.bind(image.openRead()).first;
        if (actualHash.toString() != digest) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.imageHashMismatch,
            'Una imagen local no coincide con su hash.',
          );
        }
        cases.add(
          VerifiedDatasetCase(
            scenario: _text(item['scenario'], 'scenario'),
            caseId: caseId,
            path: path,
            sha256: digest,
            localPath: image.path,
          ),
        );
      }
      return VerifiedDataset._(
        datasetVersionId: safeVersionId,
        datasetId: _identifier(receipt['datasetId'], 'datasetId'),
        version: _semver(receipt['version'], 'version'),
        partition: _partition(receipt['partition']),
        source: _text(receipt['source'], 'source'),
        license: _text(receipt['license'], 'license'),
        zipSha256: expectedArchiveSha256,
        directory: directory,
        cases: cases,
      );
    } on DatasetBundleException {
      rethrow;
    } on Object {
      throw const DatasetBundleException(
        DatasetBundleErrorCode.invalidManifest,
        'No se pudo comprobar la copia local del dataset.',
      );
    }
  }

  Future<VerifiedDataset> install({
    required File archiveFile,
    required Directory datasetsDirectory,
    required String expectedDatasetVersionId,
    required String expectedArchiveSha256,
    required String expectedDatasetId,
    required String expectedVersion,
    required String expectedPartition,
    required String expectedSource,
    required String expectedLicense,
    int maxExpandedBytes = maximumExpandedBytes,
  }) async {
    if (!_digestPattern.hasMatch(expectedArchiveSha256)) {
      throw const DatasetBundleException(
        DatasetBundleErrorCode.hashMismatch,
        'El hash esperado del ZIP no es válido.',
      );
    }
    Directory? staging;
    try {
      final archiveLength = await archiveFile.length();
      if (archiveLength <= 0 || archiveLength > maximumArchiveBytes) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.archiveTooLarge,
          'El ZIP supera el límite permitido.',
        );
      }
      final actualZipSha256 = await sha256.bind(archiveFile.openRead()).first;
      if (actualZipSha256.toString() != expectedArchiveSha256) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.hashMismatch,
          'El ZIP no coincide con el hash publicado.',
        );
      }
      final bytes = await archiveFile.readAsBytes();
      final entries = _scanZip(
        bytes,
        maxExpandedBytes: min(maxExpandedBytes, maximumExpandedBytes),
      );
      final zipEntries = {for (final entry in entries) entry.name: entry};
      final manifestInfo = zipEntries['manifest.json'];
      if (manifestInfo == null ||
          manifestInfo.isDirectory ||
          manifestInfo.uncompressedSize > maximumManifestBytes) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.invalidManifest,
          'Falta el manifiesto raíz del dataset.',
        );
      }
      final manifestBytes = await _extractZipEntry(
        bytes,
        manifestInfo,
        maximumManifestBytes,
      );
      final manifest = _parseInternalManifest(manifestBytes);
      _requireMatchingMetadata(
        manifest,
        expectedDatasetVersionId: expectedDatasetVersionId,
        expectedDatasetId: expectedDatasetId,
        expectedVersion: expectedVersion,
        expectedPartition: expectedPartition,
        expectedSource: expectedSource,
        expectedLicense: expectedLicense,
      );
      await datasetsDirectory.create(recursive: true);
      final datasetVersionId = _safeIdentifier(expectedDatasetVersionId);
      staging = Directory(
        _join(
          datasetsDirectory.path,
          '.$datasetVersionId.staging-${_randomToken()}',
        ),
      );
      await staging.create();
      final stagedCases =
          <({String scenario, String caseId, String path, String sha256})>[];
      final caseIds = <String>{};
      final casePaths = <String>{};
      final caseEntries = <String, _ZipEntryInfo>{};
      for (final entry in manifest.cases) {
        final path = _safeRelativePath(entry.path);
        final normalized = path.toLowerCase();
        if ({'manifest.json', 'verified_dataset.json'}.contains(normalized) ||
            !casePaths.add(normalized) ||
            !caseIds.add(entry.caseId)) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.duplicateEntry,
            'El manifiesto contiene casos o rutas repetidos.',
          );
        }
        final zipEntry = zipEntries[path];
        if (zipEntry == null || zipEntry.isDirectory) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.missingImage,
            'Falta una imagen declarada por el manifiesto.',
          );
        }
        if (zipEntry.uncompressedSize <= 0 ||
            zipEntry.uncompressedSize > maximumEntryBytes) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.expandedContentTooLarge,
            'Una entrada del ZIP supera el límite permitido.',
          );
        }
        final imageBytes = await _extractZipEntry(
          bytes,
          zipEntry,
          maximumEntryBytes,
        );
        if (imageBytes.isEmpty ||
            sha256.convert(imageBytes).toString() != entry.sha256) {
          throw const DatasetBundleException(
            DatasetBundleErrorCode.imageHashMismatch,
            'Una imagen no coincide con su hash publicado.',
          );
        }
        final stagedFile = File(_joinSegments(staging.path, path));
        await stagedFile.parent.create(recursive: true);
        await stagedFile.writeAsBytes(imageBytes, flush: true);
        caseEntries[path] = zipEntry;
        stagedCases.add((
          scenario: entry.scenario,
          caseId: entry.caseId,
          path: path,
          sha256: entry.sha256,
        ));
      }
      // Validate every member without retaining unrelated decompressed data.
      // A bundle may expand close to 1 GiB, which must not all be materialized
      // in the Android process at once.
      for (final entry in entries) {
        if (entry.name == 'manifest.json' ||
            caseEntries.containsKey(entry.name)) {
          continue;
        }
        await _extractZipEntry(bytes, entry, maximumEntryBytes, retain: false);
      }
      if (stagedCases.isEmpty) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.invalidManifest,
          'El manifiesto no declara casos de prueba.',
        );
      }
      return await _promote(
        staging,
        stagedCases,
        datasetsDirectory: datasetsDirectory,
        datasetVersionId: datasetVersionId,
        datasetId: manifest.datasetId,
        version: manifest.version,
        partition: manifest.partition,
        source: manifest.source,
        license: manifest.license,
        zipSha256: actualZipSha256.toString(),
      );
    } on DatasetBundleException {
      if (staging != null && await staging.exists()) {
        await staging.delete(recursive: true);
      }
      rethrow;
    } on Object {
      if (staging != null && await staging.exists()) {
        await staging.delete(recursive: true);
      }
      throw const DatasetBundleException(
        DatasetBundleErrorCode.invalidArchive,
        'No se pudo verificar el paquete ZIP.',
      );
    }
  }

  Future<VerifiedDataset> _promote(
    Directory staging,
    List<({String scenario, String caseId, String path, String sha256})>
    stagedCases, {
    required Directory datasetsDirectory,
    required String datasetVersionId,
    required String datasetId,
    required String version,
    required String partition,
    required String source,
    required String license,
    required String zipSha256,
  }) async {
    await datasetsDirectory.create(recursive: true);
    final token = _randomToken();
    final destination = Directory(
      _join(datasetsDirectory.path, datasetVersionId),
    );
    final backup = Directory(
      _join(datasetsDirectory.path, '.$datasetVersionId.previous-$token'),
    );
    try {
      final receipt = {
        'schemaVersion': '1',
        'datasetVersionId': datasetVersionId,
        'datasetId': datasetId,
        'version': version,
        'partition': partition,
        'source': source,
        'license': license,
        'zipSha256': zipSha256,
        'cases': stagedCases
            .map(
              (item) => {
                'scenario': item.scenario,
                'caseId': item.caseId,
                'path': item.path,
                'sha256': item.sha256,
              },
            )
            .toList(growable: false),
      };
      await File(
        _join(staging.path, 'verified_dataset.json'),
      ).writeAsString(jsonEncode(receipt), flush: true);

      var movedExisting = false;
      if (await destination.exists()) {
        await destination.rename(backup.path);
        movedExisting = true;
      }
      try {
        await staging.rename(destination.path);
      } catch (_) {
        if (movedExisting &&
            await backup.exists() &&
            !await destination.exists()) {
          await backup.rename(destination.path);
        }
        rethrow;
      }
      if (movedExisting && await backup.exists()) {
        try {
          await backup.delete(recursive: true);
        } on Object {
          // The promoted verified directory remains valid if stale backup cleanup fails.
        }
      }
      final finalCases = stagedCases
          .map(
            (item) => VerifiedDatasetCase(
              scenario: item.scenario,
              caseId: item.caseId,
              path: item.path,
              sha256: item.sha256,
              localPath: _joinSegments(destination.path, item.path),
            ),
          )
          .toList(growable: false);
      return VerifiedDataset._(
        datasetVersionId: datasetVersionId,
        datasetId: datasetId,
        version: version,
        partition: partition,
        source: source,
        license: license,
        zipSha256: zipSha256,
        directory: destination,
        cases: finalCases,
      );
    } on Object {
      if (await staging.exists()) await staging.delete(recursive: true);
      if (await backup.exists() && !await destination.exists()) {
        await backup.rename(destination.path);
      }
      throw const DatasetBundleException(
        DatasetBundleErrorCode.installationFailed,
        'No se pudo instalar el dataset verificado.',
      );
    }
  }
}

class _InternalCase {
  const _InternalCase(this.scenario, this.caseId, this.path, this.sha256);

  final String scenario;
  final String caseId;
  final String path;
  final String sha256;
}

class _InternalManifest {
  const _InternalManifest({
    required this.datasetId,
    required this.version,
    required this.partition,
    required this.source,
    required this.license,
    required this.cases,
  });

  final String datasetId;
  final String version;
  final String partition;
  final String source;
  final String license;
  final List<_InternalCase> cases;
}

class _ZipEntryInfo {
  const _ZipEntryInfo({
    required this.name,
    required this.isDirectory,
    required this.crc32,
    required this.uncompressedSize,
    required this.compressedSize,
    required this.compressionMethod,
    required this.dataOffset,
  });

  final String name;
  final bool isDirectory;
  final int crc32;
  final int uncompressedSize;
  final int compressedSize;
  final int compressionMethod;
  final int dataOffset;
}

_InternalManifest _parseInternalManifest(Uint8List bytes) {
  try {
    final decoded = jsonDecode(utf8.decode(bytes));
    final json = _object(decoded, 'manifest');
    _exactKeys(json, const {
      'schemaVersion',
      'datasetId',
      'version',
      'partition',
      'source',
      'license',
      'cases',
    });
    if (_text(json['schemaVersion'], 'schemaVersion') != '1') {
      throw const DatasetBundleException(
        DatasetBundleErrorCode.invalidManifest,
        'La versión del manifiesto no es compatible.',
      );
    }
    final rawCases = json['cases'];
    if (rawCases is! List) throw const FormatException('cases must be a list.');
    final cases = <_InternalCase>[];
    for (final rawCase in rawCases) {
      final entry = _object(rawCase, 'case');
      _exactKeys(entry, const {'scenario', 'caseId', 'path', 'sha256'});
      final path = _safeRelativePath(_text(entry['path'], 'path'));
      final digest = _text(entry['sha256'], 'sha256');
      if (!_digestPattern.hasMatch(digest)) {
        throw const FormatException('Case SHA-256 is malformed.');
      }
      cases.add(
        _InternalCase(
          _text(entry['scenario'], 'scenario'),
          _identifier(entry['caseId'], 'caseId'),
          path,
          digest,
        ),
      );
    }
    if (cases.isEmpty) {
      throw const FormatException('Dataset must declare at least one case.');
    }
    return _InternalManifest(
      datasetId: _identifier(json['datasetId'], 'datasetId'),
      version: _semver(json['version'], 'version'),
      partition: _partition(json['partition']),
      source: _text(json['source'], 'source'),
      license: _text(json['license'], 'license'),
      cases: List.unmodifiable(cases),
    );
  } on DatasetBundleException {
    rethrow;
  } on Object {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.invalidManifest,
      'El manifiesto del dataset está malformado.',
    );
  }
}

void _requireMatchingMetadata(
  _InternalManifest manifest, {
  required String expectedDatasetVersionId,
  required String expectedDatasetId,
  required String expectedVersion,
  required String expectedPartition,
  required String expectedSource,
  required String expectedLicense,
}) {
  if (expectedDatasetVersionId.trim().isEmpty ||
      !_safeIdPattern.hasMatch(expectedDatasetVersionId) ||
      expectedDatasetVersionId == '.' ||
      expectedDatasetVersionId == '..' ||
      manifest.datasetId != expectedDatasetId ||
      manifest.version != expectedVersion ||
      manifest.partition != expectedPartition ||
      manifest.source != expectedSource ||
      manifest.license != expectedLicense) {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.resourceMismatch,
      'El manifiesto no corresponde a la versión publicada.',
    );
  }
}

List<_ZipEntryInfo> _scanZip(Uint8List bytes, {required int maxExpandedBytes}) {
  try {
    if (bytes.length < 22) throw const FormatException('Too short.');
    final data = ByteData.sublistView(bytes);
    final lowestEocd = max(0, bytes.length - 22 - 65535);
    var eocdOffset = -1;
    for (var offset = bytes.length - 22; offset >= lowestEocd; offset--) {
      if (data.getUint32(offset, Endian.little) == 0x06054b50) {
        final commentLength = data.getUint16(offset + 20, Endian.little);
        if (offset + 22 + commentLength == bytes.length) {
          eocdOffset = offset;
          break;
        }
      }
    }
    if (eocdOffset < 0) throw const FormatException('Missing end record.');
    final disk = data.getUint16(eocdOffset + 4, Endian.little);
    final centralDisk = data.getUint16(eocdOffset + 6, Endian.little);
    final diskEntries = data.getUint16(eocdOffset + 8, Endian.little);
    final totalEntries = data.getUint16(eocdOffset + 10, Endian.little);
    final centralSize = data.getUint32(eocdOffset + 12, Endian.little);
    final centralOffset = data.getUint32(eocdOffset + 16, Endian.little);
    if (disk != 0 ||
        centralDisk != 0 ||
        diskEntries != totalEntries ||
        totalEntries == 0xffff ||
        centralSize == 0xffffffff ||
        centralOffset == 0xffffffff ||
        totalEntries == 0 ||
        totalEntries > DatasetBundleLoader.maximumEntries ||
        centralOffset + centralSize != eocdOffset) {
      throw const FormatException('Unsupported or malformed directory.');
    }
    final entries = <_ZipEntryInfo>[];
    final names = <String>{};
    var totalExpanded = 0;
    var cursor = centralOffset;
    var previousDataEnd = -1;
    for (var index = 0; index < totalEntries; index++) {
      if (cursor + 46 > eocdOffset ||
          data.getUint32(cursor, Endian.little) != 0x02014b50) {
        throw const FormatException('Malformed central directory entry.');
      }
      final versionMadeBy = data.getUint16(cursor + 4, Endian.little);
      final flags = data.getUint16(cursor + 8, Endian.little);
      final compressionMethod = data.getUint16(cursor + 10, Endian.little);
      final crc32 = data.getUint32(cursor + 16, Endian.little);
      final compressedSize = data.getUint32(cursor + 20, Endian.little);
      final uncompressedSize = data.getUint32(cursor + 24, Endian.little);
      final nameLength = data.getUint16(cursor + 28, Endian.little);
      final extraLength = data.getUint16(cursor + 30, Endian.little);
      final commentLength = data.getUint16(cursor + 32, Endian.little);
      final diskStart = data.getUint16(cursor + 34, Endian.little);
      final externalAttributes = data.getUint32(cursor + 38, Endian.little);
      final localOffset = data.getUint32(cursor + 42, Endian.little);
      final entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
      if (entryEnd > centralOffset + centralSize ||
          nameLength == 0 ||
          diskStart != 0 ||
          compressedSize == 0xffffffff ||
          uncompressedSize == 0xffffffff ||
          localOffset == 0xffffffff ||
          flags & 0x0001 != 0 ||
          flags & 0x0040 != 0 ||
          flags & 0x2000 != 0 ||
          (compressionMethod != 0 && compressionMethod != 8)) {
        throw const FormatException('Unsupported entry metadata.');
      }
      final filenameBytes = bytes.sublist(
        cursor + 46,
        cursor + 46 + nameLength,
      );
      final name = _safeRelativePath(utf8.decode(filenameBytes));
      final isDirectory = name.endsWith('/');
      final normalizedName =
          (isDirectory ? name.substring(0, name.length - 1) : name)
              .toLowerCase();
      if (!names.add(normalizedName)) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.duplicateEntry,
          'El ZIP contiene rutas repetidas.',
        );
      }
      final hostSystem = versionMadeBy >> 8;
      final unixType = (externalAttributes >> 16) & 0xf000;
      if (hostSystem == 3 &&
          (unixType == 0xa000 ||
              (unixType != 0 && unixType != 0x8000 && unixType != 0x4000))) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.unsafePath,
          'El ZIP contiene un tipo de archivo no permitido.',
        );
      }
      if (isDirectory && uncompressedSize != 0) {
        throw const FormatException('Directory contains data.');
      }
      if (compressionMethod == 0 && compressedSize != uncompressedSize) {
        throw const FormatException('Stored entry sizes do not match.');
      }
      if (!isDirectory &&
          uncompressedSize > DatasetBundleLoader.maximumEntryBytes) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.expandedContentTooLarge,
          'Una entrada del ZIP supera el límite permitido.',
        );
      }
      if (uncompressedSize > maxExpandedBytes - totalExpanded) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.expandedContentTooLarge,
          'El contenido expandido supera 1 GiB.',
        );
      }
      totalExpanded += uncompressedSize;

      if (localOffset + 30 > centralOffset ||
          data.getUint32(localOffset, Endian.little) != 0x04034b50) {
        throw const FormatException('Malformed local header.');
      }
      final localFlags = data.getUint16(localOffset + 6, Endian.little);
      final localMethod = data.getUint16(localOffset + 8, Endian.little);
      final localNameLength = data.getUint16(localOffset + 26, Endian.little);
      final localExtraLength = data.getUint16(localOffset + 28, Endian.little);
      final dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      final dataEnd = dataOffset + compressedSize;
      if (dataEnd > centralOffset ||
          localFlags != flags ||
          localMethod != compressionMethod ||
          localNameLength != nameLength ||
          dataOffset > centralOffset) {
        throw const FormatException('Local and central headers do not agree.');
      }
      final localName = utf8.decode(
        bytes.sublist(localOffset + 30, localOffset + 30 + localNameLength),
      );
      if (localName != name ||
          (previousDataEnd > localOffset && localOffset < previousDataEnd)) {
        throw const FormatException('Local entry paths or offsets overlap.');
      }
      previousDataEnd = max(previousDataEnd, dataEnd);
      entries.add(
        _ZipEntryInfo(
          name: name,
          isDirectory: isDirectory,
          crc32: crc32,
          uncompressedSize: uncompressedSize,
          compressedSize: compressedSize,
          compressionMethod: compressionMethod,
          dataOffset: dataOffset,
        ),
      );
      cursor = entryEnd;
    }
    if (cursor != centralOffset + centralSize) {
      throw const FormatException('Central directory size does not match.');
    }
    return entries;
  } on DatasetBundleException {
    rethrow;
  } on Object {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.invalidArchive,
      'El archivo ZIP está malformado o no es compatible.',
    );
  }
}

Future<Uint8List> _extractZipEntry(
  Uint8List zipBytes,
  _ZipEntryInfo entry,
  int maximumBytes, {
  bool retain = true,
}) async {
  if (entry.uncompressedSize > maximumBytes) {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.expandedContentTooLarge,
      'Una entrada del ZIP supera el límite permitido.',
    );
  }
  final compressed = Uint8List.sublistView(
    zipBytes,
    entry.dataOffset,
    entry.dataOffset + entry.compressedSize,
  );
  if (entry.compressionMethod == 0) {
    if (compressed.length != entry.uncompressedSize) {
      throw const DatasetBundleException(
        DatasetBundleErrorCode.invalidArchive,
        'Una entrada del ZIP está incompleta.',
      );
    }
    if (_finishCrc32(_updateCrc32(0xffffffff, compressed)) != entry.crc32) {
      throw const DatasetBundleException(
        DatasetBundleErrorCode.invalidArchive,
        'El checksum de una entrada del ZIP no coincide.',
      );
    }
    return retain ? Uint8List.fromList(compressed) : Uint8List(0);
  }
  final output = retain ? BytesBuilder(copy: false) : null;
  var outputLength = 0;
  var crc = 0xffffffff;
  try {
    final decoded = ZLibDecoder(
      raw: true,
    ).bind(Stream<List<int>>.fromIterable(_byteSlices(compressed)));
    await for (final chunk in decoded) {
      outputLength += chunk.length;
      if (outputLength > maximumBytes ||
          outputLength > entry.uncompressedSize) {
        throw const DatasetBundleException(
          DatasetBundleErrorCode.expandedContentTooLarge,
          'El ZIP intenta expandir una entrada por encima del límite.',
        );
      }
      crc = _updateCrc32(crc, chunk);
      output?.add(chunk);
    }
  } on DatasetBundleException {
    rethrow;
  } on Object {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.invalidArchive,
      'No se pudo expandir una entrada del ZIP.',
    );
  }
  if (outputLength != entry.uncompressedSize ||
      _finishCrc32(crc) != entry.crc32) {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.invalidArchive,
      'El tamaño expandido o checksum no coincide con el ZIP.',
    );
  }
  return output?.takeBytes() ?? Uint8List(0);
}

int _updateCrc32(int crc, List<int> bytes) {
  var value = crc;
  for (final byte in bytes) {
    value ^= byte;
    for (var bit = 0; bit < 8; bit++) {
      value = (value & 1) == 0 ? value >> 1 : (value >> 1) ^ 0xedb88320;
    }
  }
  return value & 0xffffffff;
}

int _finishCrc32(int value) => (value ^ 0xffffffff) & 0xffffffff;

Iterable<Uint8List> _byteSlices(Uint8List bytes) sync* {
  const chunkBytes = 8192;
  for (var offset = 0; offset < bytes.length; offset += chunkBytes) {
    yield Uint8List.sublistView(
      bytes,
      offset,
      min(bytes.length, offset + chunkBytes),
    );
  }
}

String _safeRelativePath(String value) {
  if (value.isEmpty ||
      value.contains('\u0000') ||
      value.contains('\\') ||
      value.startsWith('/') ||
      RegExp(r'^[A-Za-z]:').hasMatch(value)) {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.unsafePath,
      'El ZIP contiene una ruta no permitida.',
    );
  }
  final withoutTrailingSlash = value.endsWith('/')
      ? value.substring(0, value.length - 1)
      : value;
  final segments = withoutTrailingSlash.split('/');
  if (segments.isEmpty ||
      segments.any(
        (segment) => segment.isEmpty || segment == '.' || segment == '..',
      )) {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.unsafePath,
      'El ZIP contiene una ruta no permitida.',
    );
  }
  return value;
}

String _joinSegments(String root, String relative) {
  final parts = _safeRelativePath(relative).split('/');
  return <String>[root, ...parts].join(Platform.pathSeparator);
}

bool _isContainedPath(String root, String candidate) {
  final normalizedRoot = Platform.isWindows ? root.toLowerCase() : root;
  final normalizedCandidate = Platform.isWindows
      ? candidate.toLowerCase()
      : candidate;
  return normalizedCandidate.startsWith(
    '$normalizedRoot${Platform.pathSeparator}',
  );
}

String _join(String root, String leaf) => '$root${Platform.pathSeparator}$leaf';

String _randomToken() => List.generate(
  24,
  (_) => Random.secure().nextInt(16).toRadixString(16),
).join();

String _safeIdentifier(String value) {
  if (!RegExp(r'^[A-Za-z0-9._-]+$').hasMatch(value) ||
      value == '.' ||
      value == '..') {
    throw const DatasetBundleException(
      DatasetBundleErrorCode.invalidManifest,
      'El identificador de versión no es válido.',
    );
  }
  return value;
}

String _identifier(Object? value, String field) {
  final text = _text(value, field);
  if (!RegExp(r'^[A-Za-z0-9._-]+$').hasMatch(text) ||
      text == '.' ||
      text == '..') {
    throw FormatException('$field must be a safe identifier.');
  }
  return text;
}

String _partition(Object? value) {
  final text = _text(value, 'partition');
  if (!RegExp(r'^[A-Za-z0-9._-]{1,64}$').hasMatch(text)) {
    throw const FormatException('Invalid partition.');
  }
  return text;
}

String _semver(Object? value, String field) {
  final text = _text(value, field);
  if (!RegExp(
    r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$',
  ).hasMatch(text)) {
    throw FormatException('$field must be semantic version.');
  }
  return text;
}

String _text(Object? value, String field) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$field must be non-empty.');
  }
  return value;
}

Map<String, Object?> _object(Object? value, String field) {
  if (value is! Map) throw FormatException('$field must be an object.');
  return value.map((key, item) => MapEntry(key.toString(), item));
}

void _exactKeys(Map<String, Object?> value, Set<String> expected) {
  if (value.keys.toSet().difference(expected).isNotEmpty ||
      expected.difference(value.keys.toSet()).isNotEmpty) {
    throw const FormatException(
      'The dataset manifest has missing or unknown fields.',
    );
  }
}

final _digestPattern = RegExp(r'^[0-9a-f]{64}$');
final _safeIdPattern = RegExp(r'^[A-Za-z0-9._-]+$');
