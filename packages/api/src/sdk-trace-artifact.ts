import { z } from "zod";

/** Cloudflare R2's 4.995 GiB maximum for one PutObject request. */
export const SDK_TRACE_ARTIFACT_MAX_BYTES = 5_363_340_410;
export const SDK_TRACE_ARTIFACT_UPLOAD_URL_TTL_SECONDS = 60 * 60;

const logicalNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || codePoint === 0x7f;
      }),
  );
const producerTextSchema = z.string().trim().min(1).max(128);

export const sdkTraceArtifactUploadRequestSchema = z.strictObject({
  logicalName: logicalNameSchema,
  producerTool: producerTextSchema.optional(),
  producerVersion: producerTextSchema.optional(),
  byteLength: z.number().int().positive().max(SDK_TRACE_ARTIFACT_MAX_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const sdkTraceArtifactMetadataSchema = z.strictObject({
  artifactId: z.uuid(),
  format: z.literal("perfetto_trace_proto"),
  byteLength: z.number().int().positive().max(SDK_TRACE_ARTIFACT_MAX_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  logicalName: logicalNameSchema,
  producerTool: producerTextSchema.nullable(),
  producerVersion: producerTextSchema.nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
});

export const sdkTraceArtifactUploadIntentSchema = z.strictObject({
  artifactId: z.uuid(),
  uploadUrl: z.url(),
  uploadUrlExpiresAt: z.iso.datetime(),
  requiredHeaders: z.strictObject({
    "Content-Type": z.literal("application/octet-stream"),
    "Content-Length": z.string().regex(/^\d+$/),
  }),
});

export const sdkTraceArtifactCompletionSchema = z.strictObject({
  artifact: sdkTraceArtifactMetadataSchema,
});

export type SdkTraceArtifactUploadRequest = z.infer<typeof sdkTraceArtifactUploadRequestSchema>;
export type SdkTraceArtifactMetadata = z.infer<typeof sdkTraceArtifactMetadataSchema>;
export type SdkTraceArtifactUploadIntent = z.infer<typeof sdkTraceArtifactUploadIntentSchema>;
