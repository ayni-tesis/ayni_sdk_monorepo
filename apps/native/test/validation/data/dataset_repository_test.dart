import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:better_fullstack_app/validation/data/dataset_manifest.dart';
import 'package:better_fullstack_app/validation/data/dataset_bundle_loader.dart';
import 'package:better_fullstack_app/validation/data/dataset_repository.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory temporaryDirectory;
  late Directory datasetsDirectory;
  late List<int> archiveBytes;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'ayni-dataset-repository-',
    );
    datasetsDirectory = Directory(
      '${temporaryDirectory.path}${Platform.pathSeparator}datasets',
    );
    await datasetsDirectory.create();
    final image = utf8.encode('image-bytes');
    final manifest = {
      'schemaVersion': '1',
      'datasetId': 'dataset-1',
      'version': '1.0.0',
      'partition': 'test',
      'source': 'Colección de tesis',
      'license': 'CC BY 4.0',
      'cases': [
        {
          'scenario': 'PERF-02',
          'caseId': 'case-1',
          'path': 'images/a.jpg',
          'sha256': sha256.convert(image).toString(),
        },
      ],
    };
    final archive = Archive()
      ..addFile(ArchiveFile.string('manifest.json', jsonEncode(manifest)))
      ..addFile(ArchiveFile.bytes('images/a.jpg', image));
    archiveBytes = ZipEncoder().encode(archive);
  });

  tearDown(() async {
    if (await temporaryDirectory.exists()) {
      await temporaryDirectory.delete(recursive: true);
    }
  });

  DatasetRepository repository0(_FakeTransport transport) => DatasetRepository(
    transport: transport,
    datasetsDirectory: datasetsDirectory,
    datasetVersionId: 'dataset-version-1',
    expectedArchiveSha256: sha256.convert(archiveBytes).toString(),
    expectedPartition: 'test',
    now: () => DateTime.utc(2026, 10, 4, 18),
  );

  test('refreshes an expired signed URL before downloading the ZIP', () async {
    final transport = _FakeTransport(archiveBytes);
    final repository = repository0(transport);

    final result = await repository.prepare('dataset-version-1');

    expect(transport.manifestRequests, 2);
    expect(transport.downloadRequests, 1);
    expect(result.cases.single.caseId, 'case-1');
  });

  test('sends the SDK bearer only to the manifest endpoint', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    String? manifestAuthorization;
    String? objectAuthorization;
    final subscription = server.listen((request) async {
      if (request.uri.path.endsWith('/manifest')) {
        manifestAuthorization = request.headers.value(
          HttpHeaders.authorizationHeader,
        );
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode({
            'manifest': {
              'datasetVersionId': 'dataset-version-1',
              'datasetId': 'dataset-1',
              'version': '1.0.0',
              'partition': 'test',
              'source': 'Colección de tesis',
              'license': 'CC BY 4.0',
              'sha256': sha256.convert(archiveBytes).toString(),
              'sizeBytes': archiveBytes.length,
              'downloadUrl':
                  'http://127.0.0.1:${server.port}/object?signature=temporary',
              'downloadUrlExpiresAt': '2026-10-04T23:59:59.000Z',
            },
          }),
        );
      } else {
        objectAuthorization = request.headers.value(
          HttpHeaders.authorizationHeader,
        );
        request.response.add(archiveBytes);
      }
      await request.response.close();
    });
    final transport = HttpDatasetTransport(
      serverUrl: Uri.parse('http://127.0.0.1:${server.port}'),
      credential: 'ayni_sk_secret',
      allowInsecureLoopback: true,
    );
    try {
      final manifest = await transport.fetchManifest('dataset-version-1');
      final file = await transport.downloadArchive(
        manifest,
        temporaryDirectory: temporaryDirectory,
      );

      expect(manifestAuthorization, 'Bearer ayni_sk_secret');
      expect(objectAuthorization, isNull);
      expect(await file.readAsBytes(), archiveBytes);
      await file.delete();
    } finally {
      transport.close(force: true);
      await subscription.cancel();
      await server.close(force: true);
    }
  });

  test('reopens the verified cache without requiring network access', () async {
    final transport = _FakeTransport(archiveBytes);
    final repository = repository0(transport);
    final first = await repository.prepare('dataset-version-1');
    transport.offline = true;

    final reopened = await repository.prepare('dataset-version-1');

    expect(reopened.directory.path, first.directory.path);
    expect(transport.manifestRequests, 2);
    expect(transport.downloadRequests, 1);
  });

  test(
    'rejects a locally modified image instead of running it from cache',
    () async {
      final transport = _FakeTransport(archiveBytes);
      final repository = repository0(transport);
      final verified = await repository.prepare('dataset-version-1');
      await File(verified.cases.single.localPath).writeAsString('modified');
      transport.offline = true;

      await expectLater(
        repository.prepare('dataset-version-1'),
        throwsA(isA<DatasetTransportException>()),
      );
      expect(transport.downloadRequests, 1);
    },
  );

  test(
    'keeps the last verified local dataset if a refreshed install is invalid',
    () async {
      final transport = _FakeTransport(archiveBytes);
      final repository = repository0(transport);
      final first = await repository.prepare('dataset-version-1');
      transport.archiveBytes = utf8.encode('malformed zip');

      await expectLater(
        repository.prepare('dataset-version-1', forceRefresh: true),
        throwsA(isA<DatasetBundleException>()),
      );

      expect(
        await File(first.cases.single.localPath).readAsBytes(),
        utf8.encode('image-bytes'),
      );
    },
  );
}

class _FakeTransport implements DatasetTransport {
  _FakeTransport(this.archiveBytes)
    : expectedSha256 = sha256.convert(archiveBytes).toString();

  List<int> archiveBytes;
  final String expectedSha256;
  int manifestRequests = 0;
  int downloadRequests = 0;
  bool offline = false;

  @override
  Future<DatasetManifest> fetchManifest(String datasetVersionId) async {
    if (offline) {
      throw const DatasetTransportException(DatasetTransportErrorCode.offline);
    }
    manifestRequests++;
    final expires = manifestRequests == 1
        ? '2026-10-04T17:59:59.000Z'
        : '2026-10-04T18:15:00.000Z';
    return DatasetManifest.fromJson({
      'manifest': {
        'datasetVersionId': datasetVersionId,
        'datasetId': 'dataset-1',
        'version': '1.0.0',
        'partition': 'test',
        'source': 'Colección de tesis',
        'license': 'CC BY 4.0',
        'sha256': expectedSha256,
        'sizeBytes': archiveBytes.length,
        'downloadUrl': 'https://storage.example.test/dataset.zip',
        'downloadUrlExpiresAt': expires,
      },
    });
  }

  @override
  Future<File> downloadArchive(
    DatasetManifest manifest, {
    required Directory temporaryDirectory,
    void Function(int receivedBytes, int totalBytes)? onProgress,
  }) async {
    if (offline) {
      throw const DatasetTransportException(DatasetTransportErrorCode.offline);
    }
    downloadRequests++;
    final file = File(
      '${temporaryDirectory.path}${Platform.pathSeparator}download-$downloadRequests.zip',
    );
    await file.writeAsBytes(archiveBytes);
    onProgress?.call(archiveBytes.length, archiveBytes.length);
    return file;
  }
}
