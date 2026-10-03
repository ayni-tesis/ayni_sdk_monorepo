import { z } from "zod";
import { safeTraceVersionSchema, sdkTraceSchema } from "./sdk-trace";

export const APPLICATION_TRACE_PAGE_SIZE = 50;
export const APPLICATION_TRACE_MAX_PAGE_SIZE = 100;

const traceFilterText = z.string().trim().min(1).max(128);
const traceContextFilterText = z.string().min(1);
const traceVersionFilterText = safeTraceVersionSchema.trim().min(1).max(128);
const nonNegativeIntegerQuery = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative());
const positiveIntegerQuery = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive());

export const applicationTraceFiltersSchema = z
  .strictObject({
    workflowId: traceFilterText.optional(),
    workflowVersion: traceVersionFilterText.optional(),
    modelId: traceFilterText.optional(),
    modelVersionId: traceFilterText.optional(),
    modelVersion: traceVersionFilterText.optional(),
    status: z.enum(["success", "error"]).optional(),
    receivedFrom: z.iso.date().optional(),
    receivedTo: z.iso.date().optional(),
    platform: z.enum(["android", "ios", "unknown"]).optional(),
    deviceModel: traceContextFilterText.optional(),
    osVersion: traceContextFilterText.optional(),
    apiLevel: nonNegativeIntegerQuery.optional(),
    ramRange: traceContextFilterText.optional(),
    socModel: traceContextFilterText.optional(),
    runId: traceContextFilterText.optional(),
    repetition: positiveIntegerQuery.optional(),
    condition: traceContextFilterText.optional(),
    caseId: traceContextFilterText.optional(),
    scenario: traceContextFilterText.optional(),
    backend: traceContextFilterText.optional(),
  })
  .refine(
    ({ receivedFrom, receivedTo }) => !receivedFrom || !receivedTo || receivedFrom <= receivedTo,
    { path: ["receivedTo"], error: "The end date must not be before the start date." },
  );

export const applicationTracePageQuerySchema = applicationTraceFiltersSchema.extend({
  cursor: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(APPLICATION_TRACE_MAX_PAGE_SIZE)
    .default(APPLICATION_TRACE_PAGE_SIZE),
});

const traceSummarySchema = sdkTraceSchema
  .pick({
    traceId: true,
    timestamp: true,
    workflowId: true,
    workflowVersionId: true,
    workflowVersion: true,
    profile: true,
    status: true,
    durationMs: true,
  })
  .extend({
    models: z.array(z.strictObject({ version: safeTraceVersionSchema.min(1).max(128) })),
  });

export const applicationTraceSummarySchema = z.strictObject({
  source: z.literal("clientReported"),
  receivedAt: z.iso.datetime(),
  trace: traceSummarySchema,
});

export const applicationTraceRecordSchema = z.strictObject({
  source: z.literal("clientReported"),
  receivedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  trace: sdkTraceSchema,
});

export const applicationTraceListResponseSchema = z.strictObject({
  traces: z.array(applicationTraceSummarySchema),
  nextCursor: z.string().nullable(),
});

export type ApplicationTracePageQuery = z.infer<typeof applicationTracePageQuerySchema>;
export type ApplicationTraceFilters = z.infer<typeof applicationTraceFiltersSchema>;
export type ApplicationTraceSummary = z.infer<typeof applicationTraceSummarySchema>;
export type ApplicationTraceRecord = z.infer<typeof applicationTraceRecordSchema>;
export type ApplicationTraceListResponse = z.infer<typeof applicationTraceListResponseSchema>;
