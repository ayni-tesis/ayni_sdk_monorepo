import 'dart:convert';

Map<String, Object?> freezeJsonMap(Map<String, Object?> value) {
  final decoded = jsonDecode(jsonEncode(value));
  if (decoded is! Map) throw const FormatException('Expected a JSON object.');
  return freezeObjectMap(
    decoded.map((key, item) => MapEntry(key.toString(), item)),
  );
}

Map<String, Object?> freezeObjectMap(Map<String, Object?> source) =>
    Map.unmodifiable({
      for (final entry in source.entries) entry.key: freezeObject(entry.value),
    });

Object? freezeObject(Object? value) {
  if (value is Map<String, Object?>) return freezeObjectMap(value);
  if (value is Map) {
    return freezeObjectMap(
      value.map((key, nested) => MapEntry(key.toString(), nested)),
    );
  }
  if (value is List) return List.unmodifiable(value.map(freezeObject));
  return value;
}
