import 'package:better_fullstack_app/validation/models/validation_run_metadata.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('round-trips device and software version provenance', () {
    const metadata = ValidationRunMetadata(
      deviceModel: 'Pixel 8',
      platform: 'android',
      osVersion: '16',
      apiLevel: 36,
      appVersion: '1.0.0',
      sdkVersion: '0.2.0',
    );

    expect(ValidationRunMetadata.fromJson(metadata.toJson()).toJson(), {
      'deviceModel': 'Pixel 8',
      'platform': 'android',
      'osVersion': '16',
      'apiLevel': 36,
      'appVersion': '1.0.0',
      'sdkVersion': '0.2.0',
    });
  });

  test('rejects missing and invalid platform metadata', () {
    expect(
      () => ValidationRunMetadata.fromJson(const {'deviceModel': 'Pixel 8'}),
      throwsFormatException,
    );
    expect(
      () => ValidationRunMetadata.fromJson({
        'deviceModel': 'Pixel 8',
        'platform': 'android',
        'osVersion': '16',
        'apiLevel': 0,
        'appVersion': '1.0.0',
        'sdkVersion': '0.2.0',
      }),
      throwsFormatException,
    );
  });
}
