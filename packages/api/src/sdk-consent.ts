import { z } from "zod";

export const SDK_CONSENT_PURPOSES = ["ayniModelImprovement", "ayniSdkImprovement"] as const;
export const SDK_CONSENT_DECISIONS = ["accepted", "declined"] as const;

const randomUuid = z.uuid().refine((value) => value[14] === "4", {
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
