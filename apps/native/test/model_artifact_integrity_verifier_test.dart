import 'dart:io';

import 'package:better_fullstack_app/model_artifact_integrity_verifier.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory temporaryDirectory;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'model-integrity-test-',
    );
  });

  tearDown(() async {
    await temporaryDirectory.delete(recursive: true);
  });

  test('makes a downloaded artifact available when its hash matches', () async {
    final downloaded = File('${temporaryDirectory.path}/download.part');
    final verified = File('${temporaryDirectory.path}/models/model.tflite');
    await downloaded.writeAsString('valid model');

    final result = await ModelArtifactIntegrityVerifier().verify(
      modelVersionId: 'version-1',
      temporaryArtifact: downloaded,
      verifiedArtifact: verified,
      expectedSha256:
          'fe8d07f0cc8f22537e1bad3404430bec54ad778abbe9a7f15eec0e2b932e5a58',
      isDownloadComplete: true,
    );

    expect(result.status, ModelArtifactIntegrityStatus.verified);
    expect(result.modelVersionId, 'version-1');
    expect(result.message, 'verified');
    expect(await verified.readAsString(), 'valid model');
    expect(await downloaded.exists(), isFalse);
  });

  test(
    'removes a mismatched download and preserves a previous verified artifact',
    () async {
      final downloaded = File('${temporaryDirectory.path}/download.part');
      final verified = File('${temporaryDirectory.path}/models/model.tflite');
      await verified.parent.create(recursive: true);
      await verified.writeAsString('previous valid model');
      await downloaded.writeAsString('tampered model');

      final result = await ModelArtifactIntegrityVerifier().verify(
        modelVersionId: 'version-2',
        temporaryArtifact: downloaded,
        verifiedArtifact: verified,
        expectedSha256:
            'fe8d07f0cc8f22537e1bad3404430bec54ad778abbe9a7f15eec0e2b932e5a58',
        isDownloadComplete: true,
      );

      expect(result.status, ModelArtifactIntegrityStatus.integrityFailed);
      expect(result.message, 'integrityFailed');
      expect(result.modelVersionId, 'version-2');
      expect(await downloaded.exists(), isFalse);
      expect(await verified.readAsString(), 'previous valid model');
    },
  );

  test(
    'invalidates an incomplete download without replacing a verified artifact',
    () async {
      final downloaded = File('${temporaryDirectory.path}/download.part');
      final verified = File('${temporaryDirectory.path}/models/model.tflite');
      await verified.parent.create(recursive: true);
      await verified.writeAsString('previous valid model');
      await downloaded.writeAsString('partial model');

      final result = await ModelArtifactIntegrityVerifier().verify(
        modelVersionId: 'version-3',
        temporaryArtifact: downloaded,
        verifiedArtifact: verified,
        expectedSha256:
            'fe8d07f0cc8f22537e1bad3404430bec54ad778abbe9a7f15eec0e2b932e5a58',
        isDownloadComplete: false,
      );

      expect(result.status, ModelArtifactIntegrityStatus.integrityFailed);
      expect(result.modelVersionId, 'version-3');
      expect(await downloaded.exists(), isFalse);
      expect(await verified.readAsString(), 'previous valid model');
    },
  );
}
