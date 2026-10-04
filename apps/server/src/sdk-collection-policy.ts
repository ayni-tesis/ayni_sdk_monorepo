import { Hono } from "hono";
import type { CollectionPolicy } from "./collection-policy-store";
import { INVALID_CREDENTIAL_MESSAGE, type VerifySdkCredentialResult } from "./sdk-credential-store";

type Dependencies = {
  credentials: { verify: (secret: string) => Promise<VerifySdkCredentialResult> };
  policies: { get: (applicationId: string) => Promise<CollectionPolicy> };
};

/**
 * Creates the SDK endpoint for reading its application's evidence collection
 * policy (US-067): the SDK optimizes each evidence image with its size and
 * quality. It answers the default policy when none was saved.
 */
export function createSdkCollectionPolicyApp({ credentials, policies }: Dependencies) {
  const app = new Hono();

  app.get("/sdk/collection-policy", async (c) => {
    const bearer = /^bearer +([^\s]+)$/i.exec(c.req.header("Authorization") ?? "");
    const secret = bearer?.[1];
    if (!secret || !/^ayni_sk_[A-Za-z0-9_-]+$/.test(secret)) {
      return c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401);
    }

    const verified = await credentials.verify(secret);
    if (verified.ok === false)
      return c.json({ message: verified.message, code: verified.code }, 401);

    const policy = await policies.get(verified.credential.applicationId);
    return c.json({
      enabled: policy.enabled,
      consentRequired: policy.consentRequired,
      network: policy.network,
      maxImageSize: policy.maxImageSize,
      imageQuality: policy.imageQuality,
    });
  });

  return app;
}
