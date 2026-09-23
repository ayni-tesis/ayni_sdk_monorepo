import 'dart:async';
import 'dart:io';

import 'package:test/test.dart';

import '../lib/src/model_artifact_downloader.dart';

void main() {
  late Directory temporaryDirectory;
  late HttpServer server;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'model-downloader-test-',
    );
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(
      server.forEach((request) async {
        request.response
          ..statusCode = HttpStatus.ok
          ..add('fresh model'.codeUnits);
        await request.response.close();
      }),
    );
  });

  tearDown(() async {
    await server.close(force: true);
    await temporaryDirectory.delete(recursive: true);
  });

  test(
    'retries with an isolated artifact when the legacy temporary path is stale',
    () async {
      final legacyArtifact = File('${temporaryDirectory.path}/model.part');
      await legacyArtifact.writeAsString('interrupted model');

      final result = await ModelArtifactDownloader().download(
        manifest: _manifest(server.port),
        temporaryArtifact: legacyArtifact,
        httpClient: _RewritingHttpClient(HttpClient(), server.port),
      );

      expect(result.status, ModelArtifactDownloadStatus.downloaded);
      expect(await legacyArtifact.readAsString(), 'interrupted model');
      expect(result.temporaryArtifact, isNot(legacyArtifact.path));
      expect(
        await File(result.temporaryArtifact!).readAsString(),
        'fresh model',
      );
    },
  );

  test(
    'concurrent downloads do not share or delete attempt artifacts',
    () async {
      final legacyArtifact = File('${temporaryDirectory.path}/model.part');
      final downloader = ModelArtifactDownloader();

      final results = await Future.wait([
        downloader.download(
          manifest: _manifest(server.port),
          temporaryArtifact: legacyArtifact,
          httpClient: _RewritingHttpClient(HttpClient(), server.port),
        ),
        downloader.download(
          manifest: _manifest(server.port),
          temporaryArtifact: legacyArtifact,
          httpClient: _RewritingHttpClient(HttpClient(), server.port),
        ),
      ]);

      expect(
        results.map((result) => result.status),
        everyElement(ModelArtifactDownloadStatus.downloaded),
      );
      expect(
        results.map((result) => result.temporaryArtifact!).toSet(),
        hasLength(2),
      );
      for (final result in results) {
        expect(
          await File(result.temporaryArtifact!).readAsString(),
          'fresh model',
        );
      }
    },
  );
}

ModelDownloadManifest _manifest(int port) => ModelDownloadManifest(
  modelVersionId: 'version-1',
  version: '1.0.0',
  sha256: 'unused-in-downloader-test',
  sizeBytes: 'fresh model'.length,
  downloadUrl: Uri.parse('https://localhost:$port/model.tflite'),
  downloadUrlExpiresAt: DateTime.now().add(const Duration(minutes: 5)),
);

class _RewritingHttpClient implements HttpClient {
  _RewritingHttpClient(this._delegate, this._port);

  final HttpClient _delegate;
  final int _port;

  @override
  Future<HttpClientRequest> getUrl(Uri url) => _delegate.getUrl(
    url.replace(
      scheme: 'http',
      host: InternetAddress.loopbackIPv4.address,
      port: _port,
    ),
  );

  @override
  void close({bool force = false}) => _delegate.close(force: force);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
