import { Hono } from "hono";

import type { GetSdkModelVersionManifestResult } from "./model-version-store";
import {
  INVALID_CREDENTIAL_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";

type Dependencies = {
  credentials: {
    verify: (secret: string) => Promise<VerifySdkCredentialResult>;
  };
  modelVersions: {
    getManifest: (
      applicationId: string,
      modelVersionId: string,
    ) => Promise<GetSdkModelVersionManifestResult>;
  };
};

const MODEL_VERSION_NOT_FOUND_MESSAGE = "La versión del modelo ya no está disponible.";

/**
 * Creates the Hono sub-application exposing the SDK-facing model API: the
 * download manifest of a model version, authenticated with the SDK
 * credential secret (never a dashboard session).
 */
export function createSdkModelVersionsApp({ credentials, modelVersions }: Dependencies) {
  const app = new Hono();

  app.get("/sdk/model-versions/:modelVersionId/manifest", async (c) => {
    const authorization = c.req.header("Authorization") ?? "";
    const secret = /^Bearer (ayni_sk_[A-Za-z0-9_-]+)$/.exec(authorization)?.[1];
    if (!secret) {
      return c.json({ message: INVALID_CREDENTIAL_MESSAGE, code: "invalidCredential" }, 401);
    }

    const verified = await credentials.verify(secret);
    if (!verified.ok) {
      return c.json({ message: verified.message, code: verified.code }, 401);
    }

    const result = await modelVersions.getManifest(
      verified.credential.applicationId,
      c.req.param("modelVersionId"),
    );
    if (!result.ok) {
      return c.json(
        { message: MODEL_VERSION_NOT_FOUND_MESSAGE, code: "modelVersionNotFound" },
        404,
      );
    }

    return c.json({ manifest: result.manifest });
  });

  return app;
}
