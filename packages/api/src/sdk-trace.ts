import { z } from "zod";

export const SDK_TRACE_MAX_BYTES = 2 * 1024 * 1024;

const finite = z.number().finite();
// Request body size is bounded by SDK_TRACE_MAX_BYTES at the route boundary.
const phoneNumberPattern =
  /(?:^|\D)(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}(?:\D|$)/;
function isSemVer(value: string) {
  const buildIndex = value.indexOf("+");
  if (buildIndex !== -1 && value.indexOf("+", buildIndex + 1) !== -1) return false;
  const version = buildIndex === -1 ? value : value.slice(0, buildIndex);
  const build = buildIndex === -1 ? undefined : value.slice(buildIndex + 1);
  if (build !== undefined && !build.split(".").every((part) => /^[0-9A-Za-z-]+$/.test(part))) {
    return false;
  }

  const prereleaseIndex = version.indexOf("-");
  const core = prereleaseIndex === -1 ? version : version.slice(0, prereleaseIndex);
  const prerelease = prereleaseIndex === -1 ? undefined : version.slice(prereleaseIndex + 1);
  const coreParts = core.split(".");
  if (coreParts.length !== 3 || coreParts.some((part) => !/^(?:0|[1-9]\d*)$/.test(part))) {
    return false;
  }
  return (
    prerelease === undefined ||
    prerelease
      .split(".")
      .every(
        (part) =>
          /^[0-9A-Za-z-]+$/.test(part) && (!/^\d+$/.test(part) || part === "0" || part[0] !== "0"),
      )
  );
}
const httpRoutePattern =
  /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)\s+\/[^\s?#]*(?=[?#\s]|$)/gi;
const localPathPatterns = [
  /\b[A-Z]:[\\/]/i,
  /\\\\[^\\\s]+\\[^\\\s]+/,
  /(?:^|[\s"'(:=])\/(?!\/)\S+/,
  /(?:^|[\s"'(:=])~[\\/]\S+/,
  /(?:^|[\s"'(:=])(?:\.\.?[\\/])+\S+/,
  /\b(?:path|file|artifact|directory|cwd)\s*[:=]\s*\S*[\\/]\S+/i,
];
const sensitiveContentPatterns = [
  // An encoded image (US-073): a data URI, or base64 that starts like a PNG,
  // JPEG, GIF or WebP file. The SDK drops the same text before sending.
  /data:image\//i,
  /(?:^|[^A-Za-z0-9+/_-])(?:iVBORw0KGgo|\/9j\/|_9j_|R0lGOD|UklGR)/,
  /\b[a-z][a-z\d+.-]*:\/\/[^/\s:@]*:[^/\s@]+@/i,
  /[?&](?:sig|signature|x-amz-signature|x-goog-signature)=\S+/i,
  /\bauthorization["']?\s*[:=]\s*["']?\S+/i,
  /\bbearer\s+\S+/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:ayni_sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk_(?:live|test)_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|shpat_[A-Za-z0-9_-]{8,}|npm_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/,
];
const sensitiveAssignmentPatterns = [
  /\b(?:[A-Za-z0-9]+[_ -])*(?:password|passwd|passphrase|credentials?|secrets?|cookies?|session(?:[_ -]?(?:id|key|token))?|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|private[_ -]?key|encryption[_ -]?key|signing[_ -]?key|token)(?:[_ -][A-Za-z0-9]+)*["']?\s*[:=]\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([\s\S]+))/gi,
  /\b[A-Za-z][A-Za-z0-9]*(?:password|passwd|passphrase|secret|token|credential|cookie|session(?:Id|Key|Token)|(?:api|access|private|secret|signing|encryption)key)["']?\s*[:=]\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([\s\S]+))/gi,
];
const safeCredentialPlaceholderPattern = /^(?:disabled|expired|unset)$/i;
const safeSessionPlaceholderPattern = /^(?:active|present)$/i;
const sessionCredentialKeyPattern = /(?:session|cookie)/i;

function hasSensitiveAssignment(value: string) {
  return sensitiveAssignmentPatterns.some((pattern) => {
    for (const match of value.matchAll(pattern)) {
      const assignmentValue = (match[1] ?? match[2] ?? match[3])?.trim().replace(/[.!?]+$/, "");
      const assignment = match[0];
      if (!assignment) return true;
      const separatorIndex = assignment.search(/[:=]/);
      if (separatorIndex < 0) return true;
      const assignmentKey = assignment.slice(0, separatorIndex).replace(/["']/g, "");
      if (
        !assignmentValue ||
        (!safeCredentialPlaceholderPattern.test(assignmentValue) &&
          !(
            sessionCredentialKeyPattern.test(assignmentKey) &&
            safeSessionPlaceholderPattern.test(assignmentValue)
          ))
      ) {
        return true;
      }
    }
    return false;
  });
}

const sensitiveIdentifierPatterns = [...sensitiveContentPatterns, ...localPathPatterns];
export const safeTraceIdentifierSchema = z
  .string()
  .refine(
    (value) =>
      !hasSensitiveAssignment(value) &&
      !sensitiveIdentifierPatterns.some((pattern) => pattern.test(value)),
    "Sensitive values are not allowed in trace identifiers",
  );
export const safeTraceTextSchema = z.string().refine((value) => {
  const textWithoutHttpRoutes = value.replace(httpRoutePattern, "");
  return (
    !hasSensitiveAssignment(value) &&
    !sensitiveContentPatterns.some((pattern) => pattern.test(value)) &&
    !localPathPatterns.some((pattern) => pattern.test(textWithoutHttpRoutes)) &&
    !phoneNumberPattern.test(value)
  );
}, "Sensitive values are not allowed in trace text fields");
export const safeTraceVersionSchema = z.string().refine((value) => {
  const textWithoutHttpRoutes = value.replace(httpRoutePattern, "");
  return (
    !hasSensitiveAssignment(value) &&
    !sensitiveContentPatterns.some((pattern) => pattern.test(value)) &&
    !localPathPatterns.some((pattern) => pattern.test(textWithoutHttpRoutes)) &&
    (isSemVer(value) || !phoneNumberPattern.test(value))
  );
}, "Sensitive values are not allowed in trace version fields");
const id = safeTraceIdentifierSchema.min(1);
const contextField = safeTraceTextSchema;
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
  runId: contextField.min(1),
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
  appVersion: safeTraceVersionSchema.optional(),
  sdkVersion: safeTraceVersionSchema.optional(),
  measurements: z.array(traceMeasurementSchema),
  incidents: z.array(contextField),
  validity: contextField.optional(),
  workflowId: boundedId,
  workflowVersionId: boundedId,
  workflowVersion: safeTraceVersionSchema.min(1).max(128),
  models: z.array(
    z.strictObject({
      modelVersionId: boundedId,
      version: safeTraceVersionSchema.min(1).max(128),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  profile: traceProfileSchema,
  status: z.enum(["success", "error"]),
  durationMs: z.number().int().nonnegative(),
  nodes: z.array(
    z.strictObject({
      nodeId: boundedId,
      type: z.enum(["input.image", "model.tflite", "condition", "output", "dataset.capture"]),
      status: z.enum(["completed", "skipped", "failed"]),
      durationMs: z.number().int().nonnegative().optional(),
      modelVersionId: boundedId.optional(),
    }),
  ),
  outputs: z.record(safeTraceTextSchema.min(1), traceOutputValueSchema),
  clientReportedFields: z
    .array(clientReportedFieldSchema)
    .max(clientReportedFieldSchema.options.length),
  error: traceErrorSchema.optional(),
});

export type SdkWorkflowTrace = z.infer<typeof sdkTraceSchema>;
