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

      final requirement = _requirement(
        sha256.convert(server.modelBytes).toString(),
      );
      expect(
        modelContractMatchesRequirement(server.contract!, requirement),
        isTrue,
      );
      final verified = await repository.prepare(requirement);

      expect(verified.modelVersionId, 'model-version-1');
      expect(verified.sha256, sha256.convert(server.modelBytes).toString());
      expect(await verified.file.readAsBytes(), server.modelBytes);
      expect(server.manifestAuthorization, 'Bearer private-credential');
      expect(server.objectAuthorization, isNull);
    },
  );

  test('verifies explicit detector roles in a model contract', () async {
    server.contract = {
      'input': {
        'type': 'image',
        'width': 320,
        'height': 320,
        'channels': 3,
        'normalization': 'zero_to_one',
      },
      'output': {
        'type': 'detection',
        'labels': ['coffee'],
        'scoreThreshold': 0.5,
        'tensorIndices': {'boxes': 0, 'classes': 1, 'scores': 2, 'count': 3},
      },
    };
    final requirement = ValidationModelRequirement(
      nodeId: 'detector-node',
      modelVersionId: 'model-version-1',
      sha256: sha256.convert(server.modelBytes).toString(),
      inputContract: const ValidationInputContract(
        width: 320,
        height: 320,
        channels: 3,
        normalization: 'zero_to_one',
      ),
      modelOutputContract: ValidationModelOutputContract(
        resultType: ValidationResultType.detection,
        labels: ['coffee'],
        scoreThreshold: 0.5,
        tensorIndices: const {
          'boxes': 0,
          'classes': 1,
          'scores': 2,
          'count': 3,
        },
      ),
    );
    final repository = _repository(server, temporaryDirectory);
    addTearDown(repository.close);

    final artifact = await repository.prepare(requirement);

    expect(artifact.modelVersionId, requirement.modelVersionId);
    expect(
      modelContractMatchesRequirement(server.contract!, requirement),
      isTrue,
    );
  });

  test('reads the model digest when the manifest contract is null', () async {
    server.contract = null;
    final repository = _repository(server, temporaryDirectory);
    addTearDown(repository.close);

    expect(
      await repository.fetchSha256('model-version-1'),
      sha256.convert(server.modelBytes).toString(),
    );
    expect(server.objectRequests, 0);
  });

  test('refreshes a signed model URL once after an expired request', () async {
    server.expireFirstDownload = true;
    final repository = _repository(server, temporaryDirectory);
    addTearDown(repository.close);

    final verified = await repository.prepare(
      _requirement(sha256.convert(server.modelBytes).toString()),
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
        repository.prepare(_requirement(expectedSha)),
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
          _requirement(sha256.convert(server.modelBytes).toString()),
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

  test(
    'prepares each model requirement independently within a profile',
    () async {
      final repository = _repository(server, temporaryDirectory);
      addTearDown(repository.close);
      final firstBytes = server.modelBytes;
      final first = await repository.prepare(
        _requirement(sha256.convert(firstBytes).toString()),
      );

      server.modelVersionId = 'model-version-2';
      server.modelBytes = [9, 8, 7, 6];
      final secondBytes = server.modelBytes;
      final second = await repository.prepare(
        _requirement(
          sha256.convert(secondBytes).toString(),
          nodeId: 'detector-node',
          modelVersionId: 'model-version-2',
        ),
      );

      expect(first.modelVersionId, 'model-version-1');
      expect(second.modelVersionId, 'model-version-2');
      expect(await first.file.readAsBytes(), firstBytes);
      expect(await second.file.readAsBytes(), secondBytes);
      expect(server.manifestRequests, 2);
      expect(server.objectRequests, 2);
    },
  );

  test(
    'keeps an earlier verified artifact when a later model download fails',
    () async {
      final repository = _repository(server, temporaryDirectory);
      addTearDown(repository.close);
      final first = await repository.prepare(
        _requirement(sha256.convert(server.modelBytes).toString()),
      );
      server.modelVersionId = 'model-version-2';
      server.forceDownloadFailure = true;

      await expectLater(
        repository.prepare(
          _requirement(
            sha256.convert(server.modelBytes).toString(),
            nodeId: 'detector-node',
            modelVersionId: 'model-version-2',
          ),
        ),
        throwsA(
          isA<ValidationExecutionException>().having(
            (error) => error.code,
            'code',
            'modelDownloadFailed',
          ),
        ),
      );
      expect(await first.file.readAsBytes(), [1, 2, 3, 4, 5]);
    },
  );

  group('segmentation contracts', () {
    const labels = ['background', 'person'];
    ValidationModelRequirement requirement({String scoreType = 'logits'}) =>
        ValidationModelRequirement(
          nodeId: 'seg-node',
          modelVersionId: 'model-version-1',
          sha256: 'b' * 64,
          inputContract: const ValidationInputContract(
            width: 257,
            height: 257,
            channels: 3,
            normalization: 'minus_one_to_one',
          ),
          modelOutputContract: ValidationModelOutputContract(
            resultType: ValidationResultType.segmentation,
            labels: labels,
            scoreType: scoreType,
          ),
        );
    Map<String, Object?> contract({Map<String, Object?>? output}) => {
      'input': {
        'type': 'image',
        'width': 257,
        'height': 257,
        'channels': 3,
        'normalization': 'minus_one_to_one',
      },
      'output':
          output ??
          {'type': 'segmentation', 'labels': labels, 'scoreType': 'logits'},
    };

    test('accepts the segmentation contract the profile declares', () {
      expect(
        modelContractMatchesRequirement(contract(), requirement()),
        isTrue,
      );
    });

    test('rejects another scoreType, labels, keys or type', () {
      expect(
        modelContractMatchesRequirement(
          contract(),
          requirement(scoreType: 'probabilities'),
        ),
        isFalse,
      );
      for (final output in <Map<String, Object?>>[
        {'type': 'segmentation', 'labels': labels},
        {'type': 'segmentation', 'labels': labels, 'scoreType': 'softmax'},
        {
          'type': 'segmentation',
          'labels': ['background', 'car'],
          'scoreType': 'logits',
        },
        {
          'type': 'segmentation',
          'labels': labels,
          'scoreType': 'logits',
          'extra': true,
        },
        {'type': 'classification', 'labels': labels},
      ]) {
        expect(
          modelContractMatchesRequirement(
            contract(output: output),
            requirement(),
          ),
          isFalse,
          reason: '$output',
        );
      }
    });

    test('a classification contract may not declare a scoreType', () {
      expect(
        modelContractMatchesRequirement(
          contract(
            output: {
              'type': 'classification',
              'labels': labels,
              'scoreType': 'logits',
            },
          ),
          ValidationModelRequirement(
            nodeId: 'node',
            modelVersionId: 'model-version-1',
            sha256: 'b' * 64,
            inputContract: const ValidationInputContract(
              width: 257,
              height: 257,
              channels: 3,
              normalization: 'minus_one_to_one',
            ),
            modelOutputContract: ValidationModelOutputContract(
              resultType: ValidationResultType.classification,
              labels: labels,
            ),
          ),
        ),
        isFalse,
      );
    });
  });
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
  String modelVersionId = 'model-version-1';
  String? manifestSha256;
  Map<String, Object?>? contract = {
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
  bool forceDownloadFailure = false;

  Future<void> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    baseUrl = Uri.parse('http://127.0.0.1:${_server.port}');
    _server.listen((request) async {
      if (request.uri.path == '/sdk/model-versions/$modelVersionId/manifest') {
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
            'modelVersionId': modelVersionId,
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
        } else if (forceDownloadFailure) {
          request.response.statusCode = HttpStatus.internalServerError;
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

ValidationModelRequirement _requirement(
  String modelSha256, {
  String nodeId = 'classifier-node',
  String modelVersionId = 'model-version-1',
}) => ValidationModelRequirement(
  nodeId: nodeId,
  modelVersionId: modelVersionId,
  sha256: modelSha256,
  inputContract: const ValidationInputContract(
    width: 224,
    height: 224,
    channels: 3,
    normalization: 'zero_to_one',
  ),
  modelOutputContract: ValidationModelOutputContract(
    resultType: ValidationResultType.classification,
    labels: ['sana', 'roya', 'minador'],
  ),
);
