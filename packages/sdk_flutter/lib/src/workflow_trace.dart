import 'device_profile.dart';
import 'workflow_execution.dart';

/// Caller-declared identifiers and validation context for one run.
class WorkflowTraceContext {
  /// Creates a caller-reported context, requiring a non-empty run ID and positive repetition.
  WorkflowTraceContext({
    required this.runId,
    required this.repetition,
    this.condition,
    this.caseId,
    this.scenario,
    this.appCommit,
    this.sdkCommit,
    this.datasetId,
    this.datasetPartition,
    this.datasetSha256,
    this.backend,
    this.network,
    this.batteryPercent,
    this.temperatureC,
    this.ramRange,
    this.socModel,
    this.appVersion,
    this.sdkVersion,
    this.measurements = const [],
    this.incidents = const [],
    this.validity,
  }) {
    if (runId.trim().isEmpty || repetition < 1) {
      throw ArgumentError(
        'runId must be non-empty and repetition must be positive.',
      );
    }
    if (batteryPercent != null &&
        (!batteryPercent!.isFinite ||
            batteryPercent! < 0 ||
            batteryPercent! > 100)) {
      throw ArgumentError.value(batteryPercent, 'batteryPercent');
    }
    if (temperatureC != null && !temperatureC!.isFinite) {
      throw ArgumentError.value(temperatureC, 'temperatureC');
    }
  }

  /// Application-declared run ID; the SDK never generates this value.
  final String runId;

  /// One-based application-declared repetition number.
  final int repetition;

  /// Experimental condition such as control or treatment.
  final String? condition;

  /// Application-declared case identifier.
  final String? caseId;

  /// Application-declared scenario description or identifier.
  final String? scenario;

  /// Application source commit, when declared.
  final String? appCommit;

  /// SDK source commit, when declared.
  final String? sdkCommit;

  /// Dataset identifier, when declared.
  final String? datasetId;

  /// Dataset partition, when declared.
  final String? datasetPartition;

  /// Dataset or input hash, when declared.
  final String? datasetSha256;

  /// Effective backend reported by the application.
  final String? backend;

  /// Network condition reported by the application.
  final String? network;

  /// Battery level in percent, from 0 through 100.
  final double? batteryPercent;

  /// Temperature in degrees Celsius, if measured by the application.
  final double? temperatureC;

  /// RAM bucket supplied only when the SDK profile does not expose one.
  final String? ramRange;

  /// SoC model supplied only when the SDK profile does not expose one.
  final String? socModel;

  /// Host application version, when declared.
  final String? appVersion;

  /// SDK version, when declared by the host.
  final String? sdkVersion;

  /// External measurements with units and collection provenance.
  final List<TraceMeasurement> measurements;

  /// Application-declared incidents for this run.
  final List<String> incidents;

  /// Application-declared validity judgment, if available.
  final String? validity;

  /// Serializes the context without inventing absent values.
  Map<String, Object?> toJson() => {
    'runId': runId,
    'repetition': repetition,
    if (condition != null) 'condition': condition,
    if (caseId != null) 'caseId': caseId,
    if (scenario != null) 'scenario': scenario,
    if (appCommit != null) 'appCommit': appCommit,
    if (sdkCommit != null) 'sdkCommit': sdkCommit,
    if (datasetId != null) 'datasetId': datasetId,
    if (datasetPartition != null) 'datasetPartition': datasetPartition,
    if (datasetSha256 != null) 'datasetSha256': datasetSha256,
    if (backend != null) 'backend': backend,
    if (network != null) 'network': network,
    if (batteryPercent != null) 'batteryPercent': batteryPercent,
    if (temperatureC != null) 'temperatureC': temperatureC,
    if (appVersion != null) 'appVersion': appVersion,
    if (sdkVersion != null) 'sdkVersion': sdkVersion,
    'measurements': measurements.map((value) => value.toJson()).toList(),
    'incidents': incidents,
    if (validity != null) 'validity': validity,
  };
}

/// A finite client-reported measurement with its unit and method.
class TraceMeasurement {
  /// Creates a finite measurement with explicit units and provenance.
  TraceMeasurement({
    required this.name,
    required this.value,
    required this.unit,
    required this.method,
    required this.source,
    this.phase,
  }) {
    if (name.trim().isEmpty ||
        unit.trim().isEmpty ||
        method.trim().isEmpty ||
        source.trim().isEmpty ||
        !value.isFinite) {
      throw ArgumentError(
        'A trace measurement needs finite value and non-empty provenance.',
      );
    }
  }

  /// Measurement name.
  final String name;

  /// Preserved numeric value.
  final double value;

  /// Unit for [value].
  final String unit;

  /// Collection or calculation method.
  final String method;

  /// Client-declared measurement source.
  final String source;

  /// Execution phase to which the value applies.
  final String? phase;

  /// Serializes the measurement with `clientReported` provenance.
  Map<String, Object> toJson() => {
    'name': name,
    'value': value,
    'unit': unit,
    'method': method,
    'source': source,
    if (phase != null) 'phase': phase!,
    'provenance': 'clientReported',
  };
}

/// A model version referenced by an execution trace.
class TraceModel {
  /// Identifies one model artifact used or reported by the execution.
  const TraceModel({
    required this.modelVersionId,
    required this.version,
    required this.sha256,
  });

  /// Model version identifier.
  final String modelVersionId;

  /// Published model version string.
  final String version;

  /// SHA-256 of the model artifact.
  final String sha256;

  /// Serializes the model reference.
  Map<String, String> toJson() => {
    'modelVersionId': modelVersionId,
    'version': version,
    'sha256': sha256,
  };
}

/// One workflow node's sanitized outcome and elapsed time.
class TraceNodeExecution {
  /// Creates a sanitized node phase outcome.
  const TraceNodeExecution({
    required this.nodeId,
    required this.type,
    required this.status,
    this.durationMs,
    this.modelVersionId,
  });

  /// Workflow node identifier.
  final String nodeId;

  /// Published workflow node type.
  final String type;

  /// Node outcome: completed, skipped, or failed.
  final String status;

  /// Elapsed node time in milliseconds, or null when the node was not executed.
  final int? durationMs;

  /// Model version attempted by this node, when applicable.
  final String? modelVersionId;

  /// Serializes the node outcome.
  Map<String, Object> toJson() => {
    'nodeId': nodeId,
    'type': type,
    'status': status,
    if (durationMs != null) 'durationMs': durationMs!,
    if (modelVersionId != null) 'modelVersionId': modelVersionId!,
  };
}

/// Local, versioned, privacy-limited evidence for one workflow execution.
class WorkflowTrace {
  const WorkflowTrace._({
    required this.traceId,
    required this.runId,
    required this.repetition,
    required this.installationId,
    required this.timestamp,
    required this.workflowId,
    required this.workflowVersionId,
    required this.workflowVersion,
    required this.models,
    required this.profile,
    required this.context,
    required this.status,
    required this.durationMs,
    required this.nodes,
    required this.outputs,
    required this.clientReportedFields,
    this.error,
  });

  /// Current schema version for serialized traces.
  static const int currentSchemaVersion = 1;

  /// Unique trace identifier.
  final String traceId;

  /// Caller-declared run identifier.
  final String runId;

  /// Caller-declared repetition number.
  final int repetition;

  /// Random per-installation identifier stored by the SDK.
  final String installationId;

  /// UTC time at which the workflow execution started.
  final DateTime timestamp;

  /// Executed workflow identifier.
  final String workflowId;

  /// Immutable workflow version identifier.
  final String workflowVersionId;

  /// Published workflow version string.
  final String workflowVersion;

  /// Model references used or attempted by the execution.
  final List<TraceModel> models;

  /// Allowlisted platform profile and optional client fallbacks.
  final DeviceProfile profile;

  /// Caller-declared experiment context.
  final WorkflowTraceContext context;

  /// `success` or `error`.
  final String status;

  /// Total duration in milliseconds.
  final int durationMs;

  /// Sanitized node outcomes and timings.
  final List<TraceNodeExecution> nodes;

  /// Structured decoded outputs only.
  final Map<String, Object?> outputs;

  /// Context properties reported by the client.
  final List<String> clientReportedFields;

  /// Typed error fields, with no raw exception message.
  final Map<String, Object?>? error;

  /// Serializes the complete allowlisted trace schema.
  Map<String, Object?> toJson() => {
    'traceSchemaVersion': currentSchemaVersion,
    'traceId': traceId,
    'runId': runId,
    'repetition': repetition,
    'installationId': installationId,
    'timestamp': timestamp.toUtc().toIso8601String(),
    ...context.toJson(),
    'workflowId': workflowId,
    'workflowVersionId': workflowVersionId,
    'workflowVersion': workflowVersion,
    'models': models.map((model) => model.toJson()).toList(),
    'profile': profile.toJson(),
    'status': status,
    'durationMs': durationMs,
    'nodes': nodes.map((node) => node.toJson()).toList(),
    'outputs': outputs,
    'clientReportedFields': clientReportedFields,
    if (error != null) 'error': error,
  };

  /// Encodes only the SDK's typed, decoded public outputs; input bytes and
  /// arbitrary tensors have no path into this allowlist.
  static Map<String, Object?> encodeOutputs(
    Map<String, WorkflowValue> values,
  ) => {
    for (final entry in values.entries) entry.key: _encodeValue(entry.value),
  };

  static Map<String, Object?> _encodeValue(WorkflowValue value) =>
      switch (value) {
        ClassificationResult(
          :final nodeId,
          :final label,
          :final confidence,
          :final confidences,
        ) =>
          {
            'type': 'classification',
            'nodeId': nodeId,
            'label': label,
            'confidence': confidence,
            'confidences': confidences,
          },
        DetectionResult(:final nodeId, :final detections) => {
          'type': 'detection',
          'nodeId': nodeId,
          'detections': [
            for (final detection in detections)
              {
                'label': detection.label,
                'confidence': detection.confidence,
                'box': {
                  'xMin': detection.xMin,
                  'yMin': detection.yMin,
                  'xMax': detection.xMax,
                  'yMax': detection.yMax,
                },
              },
          ],
        },
        BooleanResult(:final nodeId, :final value) => {
          'type': 'boolean',
          'nodeId': nodeId,
          'value': value,
        },
        CombinedWorkflowResult(:final nodeId, :final values) => {
          'type': 'combined',
          'nodeId': nodeId,
          'values': values.map(_encodeValue).toList(),
        },
      };
}

// ignore: public_member_api_docs, visible only to SDK implementation imports.
WorkflowTrace createWorkflowTrace({
  required String traceId,
  required String installationId,
  required WorkflowTraceContext context,
  required String workflowId,
  required String workflowVersionId,
  required String workflowVersion,
  required List<TraceModel> models,
  required DeviceProfile profile,
  required DateTime timestamp,
  required int durationMs,
  required List<TraceNodeExecution> nodes,
  required Map<String, WorkflowValue> outputs,
  required List<String> clientReportedFields,
  WorkflowError? error,
}) => WorkflowTrace._(
  traceId: traceId,
  runId: context.runId,
  repetition: context.repetition,
  installationId: installationId,
  timestamp: timestamp,
  workflowId: workflowId,
  workflowVersionId: workflowVersionId,
  workflowVersion: workflowVersion,
  models: models,
  profile: profile,
  context: context,
  status: error == null ? 'success' : 'error',
  durationMs: durationMs,
  nodes: nodes,
  outputs: WorkflowTrace.encodeOutputs(outputs),
  clientReportedFields: clientReportedFields,
  error: error == null
      ? null
      : {
          'category': error.category.name,
          if (error.nodeId != null) 'nodeId': error.nodeId,
          if (error.modelVersionId != null)
            'modelVersionId': error.modelVersionId,
        },
);
