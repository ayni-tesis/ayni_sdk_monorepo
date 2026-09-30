import type { SdkConsentReceipt } from "@ayni/api/sdk-consent";
import type * as schema from "@ayni/db/schema/index";
import { sdkConsentReceipt } from "@ayni/db/schema/index";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type SdkConsentReceiptDatabase = PostgresJsDatabase<typeof schema>;

export type RecordSdkConsentReceiptInput = SdkConsentReceipt & {
  applicationId: string;
};

export type RecordSdkConsentReceiptResult =
  | { ok: true; receiptId: string; receivedAt: string }
  | { ok: false; reason: "conflict" };

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  throw new Error("Consent receipt returned an invalid timestamp");
}

export async function recordSdkConsentReceipt(
  database: SdkConsentReceiptDatabase,
  { applicationId, ...receipt }: RecordSdkConsentReceiptInput,
): Promise<RecordSdkConsentReceiptResult> {
  const receiptId = receipt.receiptId.toLowerCase();
  const subjectId = receipt.subjectId.toLowerCase();
  const decidedAt = new Date(receipt.decidedAt);
  const [inserted] = await database
    .insert(sdkConsentReceipt)
    .values({
      applicationId,
      receiptId,
      subjectId,
      purpose: receipt.purpose,
      decision: receipt.decision,
      noticeVersion: receipt.noticeVersion,
      decidedAt,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return {
      ok: true,
      receiptId,
      receivedAt: iso(inserted.receivedAt),
    };
  }

  const [existing] = await database
    .select({
      subjectId: sdkConsentReceipt.subjectId,
      purpose: sdkConsentReceipt.purpose,
      decision: sdkConsentReceipt.decision,
      noticeVersion: sdkConsentReceipt.noticeVersion,
      decidedAt: sdkConsentReceipt.decidedAt,
      receivedAt: sdkConsentReceipt.receivedAt,
    })
    .from(sdkConsentReceipt)
    .where(
      and(
        eq(sdkConsentReceipt.applicationId, applicationId),
        eq(sdkConsentReceipt.receiptId, receiptId),
      ),
    )
    .limit(1);

  if (
    !existing ||
    existing.subjectId !== subjectId ||
    existing.purpose !== receipt.purpose ||
    existing.decision !== receipt.decision ||
    existing.noticeVersion !== receipt.noticeVersion ||
    iso(existing.decidedAt) !== decidedAt.toISOString()
  ) {
    return { ok: false, reason: "conflict" };
  }

  return {
    ok: true,
    receiptId,
    receivedAt: iso(existing.receivedAt),
  };
}
