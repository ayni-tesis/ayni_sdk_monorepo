import type { SdkConsentReceipt } from "@ayni/api/sdk-consent";
import { describe, expect, it, vi } from "vitest";
import type { RecordSdkConsentReceiptResult } from "./sdk-consent-store";
import { createSdkConsentsApp } from "./sdk-consents";
import type { VerifySdkCredentialResult } from "./sdk-credential-store";

const SECRET = "ayni_sk_abcd1234rest-of-secret";
const receipt: SdkConsentReceipt = {
  receiptId: "550e8400-e29b-41d4-a716-446655440001",
  subjectId: "550e8400-e29b-41d4-a716-446655440000",
  purpose: "ayniModelImprovement",
  decision: "accepted",
  noticeVersion: "1.0.0",
  decidedAt: "2026-09-30T12:00:00.000Z",
};

function makeApp({
  verify,
  record,
}: {
  verify?: (secret: string) => Promise<VerifySdkCredentialResult>;
  record?: (
    applicationId: string,
    receipt: SdkConsentReceipt,
  ) => Promise<RecordSdkConsentReceiptResult>;
} = {}) {
  verify ??= async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "credential-1", applicationId: "application-1" },
  });
  record ??= async () => ({
    ok: true,
    receiptId: receipt.receiptId,
    receivedAt: "2026-09-30T12:01:00.000Z",
  });
  const verifyMock = vi.fn(verify);
  const recordMock = vi.fn(record);
  return {
    app: createSdkConsentsApp({
      credentials: { verify: verifyMock },
      consents: { record: recordMock },
      privacyNoticePublished: true,
    }),
    verifyMock,
    recordMock,
  };
}

describe("POST /sdk/consents", () => {
  it("stores a valid pseudonymous receipt for the credential's application", async () => {
    const { app, recordMock } = makeApp();
    const response = await app.request("/sdk/consents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(receipt),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      receiptId: receipt.receiptId,
      receivedAt: "2026-09-30T12:01:00.000Z",
    });
    expect(recordMock).toHaveBeenCalledWith("application-1", receipt);
  });

  it("rejects malformed credentials before parsing or writing the receipt", async () => {
    const { app, verifyMock, recordMock } = makeApp();
    const response = await app.request("/sdk/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receipt),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "invalidCredential" });
    expect(verifyMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("rejects malformed or over-specified consent decisions", async () => {
    const { app, recordMock } = makeApp();
    const response = await app.request("/sdk/consents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...receipt, email: "person@example.test" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "La decisión de consentimiento no es válida.",
      code: "invalidConsent",
    });
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("rejects a receipt id reused for a different choice", async () => {
    const { app } = makeApp({ record: async () => ({ ok: false, reason: "conflict" }) });
    const response = await app.request("/sdk/consents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(receipt),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "consentReceiptConflict" });
  });

  it("does not store a choice while Ayni's notice is a draft", async () => {
    const { verifyMock, recordMock } = makeApp();
    const app = createSdkConsentsApp({
      credentials: { verify: verifyMock },
      consents: { record: recordMock },
      privacyNoticePublished: false,
    });
    const response = await app.request("/sdk/consents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(receipt),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "privacyNoticeUnavailable" });
    expect(recordMock).not.toHaveBeenCalled();
  });
});
