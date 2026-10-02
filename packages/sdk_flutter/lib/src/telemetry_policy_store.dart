// ignore_for_file: public_member_api_docs

import 'dart:convert';
import 'dart:io';

class TelemetryPolicy {
  const TelemetryPolicy({required this.enabled, required this.retentionDays});

  final bool enabled;
  final int retentionDays;

  static TelemetryPolicy? fromJson(Object? value) {
    if (value is! Map ||
        value.length != 2 ||
        value['enabled'] is! bool ||
        value['retentionDays'] is! int ||
        !const [7, 30, 90].contains(value['retentionDays'])) {
      return null;
    }
    return TelemetryPolicy(
      enabled: value['enabled'] as bool,
      retentionDays: value['retentionDays'] as int,
    );
  }

  Map<String, Object> toJson() => {
    'enabled': enabled,
    'retentionDays': retentionDays,
  };

  @override
  bool operator ==(Object other) =>
      other is TelemetryPolicy &&
      other.enabled == enabled &&
      other.retentionDays == retentionDays;

  @override
  int get hashCode => Object.hash(enabled, retentionDays);
}

class TelemetryPolicyStore {
  TelemetryPolicyStore(Directory directory)
    : _file = File(
        '${directory.path}${Platform.pathSeparator}diagnostics${Platform.pathSeparator}telemetry-policy.json',
      );

  final File _file;

  Future<TelemetryPolicy?> read() async {
    if (!await _file.exists()) return null;
    try {
      return TelemetryPolicy.fromJson(jsonDecode(await _file.readAsString()));
    } on FormatException {
      return null;
    }
  }

  Future<void> write(TelemetryPolicy policy) async {
    await _file.parent.create(recursive: true);
    final temporary = File(
      '${_file.path}.${DateTime.now().microsecondsSinceEpoch}.tmp',
    );
    try {
      await temporary.writeAsString(jsonEncode(policy.toJson()), flush: true);
      await temporary.rename(_file.path);
    } finally {
      if (await temporary.exists()) await temporary.delete();
    }
  }
}
