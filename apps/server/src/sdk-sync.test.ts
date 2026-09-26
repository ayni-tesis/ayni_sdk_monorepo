import { describe, expect, it, vi } from "vitest";

import type { VerifySdkCredentialResult } from "./sdk-credential-store";
import { createSdkSyncApp, SYNC_CREDENTIAL_REVOKED_MESSAGE } from "./sdk-sync";
import type { SdkSyncManifest } from "./sdk-sync-manifest-store";

const SECRET = "ayni_sk_abcd1234rest-of-secret";
const manifest: SdkSyncManifest = {
  workflows: [
    {
      workflowId: "workflow-1",
      workflowVersionId: "workflow-version-1",
      name: "Clasificar hoja",
      version: "1.2.0",
      modelVersionIds: ["model-version-1"],
    },
  ],
  models: [{ modelVersionId: "model-version-1", version: "2.0.0", sha256: "a".repeat(64) }],
};

function makeApp({
  verify = async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "credential-1", applicationId: "application-1" },
  }),
  getManifest = async (): Promise<SdkSyncManifest> => manifest,
}: {
  verify?: (secret: string) => Promise<VerifySdkCredentialResult>;
  getManifest?: (applicationId: string) => Promise<SdkSyncManifest>;
} = {}) {
  const verifyMock = vi.fn(verify);
  const getManifestMock = vi.fn(getManifest);
  return {
    app: createSdkSyncApp({
      credentials: { verify: verifyMock },
      sync: { getManifest: getManifestMock },
    }),
    verifyMock,
    getManifestMock,
  };
}

describe("POST /sdk/sync", () => {
  it("returns only the credential application's published resource manifest", async () => {
    const { app, verifyMock, getManifestMock } = makeApp();

    const response = await app.request("/sdk/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual(manifest);
    expect(body).not.toMatch(/secret|storage.?key|download.?url/i);
    expect(verifyMock).toHaveBeenCalledWith(SECRET);
    expect(getManifestMock).toHaveBeenCalledWith("application-1");
  });

  it.each([undefined, "Bearer invalid", "Bearerayni_sk_abcd1234rest-of-secret"])(
    "rejects malformed credentials without querying resources",
    async (authorization) => {
      const { app, verifyMock, getManifestMock } = makeApp();
      const response = await app.request("/sdk/sync", {
        method: "POST",
        headers: authorization ? { Authorization: authorization } : {},
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: "invalidCredential" });
      expect(verifyMock).not.toHaveBeenCalled();
      expect(getManifestMock).not.toHaveBeenCalled();
    },
  );

  it("returns credentialRevoked without delivering resources", async () => {
    const { app, getManifestMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: "La credencial fue revocada. Genera una nueva credencial para continuar.",
      }),
    });

    const response = await app.request("/sdk/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: SYNC_CREDENTIAL_REVOKED_MESSAGE,
      code: "credentialRevoked",
    });
    expect(getManifestMock).not.toHaveBeenCalled();
  });
});
