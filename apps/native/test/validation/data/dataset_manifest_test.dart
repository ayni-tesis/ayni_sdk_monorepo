import 'package:better_fullstack_app/validation/data/dataset_manifest.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DatasetManifest', () {
    test('parses and retains the published dataset metadata', () {
      final manifest = DatasetManifest.fromJson(_response());

      expect(manifest.datasetVersionId, 'dataset-version-1');
      expect(manifest.datasetId, 'dataset-1');
      expect(manifest.partition, 'test');
      expect(manifest.sizeBytes, 12);
      expect(manifest.downloadUrl.scheme, 'https');
    });

    test('rejects missing fields, unknown fields, and malformed hashes', () {
      final missing = _response();
      (missing['manifest']! as Map<String, Object?>).remove('license');
      expect(() => DatasetManifest.fromJson(missing), throwsFormatException);

      final unknown = _response();
      (unknown['manifest']! as Map<String, Object?>)['storageKey'] =
          'must-not-leak';
      expect(() => DatasetManifest.fromJson(unknown), throwsFormatException);

      final badHash = _response();
      (badHash['manifest']! as Map<String, Object?>)['sha256'] = 'not-a-hash';
      expect(() => DatasetManifest.fromJson(badHash), throwsFormatException);
    });

    test(
      'allows HTTP only for explicitly enabled loopback development URLs',
      () {
        final response = _response()
          ..['manifest'] = Map<String, Object?>.from(
            _manifest()..['downloadUrl'] = 'http://127.0.0.1:9090/object',
          );

        expect(() => DatasetManifest.fromJson(response), throwsFormatException);
        expect(
          DatasetManifest.fromJson(
            response,
            allowInsecureLoopback: true,
          ).downloadUrl.host,
          '127.0.0.1',
        );
      },
    );
  });
}

Map<String, Object?> _response() => {'manifest': _manifest()};

Map<String, Object?> _manifest() => {
  'datasetVersionId': 'dataset-version-1',
  'datasetId': 'dataset-1',
  'version': '1.0.0',
  'partition': 'test',
  'source': 'Colección de tesis',
  'license': 'CC BY 4.0',
  'sha256': 'a' * 64,
  'sizeBytes': 12,
  'downloadUrl': 'https://storage.example.test/signed-object',
  'downloadUrlExpiresAt': '2026-10-04T18:00:00.000Z',
};
