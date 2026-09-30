import type { SdkConsentReceipt } from "@ayni/api/sdk-consent";
import { describe, expect, it, vi } from "vitest";
import { recordSdkConsentReceipt, type SdkConsentReceiptDatabase } from "./sdk-consent-store";

const receipt: SdkConsentReceipt = {
  receiptId: "550e8400-e29b-41d4-a716-446655440001",
  subjectId: "550e8400-e29b-41d4-a716-446655440000",
  purpose: "ayniModelImprovement",
  decision: "accepted",
  noticeVersion: "1.0.0",
  decidedAt: "2026-09-30T12:00:00.000Z",
};

function makeDatabase({ inserted, existing }: { inserted?: object; existing?: object } = {}) {
  const values = vi.fn();
  const where = vi.fn();
  const database = {
    insert: vi.fn(() => ({
      values: (value: Record<string, unknown>) => {
        values(value);
        return {
          onConflictDoNothing: () => ({ returning: async () => (inserted ? [inserted] : []) }),
        };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: (condition: unknown) => {
          where(condition);
          return { limit: async () => (existing ? [existing] : []) };
        },
      }),
    })),
  };
  return { database: database as unknown as SdkConsentReceiptDatabase, values, where };
}

describe("recordSdkConsentReceipt", () => {
  it("stores the minimum pseudonymous receipt and returns server time", async () => {
    const receivedAt = new Date("2026-09-30T12:01:00.000Z");
    const { database, values } = makeDatabase({ inserted: { receivedAt } });

    await expect(
      recordSdkConsentReceipt(database, { ...receipt, applicationId: "app-1" }),
    ).resolves.toEqual({
      ok: true,
      receiptId: receipt.receiptId,
      receivedAt: receivedAt.toISOString(),
    });
    expect(values).toHaveBeenCalledWith({
      applicationId: "app-1",
      receiptId: receipt.receiptId,
      subjectId: receipt.subjectId,
      purpose: receipt.purpose,
      decision: receipt.decision,
      noticeVersion: receipt.noticeVersion,
      decidedAt: new Date(receipt.decidedAt),
    });
  });

  it("acknowledges an identical retry without inserting a duplicate", async () => {
    const receivedAt = new Date("2026-09-30T12:01:00.000Z");
    const { database } = makeDatabase({
      existing: {
        subjectId: receipt.subjectId,
        purpose: receipt.purpose,
        decision: receipt.decision,
        noticeVersion: receipt.noticeVersion,
        decidedAt: new Date(receipt.decidedAt),
        receivedAt,
      },
    });

    await expect(
      recordSdkConsentReceipt(database, { ...receipt, applicationId: "app-1" }),
    ).resolves.toEqual({
      ok: true,
      receiptId: receipt.receiptId,
      receivedAt: receivedAt.toISOString(),
    });
  });

  it("does not treat a different decision under the same receipt id as a retry", async () => {
    const { database } = makeDatabase({
      existing: {
        subjectId: receipt.subjectId,
        purpose: receipt.purpose,
        decision: "declined",
        noticeVersion: receipt.noticeVersion,
        decidedAt: new Date(receipt.decidedAt),
        receivedAt: new Date(receipt.decidedAt),
      },
    });

    await expect(
      recordSdkConsentReceipt(database, { ...receipt, applicationId: "app-1" }),
    ).resolves.toEqual({ ok: false, reason: "conflict" });
  });
});
