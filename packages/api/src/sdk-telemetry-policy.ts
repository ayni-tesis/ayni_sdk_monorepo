import { z } from "zod";

/** Policy fields the SDK needs to decide whether local trace capture is enabled. */
export const sdkTelemetryPolicySchema = z
  .object({
    enabled: z.boolean(),
    retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  })
  .strict();
