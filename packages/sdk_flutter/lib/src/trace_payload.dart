/// The fields a workflow trace may carry, and nothing else (US-073).
///
/// Mirrors `sdkTraceSchema` in `packages/api/src/sdk-trace.ts`, which the
/// server applies on ingestion. A trace never carries the input image, its
/// bytes, tensors, secrets or other raw input: `dataset.capture` is the only
/// way an image leaves `run()`.
library;

/// Returns a copy of [trace] with only the fields of the published trace
/// schema, each with the JSON type that schema expects.
///
/// Any other field, at any level, is dropped: an image, input bytes, a
/// tensor, a path or any data a component attached. So are list items and
/// output values of an unknown shape. The allowed metadata stays as it was,
/// so the trace can still be sent. `TraceOutboxStore` applies it when it
/// saves a trace and when it reads one to send it.
Map<String, Object?> allowlistedTracePayload(Map<String, Object?> trace) =>
    _pick(trace, _traceFields);

typedef _Field = Object? Function(Object? value);

Object? _string(Object? value) => value is String ? value : null;

Object? _int(Object? value) => value is int ? value : null;

Object? _number(Object? value) => value is num ? value : null;

Object? _bool(Object? value) => value is bool ? value : null;

_Field _object(Map<String, _Field> fields) =>
    (value) => value is Map ? _pick(value, fields) : null;

_Field _list(_Field item) =>
    (list) => list is List
    ? [
        for (final element in list)
          if (item(element) case final kept?) kept,
      ]
    : null;

_Field _record(_Field item) =>
    (record) => record is Map
    ? {
        for (final MapEntry(:key, :value) in record.entries)
          if (key is String)
            if (item(value) case final kept?) key: kept,
      }
    : null;

/// The [fields] of [source] that hold a value of their expected type, in the
/// order of [source].
Map<String, Object?> _pick(
  Map<Object?, Object?> source,
  Map<String, _Field> fields,
) => {
  for (final MapEntry(:key, :value) in source.entries)
    if (fields[key] case final field?)
      if (field(value) case final kept?) key! as String: kept,
};

const _measurementFields = {
  'name': _string,
  'value': _number,
  'unit': _string,
  'method': _string,
  'source': _string,
  'phase': _string,
  'provenance': _string,
};

const _modelFields = {
  'modelVersionId': _string,
  'version': _string,
  'sha256': _string,
};

const _profileFields = {
  'schemaVersion': _int,
  'platform': _string,
  'osVersion': _string,
  'apiLevel': _int,
  'model': _string,
  'ramRange': _string,
  'socModel': _string,
};

const _nodeFields = {
  'nodeId': _string,
  'type': _string,
  'status': _string,
  'durationMs': _int,
  'modelVersionId': _string,
};

const _errorFields = {
  'category': _string,
  'phase': _string,
  'nodeId': _string,
  'modelVersionId': _string,
};

final _boxFields = {
  'xMin': _number,
  'yMin': _number,
  'xMax': _number,
  'yMax': _number,
};

final Map<String, Map<String, _Field>> _scalarOutputFields = {
  'classification': {
    'type': _string,
    'nodeId': _string,
    'label': _string,
    'confidence': _number,
    'confidences': _record(_number),
  },
  'detection': {
    'type': _string,
    'nodeId': _string,
    'detections': _list(
      _object({
        'label': _string,
        'confidence': _number,
        'box': _object(_boxFields),
      }),
    ),
  },
  'boolean': {'type': _string, 'nodeId': _string, 'value': _bool},
};

/// A decoded workflow output, or `null` when its `type` is not one of the
/// published result types; a combined output only holds scalar ones.
Object? _output(Object? value, {bool combined = true}) {
  if (value is! Map) return null;
  final type = value['type'];
  if (combined && type == 'combined') {
    return _pick(value, {
      'type': _string,
      'nodeId': _string,
      'values': _list((item) => _output(item, combined: false)),
    });
  }
  final fields = _scalarOutputFields[type];
  return fields == null ? null : _pick(value, fields);
}

final Map<String, _Field> _traceFields = {
  'traceSchemaVersion': _int,
  'traceId': _string,
  'runId': _string,
  'repetition': _int,
  'installationId': _string,
  'timestamp': _string,
  'condition': _string,
  'caseId': _string,
  'scenario': _string,
  'appCommit': _string,
  'sdkCommit': _string,
  'datasetId': _string,
  'datasetPartition': _string,
  'datasetSha256': _string,
  'backend': _string,
  'network': _string,
  'batteryPercent': _number,
  'temperatureC': _number,
  'appVersion': _string,
  'sdkVersion': _string,
  'measurements': _list(_object(_measurementFields)),
  'incidents': _list(_string),
  'validity': _string,
  'workflowId': _string,
  'workflowVersionId': _string,
  'workflowVersion': _string,
  'models': _list(_object(_modelFields)),
  'profile': _object(_profileFields),
  'status': _string,
  'durationMs': _int,
  'nodes': _list(_object(_nodeFields)),
  'outputs': _record(_output),
  'clientReportedFields': _list(_string),
  'error': _object(_errorFields),
};
