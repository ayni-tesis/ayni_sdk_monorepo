import { Hono } from "hono";

import { INVALID_CREDENTIAL_MESSAGE, type VerifySdkCredentialResult } from "./sdk-credential-store";
import type { SdkSyncManifest } from "./sdk-sync-manifest-store";

const SYNC_CREDENTIAL_REVOKED_MESSAGE =
  "La credencial fue revocada. Genera una nueva credencial para sincronizar.";

type Dependencies = {
  credentials: { verify: (secret: string) => Promise<VerifySdkCredentialResult> };
  sync: { getManifest: (applicationId: string) => Promise<SdkSyncManifest> };
};

/** Creates the SDK synchronization manifest endpoint. */
export function createSdkSyncApp({ credentials, sync }: Dependencies) {
  const app = new Hono();

  app.post("/sdk/sync", async (c) => {
    const bearer = /^bearer +(\S+)$/i.exec(c.req.header("Authorization") ?? "");
    const secret = bearer?.[1];
    if (!secret || !/^ayni_sk_[A-Za-z0-9_-]+$/.test(secret)) {
      return c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401);
    }

    const verified = await credentials.verify(secret);
    if (verified.ok === false) {
      return c.json(
        {
          message:
            verified.code === "credentialRevoked"
              ? SYNC_CREDENTIAL_REVOKED_MESSAGE
              : verified.message,
          code: verified.code,
        },
        401,
      );
    }

    return c.json(await sync.getManifest(verified.credential.applicationId));
  });

  return app;
}

export { SYNC_CREDENTIAL_REVOKED_MESSAGE };
