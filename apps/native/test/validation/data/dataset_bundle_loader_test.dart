import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:better_fullstack_app/validation/data/dataset_bundle_loader.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory temporaryDirectory;
  late Directory datasetsDirectory;
  late DatasetBundleLoader loader;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'ayni-dataset-test-',
    );
    datasetsDirectory = Directory(
      '${temporaryDirectory.path}${Platform.pathSeparator}datasets',
    );
    await datasetsDirectory.create();
    loader = DatasetBundleLoader();
  });

  tearDown(() async {
    if (await temporaryDirectory.exists()) {
      await temporaryDirectory.delete(recursive: true);
    }
  });

  Future<VerifiedDataset> install(File file, {String? expectedZipSha256}) =>
      loader.install(
        archiveFile: file,
        datasetsDirectory: datasetsDirectory,
        expectedDatasetVersionId: 'dataset-version-1',
        expectedArchiveSha256:
            expectedZipSha256 ??
            sha256.convert(file.readAsBytesSync()).toString(),
        expectedDatasetId: 'dataset-1',
        expectedVersion: '1.0.0',
        expectedPartition: 'test',
        expectedSource: 'Colección de tesis',
        expectedLicense: 'CC BY 4.0',
      );

  Future<File> writeArchive(List<int> bytes) async {
    final file = File(
      '${temporaryDirectory.path}${Platform.pathSeparator}bundle-${DateTime.now().microsecondsSinceEpoch}.zip',
    );
    await file.writeAsBytes(bytes);
    return file;
  }

  test(
    'verifies and installs an ordered dataset into the private directory',
    () async {
      final image1 = utf8.encode('image-one');
      final image2 = utf8.encode('image-two');
      final zip = _zip({
        'manifest.json': utf8.encode(
          jsonEncode(
            _manifest([
              _case('case-1', 'images/one.jpg', image1),
              _case('case-2', 'images/two.jpg', image2),
            ]),
          ),
        ),
        'images/one.jpg': image1,
        'images/two.jpg': image2,
      });
      final archiveFile = await writeArchive(zip);

      final verified = await install(archiveFile);

      expect(verified.cases.map((item) => item.caseId), ['case-1', 'case-2']);
      expect(verified.zipSha256, sha256.convert(zip).toString());
      expect(await File(verified.cases.first.localPath).readAsBytes(), image1);
      expect(
        File(verified.cases.first.localPath).absolute.path,
        startsWith(datasetsDirectory.absolute.path),
      );
    },
  );

  test('rejects ZIP and image hash mismatches', () async {
    final image = utf8.encode('correct-image');
    final zip = _zip({
      'manifest.json': utf8.encode(
        jsonEncode(
          _manifest([_case('case-1', 'images/a.jpg', image, hash: 'b' * 64)]),
        ),
      ),
      'images/a.jpg': image,
    });
    final archiveFile = await writeArchive(zip);
    await expectLater(
      install(archiveFile, expectedZipSha256: 'c' * 64),
      throwsA(isA<DatasetBundleException>()),
    );
    await expectLater(
      install(archiveFile),
      throwsA(isA<DatasetBundleException>()),
    );
  });

  test(
    'rejects absolute, traversal, drive, and backslash paths without escaping',
    () async {
      for (final path in [
        '/absolute.jpg',
        '../escape.jpg',
        r'C:\escape.jpg',
        r'images\escape.jpg',
      ]) {
        final image = utf8.encode('image');
        final zip = _zip({
          'manifest.json': utf8.encode(
            jsonEncode(_manifest([_case('case-1', path, image)])),
          ),
          path: image,
        });
        await expectLater(
          install(await writeArchive(zip)),
          throwsA(isA<DatasetBundleException>()),
        );
      }
      expect(
        await File(
          '${temporaryDirectory.path}${Platform.pathSeparator}escape.jpg',
        ).exists(),
        isFalse,
      );
    },
  );

  test('rejects duplicate archive paths and duplicate case IDs', () async {
    final image = utf8.encode('image');
    final duplicatePaths = Archive()
      ..addFile(
        ArchiveFile.bytes(
          'manifest.json',
          utf8.encode(
            jsonEncode(_manifest([_case('case-1', 'images/a.jpg', image)])),
          ),
        ),
      )
      ..addFile(ArchiveFile.bytes('images/a.jpg', image))
      ..addFile(ArchiveFile.bytes('images/A.jpg', image));
    final duplicateZip = ZipEncoder().encode(duplicatePaths);
    await expectLater(
      install(await writeArchive(duplicateZip)),
      throwsA(isA<DatasetBundleException>()),
    );

    final duplicateIds = _zip({
      'manifest.json': utf8.encode(
        jsonEncode(
          _manifest([
            _case('case-1', 'images/a.jpg', image),
            _case('case-1', 'images/b.jpg', image),
          ]),
        ),
      ),
      'images/a.jpg': image,
      'images/b.jpg': image,
    });
    await expectLater(
      install(await writeArchive(duplicateIds)),
      throwsA(isA<DatasetBundleException>()),
    );
  });

  test('rejects missing images and malformed ZIP files', () async {
    final image = utf8.encode('image');
    final missing = _zip({
      'manifest.json': utf8.encode(
        jsonEncode(_manifest([_case('case-1', 'images/missing.jpg', image)])),
      ),
    });
    await expectLater(
      install(await writeArchive(missing)),
      throwsA(isA<DatasetBundleException>()),
    );
    await expectLater(
      install(await writeArchive(utf8.encode('not a zip'))),
      throwsA(isA<DatasetBundleException>()),
    );
  });

  test(
    'rejects expanded content over the configured limit before installation',
    () async {
      final large = List<int>.filled(128, 7);
      final zip = _zip({
        'manifest.json': utf8.encode(
          jsonEncode(_manifest([_case('case-1', 'images/large.jpg', large)])),
        ),
        'images/large.jpg': large,
      });
      final file = await writeArchive(zip);

      expect(DatasetBundleLoader.maximumExpandedBytes, 1024 * 1024 * 1024);
      await expectLater(
        loader.install(
          archiveFile: file,
          datasetsDirectory: datasetsDirectory,
          expectedDatasetVersionId: 'dataset-version-1',
          expectedArchiveSha256: sha256.convert(zip).toString(),
          expectedDatasetId: 'dataset-1',
          expectedVersion: '1.0.0',
          expectedPartition: 'test',
          expectedSource: 'Colección de tesis',
          expectedLicense: 'CC BY 4.0',
          maxExpandedBytes: 64,
        ),
        throwsA(isA<DatasetBundleException>()),
      );
    },
  );

  test(
    'rejects ZIP size claims above 1 GiB before expanding any entry',
    () async {
      final image = List<int>.filled(1024, 7);
      final zip = _zip({
        'manifest.json': utf8.encode(
          jsonEncode(_manifest([_case('case-1', 'images/large.jpg', image)])),
        ),
        'images/large.jpg': image,
      });
      final forged = _rewriteUncompressedSize(
        zip,
        'images/large.jpg',
        DatasetBundleLoader.maximumExpandedBytes + 1,
      );
      final file = await writeArchive(forged);

      await expectLater(install(file), throwsA(isA<DatasetBundleException>()));
    },
  );

  test(
    'bounds actual DEFLATE output when archive size metadata is understated',
    () async {
      final image = List<int>.filled(1024 * 1024, 7);
      final zip = _zip({
        'manifest.json': utf8.encode(
          jsonEncode(_manifest([_case('case-1', 'images/large.jpg', image)])),
        ),
        'images/large.jpg': image,
      });
      final forged = _rewriteUncompressedSize(zip, 'images/large.jpg', 1);

      await expectLater(
        install(await writeArchive(forged)),
        throwsA(isA<DatasetBundleException>()),
      );
    },
  );

  test(
    'does not replace a verified directory when a later install fails',
    () async {
      final image = utf8.encode('verified-image');
      final good = _zip({
        'manifest.json': utf8.encode(
          jsonEncode(_manifest([_case('case-1', 'images/a.jpg', image)])),
        ),
        'images/a.jpg': image,
      });
      final first = await install(await writeArchive(good));
      final bad = _zip({
        'manifest.json': utf8.encode(
          jsonEncode(
            _manifest([_case('case-1', 'images/a.jpg', image, hash: 'f' * 64)]),
          ),
        ),
        'images/a.jpg': image,
      });

      await expectLater(
        install(await writeArchive(bad)),
        throwsA(isA<DatasetBundleException>()),
      );

      expect(await File(first.cases.single.localPath).readAsBytes(), image);
    },
  );
}

List<int> _zip(Map<String, List<int>> files) {
  final archive = Archive();
  for (final entry in files.entries) {
    archive.addFile(ArchiveFile.bytes(entry.key, entry.value));
  }
  return ZipEncoder().encode(archive);
}

Map<String, Object?> _manifest(List<Map<String, Object?>> cases) => {
  'schemaVersion': '1',
  'datasetId': 'dataset-1',
  'version': '1.0.0',
  'partition': 'test',
  'source': 'Colección de tesis',
  'license': 'CC BY 4.0',
  'cases': cases,
};

Map<String, Object?> _case(
  String caseId,
  String path,
  List<int> bytes, {
  String? hash,
}) => {
  'scenario': 'PERF-02',
  'caseId': caseId,
  'path': path,
  'sha256': hash ?? sha256.convert(bytes).toString(),
};

Uint8List _rewriteUncompressedSize(
  List<int> archiveBytes,
  String targetName,
  int declaredSize,
) {
  final bytes = Uint8List.fromList(archiveBytes);
  final data = ByteData.sublistView(bytes);
  var eocd = -1;
  for (
    var offset = bytes.length - 22;
    offset >= max(0, bytes.length - 22 - 65535);
    offset--
  ) {
    if (data.getUint32(offset, Endian.little) == 0x06054b50 &&
        offset + 22 + data.getUint16(offset + 20, Endian.little) ==
            bytes.length) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw StateError('Generated ZIP has no end record.');
  final count = data.getUint16(eocd + 10, Endian.little);
  final centralOffset = data.getUint32(eocd + 16, Endian.little);
  var cursor = centralOffset;
  for (var index = 0; index < count; index++) {
    final nameLength = data.getUint16(cursor + 28, Endian.little);
    final extraLength = data.getUint16(cursor + 30, Endian.little);
    final commentLength = data.getUint16(cursor + 32, Endian.little);
    final name = utf8.decode(
      bytes.sublist(cursor + 46, cursor + 46 + nameLength),
    );
    if (name == targetName) {
      final localOffset = data.getUint32(cursor + 42, Endian.little);
      data.setUint32(cursor + 24, declaredSize, Endian.little);
      data.setUint32(localOffset + 22, declaredSize, Endian.little);
      return bytes;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw StateError('Generated ZIP does not contain $targetName.');
}
