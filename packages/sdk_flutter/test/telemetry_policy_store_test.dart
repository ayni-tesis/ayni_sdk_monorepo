import 'dart:convert';
import 'dart:io';

import 'package:ayni_sdk/src/telemetry_policy_store.dart';
import 'package:test/test.dart';

void main() {
  late Directory directory;

  setUp(
    () async =>
        directory = await Directory.systemTemp.createTemp('ayni-policy-'),
  );
  tearDown(() async => directory.delete(recursive: true));

  test(
    'persists only a valid policy and reads it after store recreation',
    () async {
      await TelemetryPolicyStore(
        directory,
      ).write(const TelemetryPolicy(enabled: true, retentionDays: 90));

      expect(
        await TelemetryPolicyStore(directory).read(),
        const TelemetryPolicy(enabled: true, retentionDays: 90),
      );
      final file = File('${directory.path}/diagnostics/telemetry-policy.json');
      expect(jsonDecode(await file.readAsString()), {
        'enabled': true,
        'retentionDays': 90,
      });
    },
  );

  test(
    'treats missing, malformed, or unknown policy data as disabled',
    () async {
      final store = TelemetryPolicyStore(directory);
      expect(await store.read(), isNull);
      final file = File('${directory.path}/diagnostics/telemetry-policy.json');
      await file.parent.create(recursive: true);
      await file.writeAsString(
        '{"enabled":true,"retentionDays":365,"applicationId":"secret"}',
      );

      expect(await store.read(), isNull);
    },
  );
}
