import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:test/test.dart';

void main() {
  late Directory temporaryDirectory;

  setUp(() async {
    temporaryDirectory = await Directory.systemTemp.createTemp(
      'model-installer-',
    );
  });

  tearDown(() async => temporaryDirectory.delete(recursive: true));

  test(
    'returns localized states and preserves an installed version on failure',
    () async {
      final source = File('${temporaryDirectory.path}/verified.part');
      final destination = Directory('${temporaryDirectory.path}/offline');
      await source.writeAsString('valid model');
      const sha =
          'fe8d07f0cc8f22537e1bad3404430bec54ad778abbe9a7f15eec0e2b932e5a58';
      final verifier = ModelArtifactIntegrityVerifier();
      final installer = ModelArtifactInstaller(storageDirectory: destination);

      final failed = await verifier.verify(
        modelVersionId: 'bad-version',
        temporaryArtifact: source,
        verifiedArtifact: File('${temporaryDirectory.path}/bad.tflite'),
        expectedSha256: 'bad',
        isDownloadComplete: true,
      );
      final unverified = await installer.install(
        modelId: 'model-1',
        version: '1.0.0',
        verifiedArtifact: File('${temporaryDirectory.path}/bad.tflite'),
        integrity: failed,
      );
      expect(unverified.status, ModelArtifactInstallStatus.notAvailable);
      expect(
        unverified.message,
        'El modelo no superó la verificación de integridad.',
      );

      await source.writeAsString('valid model');
      final integrity = await verifier.verify(
        modelVersionId: 'version-1',
        temporaryArtifact: source,
        verifiedArtifact: File('${temporaryDirectory.path}/verified.tflite'),
        expectedSha256: sha,
        isDownloadComplete: true,
      );
      final states = <ModelArtifactInstallStatus>[];
      final installed = await installer.install(
        modelId: 'model-1',
        version: '1.0.0',
        verifiedArtifact: File('${temporaryDirectory.path}/verified.tflite'),
        integrity: integrity,
        onStateChanged: (result) => states.add(result.status),
      );
      expect(states, [ModelArtifactInstallStatus.installing]);
      expect(installed.status, ModelArtifactInstallStatus.availableOffline);
      expect(installed.message, 'Modelo 1.0.0 disponible offline.');
      expect(
        await installer.isVersionAvailable(
          modelId: 'model-1',
          modelVersionId: 'version-1',
        ),
        isTrue,
      );
      expect(
        await installer.isVersionAvailable(
          modelId: 'model-1',
          modelVersionId: 'other',
        ),
        isFalse,
      );

      final conflictingDownload = File(
        '${temporaryDirectory.path}/conflict.part',
      );
      await conflictingDownload.writeAsString('different model bytes');
      final conflictingIntegrity = await verifier.verify(
        modelVersionId: 'version-1',
        temporaryArtifact: conflictingDownload,
        verifiedArtifact: File('${temporaryDirectory.path}/conflict.tflite'),
        expectedSha256: sha256
            .convert('different model bytes'.codeUnits)
            .toString(),
        isDownloadComplete: true,
      );
      final failedInstall = await installer.install(
        modelId: 'model-1',
        version: '1.0.0',
        verifiedArtifact: File('${temporaryDirectory.path}/conflict.tflite'),
        integrity: conflictingIntegrity,
      );
      expect(failedInstall.status, ModelArtifactInstallStatus.notAvailable);
      expect(failedInstall.message, 'No disponible');
      expect(
        await installer.isVersionAvailable(
          modelId: 'model-1',
          modelVersionId: 'version-1',
        ),
        isTrue,
      );
    },
  );
}
