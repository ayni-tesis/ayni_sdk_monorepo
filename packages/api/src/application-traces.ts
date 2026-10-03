import { z } from "zod";
import { safeTraceVersionSchema, sdkTraceSchema } from "./sdk-trace";

export const APPLICATION_TRACE_PAGE_SIZE = 50;
export const APPLICATION_TRACE_MAX_PAGE_SIZE = 100;

export const applicationTracePageQuerySchema = z.strictObject({
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
export type ApplicationTraceSummary = z.infer<typeof applicationTraceSummarySchema>;
export type ApplicationTraceRecord = z.infer<typeof applicationTraceRecordSchema>;
export type ApplicationTraceListResponse = z.infer<typeof applicationTraceListResponseSchema>;
