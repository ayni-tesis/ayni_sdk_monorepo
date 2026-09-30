import { z } from "zod";

export const SDK_CONSENT_PURPOSES = ["ayniModelImprovement", "ayniSdkImprovement"] as const;
export const SDK_CONSENT_DECISIONS = ["accepted", "declined"] as const;

const randomUuid = z
  .uuid()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, {
    message: "Debe ser un identificador aleatorio UUID v4.",
  });

/** One end user's explicit choice for one optional Ayni-owned purpose. */
export const sdkConsentReceiptSchema = z.strictObject({
  receiptId: randomUuid,
  subjectId: randomUuid,
  purpose: z.enum(SDK_CONSENT_PURPOSES),
  decision: z.enum(SDK_CONSENT_DECISIONS),
  noticeVersion: z.string().trim().min(1).max(128),
  decidedAt: z.iso.datetime({ offset: true }),
});

export type SdkConsentReceipt = z.infer<typeof sdkConsentReceiptSchema>;
