import 'dart:convert';
import 'dart:io';

import 'package:better_fullstack_app/validation/data/validation_model_repository.dart';
import 'package:better_fullstack_app/validation/execution/validation_condition_runner.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory temporaryDirectory;
  late _ModelServer server;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp('ayni-model-');
    server = _ModelServer()..modelBytes = [1, 2, 3, 4, 5];
    await server.start();
  });

  tearDown(() async {
    await server.close();
    if (await temporaryDirectory.exists()) {
      await temporaryDirectory.delete(recursive: true);
    }
  });

  test(
    'authenticates only the manifest and verifies the signed artifact hash',
    () async {
      final repository = _repository(server, temporaryDirectory);
      addTearDown(repository.close);

      final profile = _profile(sha256.convert(server.modelBytes).toString());
      final verified = await repository.prepare(profile);

      expect(verified.modelVersionId, 'model-version-1');
      expect(verified.sha256, sha256.convert(server.modelBytes).toString());
      expect(await verified.file.readAsBytes(), server.modelBytes);
      expect(server.manifestAuthorization, 'Bearer private-credential');
      expect(server.objectAuthorization, isNull);
    },
  );

  test('refreshes a signed model URL once after an expired request', () async {
    server.expireFirstDownload = true;
    final repository = _repository(server, temporaryDirectory);
    addTearDown(repository.close);

    final verified = await repository.prepare(
      _profile(sha256.convert(server.modelBytes).toString()),
    );

    expect(server.manifestRequests, 2);
    expect(server.objectRequests, 2);
    expect(await verified.file.readAsBytes(), server.modelBytes);
  });

  test(
    'rejects a model whose downloaded bytes do not match its manifest digest',
    () async {
      final expectedSha = sha256.convert(server.modelBytes).toString();
      server.manifestSha256 = expectedSha;
      server.modelBytes = [1, 2, 3, 4, 6];
      final repository = _repository(server, temporaryDirectory);
      addTearDown(repository.close);

      await expectLater(
        repository.prepare(_profile(expectedSha)),
        throwsA(
          isA<ValidationExecutionException>().having(
            (error) => error.code,
            'code',
            'modelHashMismatch',
          ),
        ),
      );
      expect(
        await File(
          '${temporaryDirectory.path}${Platform.pathSeparator}model-version-1${Platform.pathSeparator}model.tflite',
        ).exists(),
        isFalse,
      );
    },
  );

  test(
    'rejects an artifact contract that differs from the selected profile',
    () async {
      server.contract = {
        'input': {
          'type': 'image',
          'width': 224,
          'height': 224,
          'channels': 3,
          'normalization': 'none',
        },
        'output': {
          'type': 'classification',
          'labels': ['sana', 'roya', 'minador'],
        },
      };
      final repository = _repository(server, temporaryDirectory);
      addTearDown(repository.close);

      await expectLater(
        repository.prepare(
          _profile(sha256.convert(server.modelBytes).toString()),
        ),
        throwsA(
          isA<ValidationExecutionException>().having(
            (error) => error.code,
            'code',
            'modelManifestMismatch',
          ),
        ),
      );
      expect(server.objectAuthorization, isNull);
    },
  );
}

HttpValidationModelRepository _repository(
  _ModelServer server,
  Directory temporaryDirectory,
) => HttpValidationModelRepository(
  serverUrl: server.baseUrl,
  credential: 'private-credential',
  modelsDirectory: temporaryDirectory,
  allowInsecureLoopback: true,
  now: () => DateTime.utc(2030),
);

class _ModelServer {
  late HttpServer _server;
  late Uri baseUrl;
  List<int> modelBytes = const [];
  String? manifestSha256;
  Map<String, Object?> contract = {
    'input': {
      'type': 'image',
      'width': 224,
      'height': 224,
      'channels': 3,
      'normalization': 'zero_to_one',
    },
    'output': {
      'type': 'classification',
      'labels': ['sana', 'roya', 'minador'],
    },
  };
  String? manifestAuthorization;
  String? objectAuthorization;
  int manifestRequests = 0;
  int objectRequests = 0;
  bool expireFirstDownload = false;

  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    baseUrl = Uri.parse('http://127.0.0.1:${_server.port}');
    _server.listen((request) async {
      if (request.uri.path == '/sdk/model-versions/model-version-1/manifest') {
        manifestRequests++;
        manifestAuthorization = request.headers.value(
          HttpHeaders.authorizationHeader,
        );
        final bytes = modelBytes;
        final signedPath = expireFirstDownload && manifestRequests == 1
            ? '/signed/expired-model.tflite'
            : '/signed/model.tflite';
        final manifest = {
          'manifest': {
            'modelVersionId': 'model-version-1',
            'version': '1.0.0',
            'sha256': manifestSha256 ?? sha256.convert(bytes).toString(),
            'sizeBytes': bytes.length,
            'downloadUrl': baseUrl.resolve(signedPath).toString(),
            'downloadUrlExpiresAt': DateTime.utc(2031).toIso8601String(),
            'contract': contract,
          },
        };
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode(manifest));
      } else if (request.uri.path.startsWith('/signed/')) {
        objectRequests++;
        objectAuthorization = request.headers.value(
          HttpHeaders.authorizationHeader,
        );
        if (request.uri.path == '/signed/expired-model.tflite') {
          request.response.statusCode = HttpStatus.forbidden;
        } else {
          request.response.add(modelBytes);
        }
      } else {
        request.response.statusCode = HttpStatus.notFound;
      }
      await request.response.close();
    });
  }

  Future<void> close() => _server.close(force: true);
}

ValidationResourceProfile _profile(String modelSha256) =>
    ValidationResourceProfile(
      id: 'coffee',
      datasetVersionId: 'dataset-version-1',
      datasetPartition: 'test',
      datasetSha256: 'a' * 64,
      controlModelVersionId: 'model-version-1',
      controlModelSha256: modelSha256,
      treatmentWorkflowId: 'workflow-1',
      treatmentWorkflowVersionId: 'workflow-version-1',
      treatmentWorkflowVersion: '1.0.0',
      treatmentModelVersionId: 'model-version-1',
      treatmentModelSha256: modelSha256,
      inputContract: const ValidationInputContract(
        width: 224,
        height: 224,
        channels: 3,
        normalization: 'zero_to_one',
      ),
      outputContract: [
        ValidationOutputContract(
          name: 'classification',
          resultType: ValidationResultType.classification,
          labels: ['sana', 'roya', 'minador'],
        ),
      ],
    );
