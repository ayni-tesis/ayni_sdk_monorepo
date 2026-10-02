import { z } from "zod";

export const SDK_TRACE_MAX_BYTES = 2 * 1024 * 1024;

const id = z.string().min(1);
const finite = z.number().finite();
// Request body size is bounded by SDK_TRACE_MAX_BYTES at the route boundary.
const contextField = z.string();
const boundedId = id.max(128);
const confidencesSchema = z.record(contextField, finite);

const traceMeasurementSchema = z.strictObject({
  name: contextField,
  value: finite,
  unit: contextField,
  method: contextField,
  source: contextField,
  phase: contextField.optional(),
  provenance: z.literal("clientReported"),
});

const traceProfileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  platform: z.enum(["android", "ios", "unknown"]),
  osVersion: contextField.optional(),
  apiLevel: z.number().int().optional(),
  model: contextField.optional(),
  ramRange: contextField.optional(),
  socModel: contextField.optional(),
});

const traceScalarOutputSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("classification"),
    nodeId: boundedId,
    label: contextField,
    confidence: finite,
    confidences: confidencesSchema,
  }),
  z.strictObject({
    type: z.literal("detection"),
    nodeId: boundedId,
    detections: z.array(
      z.strictObject({
        label: contextField,
        confidence: finite,
        box: z.strictObject({ xMin: finite, yMin: finite, xMax: finite, yMax: finite }),
      }),
    ),
  }),
  z.strictObject({ type: z.literal("boolean"), nodeId: boundedId, value: z.boolean() }),
]);

const traceOutputValueSchema = z.discriminatedUnion("type", [
  traceScalarOutputSchema,
  z.strictObject({
    type: z.literal("combined"),
    nodeId: boundedId,
    values: z.array(traceScalarOutputSchema),
  }),
]);

const traceErrorSchema = z.strictObject({
  category: z.enum([
    "workflowNotAvailable",
    "modelNotAvailable",
    "invalidInput",
    "unsupportedInputContract",
    "invalidWorkflow",
    "modelOutputInvalid",
    "conditionInputMissing",
    "outputInputMissing",
    "outputNotReached",
    "cancelled",
    "executionNotFound",
    "runtimeError",
  ]),
  phase: z
    .enum([
      "workflowResolution",
      "modelResolution",
      "inputValidation",
      "modelContractValidation",
      "workflowValidation",
      "modelOutputValidation",
      "conditionEvaluation",
      "outputEvaluation",
      "workflowCompletion",
      "executionControl",
      "workflowExecution",
    ])
    .optional(),
  nodeId: boundedId.optional(),
  modelVersionId: boundedId.optional(),
});

const clientReportedFieldSchema = z.enum([
  "runId",
  "repetition",
  "condition",
  "caseId",
  "scenario",
  "appCommit",
  "sdkCommit",
  "datasetId",
  "datasetPartition",
  "datasetSha256",
  "backend",
  "network",
  "batteryPercent",
  "temperatureC",
  "ramRange",
  "socModel",
  "appVersion",
  "sdkVersion",
  "measurements",
  "incidents",
  "validity",
]);

/** The exact, privacy-limited trace shape emitted by the Flutter SDK. */
export const sdkTraceSchema = z.strictObject({
  traceSchemaVersion: z.literal(1),
  traceId: z.uuid(),
  runId: id,
  repetition: z.number().int().positive(),
  installationId: z.uuid(),
  timestamp: z.iso.datetime({ offset: true }),
  condition: contextField.optional(),
  caseId: contextField.optional(),
  scenario: contextField.optional(),
  appCommit: contextField.optional(),
  sdkCommit: contextField.optional(),
  datasetId: contextField.optional(),
  datasetPartition: contextField.optional(),
  datasetSha256: contextField.optional(),
  backend: contextField.optional(),
  network: contextField.optional(),
  batteryPercent: finite.optional(),
  temperatureC: finite.optional(),
  appVersion: contextField.optional(),
  sdkVersion: contextField.optional(),
  measurements: z.array(traceMeasurementSchema),
  incidents: z.array(contextField),
  validity: contextField.optional(),
  workflowId: boundedId,
  workflowVersionId: boundedId,
  workflowVersion: boundedId,
  models: z.array(
    z.strictObject({
      modelVersionId: boundedId,
      version: boundedId,
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  profile: traceProfileSchema,
  status: z.enum(["success", "error"]),
  durationMs: z.number().int().nonnegative(),
  nodes: z.array(
    z.strictObject({
      nodeId: boundedId,
      type: z.enum(["input.image", "model.tflite", "condition", "output"]),
      status: z.enum(["completed", "skipped", "failed"]),
      durationMs: z.number().int().nonnegative().optional(),
      modelVersionId: boundedId.optional(),
    }),
  ),
  outputs: z.record(z.string().min(1), traceOutputValueSchema),
  clientReportedFields: z
    .array(clientReportedFieldSchema)
    .max(clientReportedFieldSchema.options.length),
  error: traceErrorSchema.optional(),
});

export type SdkWorkflowTrace = z.infer<typeof sdkTraceSchema>;
