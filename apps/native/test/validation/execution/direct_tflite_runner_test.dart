import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:better_fullstack_app/validation/data/validation_model_repository.dart';
import 'package:better_fullstack_app/validation/execution/direct_tflite_runner.dart';
import 'package:better_fullstack_app/validation/execution/validation_condition_runner.dart';
import 'package:better_fullstack_app/validation/execution/validation_image_preprocessor.dart';
import 'package:better_fullstack_app/validation/execution/validation_output_normalizer.dart';
import 'package:better_fullstack_app/validation/models/experiment_plan.dart';
import 'package:better_fullstack_app/validation/models/validation_run_record.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory temporaryDirectory;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp('ayni-direct-');
  });

  tearDown(() async {
    if (await temporaryDirectory.exists()) {
      await temporaryDirectory.delete(recursive: true);
    }
  });

  test(
    'passes the original image bytes to the CPU engine and reports exact model metadata',
    () async {
      final imageBytes = Uint8List.fromList([1, 2, 3, 4]);
      final modelFile = File('${temporaryDirectory.path}/model.tflite')
        ..writeAsBytesSync([7, 8, 9]);
      final repository = _ModelRepository(
        VerifiedModelArtifact(
          file: modelFile,
          modelVersionId: 'model-version-1',
          sha256: 'b' * 64,
          version: '1.0.0',
          contract: _modelContract(),
        ),
      );
      final engine = _FakeCpuEngine();
      final runner = DirectTfliteRunner(
        profile: _profile(),
        modelRepository: repository,
        inferenceEngine: engine,
      );
      await runner.prepare();
      final result = await runner.runCase(_request(imageBytes));

      expect(runner.condition, ValidationCondition.control);
      expect(runner.backend, 'CPU');
      expect(engine.receivedImageBytes, imageBytes);
      expect(result.outcome, ValidationRunOutcome.success);
      expect(result.modelVersionId, 'model-version-1');
      expect(result.modelSha256, 'b' * 64);
      expect(result.normalizedOutput, {
        'classification': {
          'type': 'classification',
          'label': 'roya',
          'confidence': 0.8,
          'confidences': {'sana': 0.1, 'roya': 0.8, 'minador': 0.1},
        },
      });
    },
  );

  test(
    'refuses a model artifact whose version or digest differs from the plan',
    () async {
      final modelFile = File('${temporaryDirectory.path}/model.tflite')
        ..writeAsBytesSync([7, 8, 9]);
      final runner = DirectTfliteRunner(
        profile: _profile(),
        modelRepository: _ModelRepository(
          VerifiedModelArtifact(
            file: modelFile,
            modelVersionId: 'another-model-version',
            sha256: 'b' * 64,
            version: '1.0.0',
            contract: _modelContract(),
          ),
        ),
        inferenceEngine: _FakeCpuEngine(),
      );

      await expectLater(
        runner.prepare(),
        throwsA(isA<ValidationExecutionException>()),
      );
    },
  );

  test(
    'refuses the expected version when its manifest SHA-256 differs',
    () async {
      final modelFile = File('${temporaryDirectory.path}/model.tflite')
        ..writeAsBytesSync([7, 8, 9]);
      final runner = DirectTfliteRunner(
        profile: _profile(),
        modelRepository: _ModelRepository(
          VerifiedModelArtifact(
            file: modelFile,
            modelVersionId: 'model-version-1',
            sha256: 'c' * 64,
            version: '1.0.0',
            contract: _modelContract(),
          ),
        ),
        inferenceEngine: _FakeCpuEngine(),
      );

      await expectLater(
        runner.prepare(),
        throwsA(isA<ValidationExecutionException>()),
      );
    },
  );

  test('uses the SDK pixel order, grayscale rule, and float normalization', () {
    final image = img.Image(width: 1, height: 1)..setPixelRgb(0, 0, 128, 64, 0);
    final bytes = Uint8List.fromList(img.encodePng(image));

    final rgb = prepareValidationImageTensor(
      bytes,
      const ValidationInputContract(
        width: 1,
        height: 1,
        channels: 3,
        normalization: 'zero_to_one',
      ),
    );
    final grayscale = prepareValidationImageTensor(
      bytes,
      const ValidationInputContract(
        width: 1,
        height: 1,
        channels: 1,
        normalization: 'minus_one_to_one',
      ),
    );

    expect(rgb[0], closeTo(128 / 255, 0.000001));
    expect(rgb[1], closeTo(64 / 255, 0.000001));
    expect(rgb[2], 0);
    expect(grayscale.single, closeTo(64 / 127.5 - 1, 0.000001));
  });

  test('maps undecodable image bytes to the invalidImage error', () {
    expect(
      () => prepareValidationImageTensor(
        Uint8List.fromList([0xff, 0xd8, 0xff]),
        const ValidationInputContract(
          width: 1,
          height: 1,
          channels: 3,
          normalization: 'zero_to_one',
        ),
      ),
      throwsA(
        isA<ValidationExecutionException>().having(
          (error) => error.code,
          'code',
          'invalidImage',
        ),
      ),
    );
  });
}

class _ModelRepository implements ValidationModelRepository {
  _ModelRepository(this.artifact);

  final VerifiedModelArtifact artifact;

  @override
  Future<VerifiedModelArtifact> prepare(
    ValidationModelRequirement requirement,
  ) async => artifact;

  @override
  Future<String> fetchSha256(String modelVersionId) async => artifact.sha256;
}

class _FakeCpuEngine implements ValidationTfliteEngine {
  Uint8List? receivedImageBytes;

  @override
  Future<List<ValidationTensor>> run({
    required File modelFile,
    required Uint8List imageBytes,
    required ValidationInputContract inputContract,
  }) async {
    receivedImageBytes = imageBytes;
    return [
      ValidationTensor(shape: [1, 3], values: [0.1, 0.8, 0.1]),
    ];
  }
}

ValidationRunRequest _request(Uint8List bytes) => ValidationRunRequest(
  pairRunId: 'pair-1',
  repetition: 1,
  phase: ValidationPhase.measured,
  scenarioId: 'PERF-02',
  caseId: 'coffee-1',
  datasetId: 'dataset-1',
  datasetVersionId: 'dataset-version-1',
  datasetPartition: 'test',
  datasetSha256: 'a' * 64,
  inputBytes: bytes,
  inputSha256: sha256.convert(bytes).toString(),
  captureTrace: false,
);

ValidationResourceProfile _profile() => ValidationResourceProfile(
  id: 'coffee',
  datasetVersionId: 'dataset-version-1',
  datasetPartition: 'test',
  datasetSha256: 'a' * 64,
  controlModelVersionId: 'model-version-1',
  controlModelSha256: 'b' * 64,
  treatmentWorkflowId: 'workflow-1',
  treatmentWorkflowVersionId: 'workflow-version-1',
  treatmentWorkflowVersion: '1.0.0',
  treatmentModelVersionId: 'model-version-1',
  treatmentModelSha256: 'b' * 64,
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

Map<String, Object?> _modelContract() => {
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
