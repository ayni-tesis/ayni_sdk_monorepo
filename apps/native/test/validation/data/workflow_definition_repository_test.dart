import 'dart:convert';
import 'dart:io';

import 'package:better_fullstack_app/validation/data/workflow_definition_repository.dart';
import 'package:better_fullstack_app/validation/execution/validation_condition_runner.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late HttpServer server;
  late String? authorization;
  late String? requestedPath;
  late int responseStatus;

  setUp(() async {
    authorization = null;
    requestedPath = null;
    responseStatus = HttpStatus.ok;
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      authorization = request.headers.value(HttpHeaders.authorizationHeader);
      requestedPath = request.uri.path;
      request.response.statusCode = responseStatus;
      if (responseStatus == HttpStatus.ok) {
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode({
            'schemaVersion': '1',
            'nodes': <Object?>[],
            'connections': <Object?>[],
          }),
        );
      }
      await request.response.close();
    });
  });

  tearDown(() => server.close(force: true));

  test(
    'fetches the immutable definition through its SDK-authenticated route',
    () async {
      final repository = HttpWorkflowDefinitionRepository(
        serverUrl: Uri.parse('http://127.0.0.1:${server.port}'),
        credential: 'private-credential',
        allowInsecureLoopback: true,
      );
      addTearDown(repository.close);

      final definition = await repository.fetch('workflow-version-1');

      expect(requestedPath, '/sdk/workflow-versions/workflow-version-1');
      expect(authorization, 'Bearer private-credential');
      expect(definition['schemaVersion'], '1');
      expect(definition['nodes'], isEmpty);
    },
  );

  test(
    'rejects identifiers that could escape the workflow-version route',
    () async {
      final repository = HttpWorkflowDefinitionRepository(
        serverUrl: Uri.parse('http://127.0.0.1:${server.port}'),
        credential: 'private-credential',
        allowInsecureLoopback: true,
      );
      addTearDown(repository.close);

      await expectLater(
        repository.fetch('../other'),
        throwsA(isA<ValidationExecutionException>()),
      );
      expect(requestedPath, isNull);
    },
  );

  test('maps a non-200 download to workflowVersionUnavailable', () async {
    responseStatus = HttpStatus.notFound;
    final repository = HttpWorkflowDefinitionRepository(
      serverUrl: Uri.parse('http://127.0.0.1:${server.port}'),
      credential: 'private-credential',
      allowInsecureLoopback: true,
    );
    addTearDown(repository.close);

    await expectLater(
      repository.fetch('workflow-version-1'),
      throwsA(
        isA<ValidationExecutionException>().having(
          (error) => error.code,
          'code',
          'workflowVersionUnavailable',
        ),
      ),
    );
  });
}
