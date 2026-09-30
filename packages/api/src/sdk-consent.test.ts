import { describe, expect, it } from "vitest";

import { sdkConsentReceiptSchema } from "./sdk-consent";

const receipt = {
  receiptId: "550e8400-e29b-41d4-a716-446655440001",
  subjectId: "550e8400-e29b-41d4-a716-446655440000",
  purpose: "ayniModelImprovement",
  decision: "accepted",
  noticeVersion: "1.0.0",
  decidedAt: "2026-09-30T12:00:00.000Z",
};

describe("SDK consent receipt schema", () => {
  it("accepts one explicit Ayni purpose and decision", () => {
    expect(sdkConsentReceiptSchema.parse(receipt)).toEqual(receipt);
  });

  it("rejects identifiers that are not random UUID v4 values", () => {
    expect(
      sdkConsentReceiptSchema.safeParse({ ...receipt, subjectId: "person@example.test" }).success,
    ).toBe(false);
    expect(
      sdkConsentReceiptSchema.safeParse({
        ...receipt,
        receiptId: "550e8400-e29b-11d4-a716-446655440001",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields and invalid purposes or decisions", () => {
    expect(
      sdkConsentReceiptSchema.safeParse({ ...receipt, email: "person@example.test" }).success,
    ).toBe(false);
    expect(sdkConsentReceiptSchema.safeParse({ ...receipt, purpose: "allData" }).success).toBe(
      false,
    );
    expect(sdkConsentReceiptSchema.safeParse({ ...receipt, decision: "maybe" }).success).toBe(
      false,
    );
  });
});
