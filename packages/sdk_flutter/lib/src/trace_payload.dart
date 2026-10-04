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
/// output values of an unknown shape, and `clientReportedFields` names that
/// are not trace fields. The allowed metadata stays as it was,
/// so the trace can still be sent. `TraceOutboxStore` applies it when it
/// saves a trace and when it reads one to send it.
Map<String, Object?> allowlistedTracePayload(Map<String, Object?> trace) =>
    _pick(trace, _traceFields);

typedef _Field = Object? Function(Object? value);

/// A text value, unless it carries an encoded image: a `data:image/` URI or
/// base64 that starts like a PNG, JPEG, GIF or WebP file. The server rejects
/// the same text (`sdkTraceSchema`).
Object? _string(Object? value) =>
    value is String &&
        !_imageDataUri.hasMatch(value) &&
        !_base64Image.hasMatch(value)
    ? value
    : null;

final _imageDataUri = RegExp(r'data:image/', caseSensitive: false);

final _base64Image = RegExp(
  r'(?:^|[^A-Za-z0-9+/_-])(?:iVBORw0KGgo|/9j/|_9j_|R0lGOD|UklGR)',
);

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
          // A key is text too: an output name or label never carries an image.
          if (_string(key) case final String name)
            if (item(value) case final kept?) name: kept,
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

// Each map below is a flat declaration of `'field': rule` lines so that
// `packages/api/src/sdk-trace-allowlist.test.ts` can compare it with
// `sdkTraceSchema`: keep that shape when adding a field.

/// The values `clientReportedFields` may list.
const _traceClientReportedFieldNames = {
  'runId',
  'repetition',
  'condition',
  'caseId',
  'scenario',
  'appCommit',
  'sdkCommit',
  'datasetId',
  'datasetPartition',
  'datasetSha256',
  'backend',
  'network',
  'batteryPercent',
  'temperatureC',
  'ramRange',
  'socModel',
  'appVersion',
  'sdkVersion',
  'measurements',
  'incidents',
  'validity',
};

Object? _traceClientReportedField(Object? value) =>
    _traceClientReportedFieldNames.contains(value) ? value : null;

const _traceMeasurementFields = {
  'name': _string,
  'value': _number,
  'unit': _string,
  'method': _string,
  'source': _string,
  'phase': _string,
  'provenance': _string,
};

const _traceModelFields = {
  'modelVersionId': _string,
  'version': _string,
  'sha256': _string,
};

const _traceProfileFields = {
  'schemaVersion': _int,
  'platform': _string,
  'osVersion': _string,
  'apiLevel': _int,
  'model': _string,
  'ramRange': _string,
  'socModel': _string,
};

const _traceNodeFields = {
  'nodeId': _string,
  'type': _string,
  'status': _string,
  'durationMs': _int,
  'modelVersionId': _string,
};

const _traceErrorFields = {
  'category': _string,
  'phase': _string,
  'nodeId': _string,
  'modelVersionId': _string,
};

const _traceBoxFields = {
  'xMin': _number,
  'yMin': _number,
  'xMax': _number,
  'yMax': _number,
};

final Map<String, _Field> _traceDetectionFields = {
  'label': _string,
  'confidence': _number,
  'box': _object(_traceBoxFields),
};

final Map<String, _Field> _traceClassificationOutputFields = {
  'type': _string,
  'nodeId': _string,
  'label': _string,
  'confidence': _number,
  'confidences': _record(_number),
};

final Map<String, _Field> _traceDetectionOutputFields = {
  'type': _string,
  'nodeId': _string,
  'detections': _list(_object(_traceDetectionFields)),
};

const _traceBooleanOutputFields = {
  'type': _string,
  'nodeId': _string,
  'value': _bool,
};

final Map<String, _Field> _traceCombinedOutputFields = {
  'type': _string,
  'nodeId': _string,
  'values': _list(_traceScalarOutput),
};

/// The fields of each result type a combined output may hold, by `type`.
final Map<String, Map<String, _Field>> _traceScalarOutputTypes = {
  'classification': _traceClassificationOutputFields,
  'detection': _traceDetectionOutputFields,
  'boolean': _traceBooleanOutputFields,
};

/// The fields of each result type an output may hold, by `type`.
final Map<String, Map<String, _Field>> _traceOutputTypes = {
  ..._traceScalarOutputTypes,
  'combined': _traceCombinedOutputFields,
};

/// A decoded workflow output, or `null` when its `type` is not one of the
/// published result types.
Object? _traceOutput(Object? value) => _typed(value, _traceOutputTypes);

/// An output a combined output holds: never another combined one.
Object? _traceScalarOutput(Object? value) =>
    _typed(value, _traceScalarOutputTypes);

Object? _typed(Object? value, Map<String, Map<String, _Field>> types) {
  if (value is! Map) return null;
  final fields = types[value['type']];
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
  'measurements': _list(_object(_traceMeasurementFields)),
  'incidents': _list(_string),
  'validity': _string,
  'workflowId': _string,
  'workflowVersionId': _string,
  'workflowVersion': _string,
  'models': _list(_object(_traceModelFields)),
  'profile': _object(_traceProfileFields),
  'status': _string,
  'durationMs': _int,
  'nodes': _list(_object(_traceNodeFields)),
  'outputs': _record(_traceOutput),
  'clientReportedFields': _list(_traceClientReportedField),
  'error': _object(_traceErrorFields),
};
