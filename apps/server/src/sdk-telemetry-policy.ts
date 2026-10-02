import { Hono } from "hono";
import { INVALID_CREDENTIAL_MESSAGE, type VerifySdkCredentialResult } from "./sdk-credential-store";
import type { TelemetryPolicy } from "./telemetry-policy-store";

type Dependencies = {
  credentials: { verify: (secret: string) => Promise<VerifySdkCredentialResult> };
  policies: { get: (applicationId: string) => Promise<TelemetryPolicy> };
};

/** Creates the SDK endpoint for reading its application's telemetry capture policy. */
export function createSdkTelemetryPolicyApp({ credentials, policies }: Dependencies) {
  const app = new Hono();

  app.get("/sdk/telemetry-policy", async (c) => {
    const bearer = /^bearer +([^\s]+)$/i.exec(c.req.header("Authorization") ?? "");
    const secret = bearer?.[1];
    if (!secret || !/^ayni_sk_[A-Za-z0-9_-]+$/.test(secret)) {
      return c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401);
    }

    const verified = await credentials.verify(secret);
    if (verified.ok === false)
      return c.json({ message: verified.message, code: verified.code }, 401);

    const policy = await policies.get(verified.credential.applicationId);
    return c.json({ enabled: policy.enabled, retentionDays: policy.retentionDays });
  });

  return app;
}
