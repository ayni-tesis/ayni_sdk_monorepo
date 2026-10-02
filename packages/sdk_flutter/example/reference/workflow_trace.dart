// Example of attaching the policy-gated local trace to a workflow run.
import 'dart:typed_data';

import 'package:ayni_sdk/ayni_sdk.dart';

/// Executes one app-declared experimental repetition and returns its trace.
Future<Map<String, Object?>?> runWithTrace(
  AyniSdk sdk,
  String workflowId,
  Uint8List imageBytes,
  String experimentRunId,
  int repetition,
  double elapsedMs,
) async {
  // #region workflowTrace
  final result = await sdk.run(
    workflowId,
    imageBytes,
    traceContext: WorkflowTraceContext(
      runId: experimentRunId,
      repetition: repetition,
      condition: 'tratamiento',
      caseId: 'caso-01',
      measurements: [
        TraceMeasurement(
          name: 'latency',
          value: elapsedMs,
          unit: 'ms',
          method: 'stopwatch',
          source: 'host-app',
          phase: 'workflow',
        ),
      ],
    ),
  );
  final Map<String, Object?>? trace = result.trace?.toJson();
  // #endregion workflowTrace
  return trace;
}
