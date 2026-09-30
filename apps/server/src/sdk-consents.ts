import { sdkConsentReceiptSchema } from "@ayni/api/sdk-consent";
import { AYNI_PRIVACY_NOTICE } from "@ayni/env/privacy-notice";
import { Hono } from "hono";
import type { RecordSdkConsentReceiptResult } from "./sdk-consent-store";
import { INVALID_CREDENTIAL_MESSAGE, type VerifySdkCredentialResult } from "./sdk-credential-store";

type Dependencies = {
  credentials: { verify: (secret: string) => Promise<VerifySdkCredentialResult> };
  privacyNoticePublished?: boolean;
  consents: {
    record: (
      applicationId: string,
      receipt: ReturnType<typeof sdkConsentReceiptSchema.parse>,
    ) => Promise<RecordSdkConsentReceiptResult>;
  };
};

const invalidConsent = {
  message: "La decisión de consentimiento no es válida.",
  code: "invalidConsent",
};

export function createSdkConsentsApp({
  credentials,
  consents,
  privacyNoticePublished = AYNI_PRIVACY_NOTICE.status === "published",
}: Dependencies) {
  const app = new Hono();

  app.post("/sdk/consents", async (c) => {
    const bearer = /^bearer +(\S+)$/i.exec(c.req.header("Authorization") ?? "");
    const secret = bearer?.[1];
    if (!secret || !/^ayni_sk_[A-Za-z0-9_-]+$/.test(secret)) {
      return c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401);
    }

    const verified = await credentials.verify(secret);
    if (verified.ok === false) {
      return c.json({ message: verified.message, code: verified.code }, 401);
    }
    if (!privacyNoticePublished) {
      return c.json(
        {
          message: "El aviso de privacidad de Ayni aún no está publicado.",
          code: "privacyNoticeUnavailable",
        },
        503,
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(invalidConsent, 400);
    }

    const parsed = sdkConsentReceiptSchema.safeParse(rawBody);
    if (!parsed.success) return c.json(invalidConsent, 400);

    const result = await consents.record(verified.credential.applicationId, parsed.data);
    if (result.ok === false) {
      return c.json(
        {
          message: "El recibo de consentimiento ya existe con otros datos.",
          code: "consentReceiptConflict",
        },
        409,
      );
    }

    return c.json({ receiptId: result.receiptId, receivedAt: result.receivedAt }, 201);
  });

  return app;
}
