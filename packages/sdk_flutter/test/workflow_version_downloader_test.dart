import 'dart:async';
import 'dart:io';

import 'package:test/test.dart';

import '../lib/src/workflow_version_downloader.dart';

void main() {
  late Directory temporaryDirectory;
  late HttpServer server;
  final requests = <HttpRequest>[];
  var statusCode = HttpStatus.ok;

  setUp(() async {
    requests.clear();
    statusCode = HttpStatus.ok;
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'workflow-downloader-test-',
    );
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    unawaited(
      server.forEach((request) async {
        requests.add(request);
        request.response.statusCode = statusCode;
        if (statusCode == HttpStatus.ok) {
          request.response.add('{"nodes":[],"connections":[]}'.codeUnits);
        }
        await request.response.close();
      }),
    );
  });

  tearDown(() async {
    await server.close(force: true);
    await temporaryDirectory.delete(recursive: true);
  });

  Future<WorkflowVersionDownloadResult> download(File temporaryDefinition) =>
      WorkflowVersionDownloader().download(
        serverUrl: Uri.parse('https://localhost:${server.port}/ignored'),
        credential: 'ayni_sk_test',
        workflowVersionId: 'workflow-version-1',
        workflowName: 'Clasificar hoja',
        temporaryDefinition: temporaryDefinition,
        httpClient: _RewritingHttpClient(HttpClient(), server.port),
      );

  test(
    'downloads the immutable definition into an isolated temporary file',
    () async {
      final staleDefinition = File('${temporaryDirectory.path}/workflow.part');
      await staleDefinition.writeAsString('{"stale":true}');
      final messages = <String>[];

      final result = await WorkflowVersionDownloader().download(
        serverUrl: Uri.parse('https://localhost:${server.port}/ignored'),
        credential: 'ayni_sk_test',
        workflowVersionId: 'workflow-version-1',
        workflowName: 'Clasificar hoja',
        temporaryDefinition: staleDefinition,
        onProgress: messages.add,
        httpClient: _RewritingHttpClient(HttpClient(), server.port),
      );

      expect(result.status, WorkflowVersionDownloadStatus.downloaded);
      expect(result.temporaryDefinition, isNot(staleDefinition.path));
      expect(await staleDefinition.readAsString(), '{"stale":true}');
      expect(
        await File(result.temporaryDefinition!).readAsString(),
        '{"nodes":[],"connections":[]}',
      );
      expect(messages, ['Descargando workflow Clasificar hoja…']);
      expect(
        requests.single.uri.path,
        '/sdk/workflow-versions/workflow-version-1',
      );
      expect(
        requests.single.headers.value(HttpHeaders.authorizationHeader),
        'Bearer ayni_sk_test',
      );
    },
  );

  test(
    'reports an unavailable workflow without changing the temporary file',
    () async {
      statusCode = HttpStatus.notFound;
      final staleDefinition = File('${temporaryDirectory.path}/workflow.part');
      await staleDefinition.writeAsString('{"previous":true}');

      final result = await download(staleDefinition);

      expect(result.status, WorkflowVersionDownloadStatus.workflowUnavailable);
      expect(
        result.message,
        'El workflow ya no está disponible. Se mantuvo la versión anterior.',
      );
      expect(result.temporaryDefinition, isNull);
      expect(await staleDefinition.readAsString(), '{"previous":true}');
    },
  );
}

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
