import { describe, expect, it, vi } from "vitest";
import type { CollectionPolicy } from "./collection-policy-store";
import { createSdkCollectionPolicyApp } from "./sdk-collection-policy";
import {
  SDK_CREDENTIAL_REVOKED_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";

const SECRET = "ayni_sk_abcd1234rest-of-secret";

function makeApp({
  verify = async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "cred-1", applicationId: "app-1" },
  }),
  get = async (applicationId: string): Promise<CollectionPolicy> => ({
    applicationId,
    enabled: true,
    consentRequired: true,
    network: "wifiAndCellular",
    maxImageSize: 640,
    imageQuality: 55,
    updatedAt: "2026-10-02T00:00:00.000Z",
  }),
}: {
  verify?: (secret: string) => Promise<VerifySdkCredentialResult>;
  get?: (applicationId: string) => Promise<CollectionPolicy>;
} = {}) {
  const verifyMock = vi.fn(verify);
  const getMock = vi.fn(get);
  return {
    app: createSdkCollectionPolicyApp({
      credentials: { verify: verifyMock },
      policies: { get: getMock },
    }),
    verifyMock,
    getMock,
  };
}

describe("GET /sdk/collection-policy", () => {
  it("returns the collection policy of the application authenticated by the SDK credential", async () => {
    const { app, verifyMock, getMock } = makeApp();

    const response = await app.request("/sdk/collection-policy", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      enabled: true,
      consentRequired: true,
      network: "wifiAndCellular",
      maxImageSize: 640,
      imageQuality: 55,
    });
    expect(verifyMock).toHaveBeenCalledWith(SECRET);
    expect(getMock).toHaveBeenCalledWith("app-1");
  });

  it("returns the disabled default with its size and quality when no policy was saved", async () => {
    const { app } = makeApp({
      get: async (applicationId) => ({
        applicationId,
        enabled: false,
        consentRequired: false,
        network: "wifi",
        maxImageSize: 1024,
        imageQuality: 80,
        updatedAt: null,
      }),
    });

    const response = await app.request("/sdk/collection-policy", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    await expect(response.json()).resolves.toEqual({
      enabled: false,
      consentRequired: false,
      network: "wifi",
      maxImageSize: 1024,
      imageQuality: 80,
    });
  });

  it.each([undefined, "Bearer invalid"])(
    "rejects a malformed credential",
    async (authorization) => {
      const { app, verifyMock, getMock } = makeApp();
      const response = await app.request("/sdk/collection-policy", {
        headers: authorization ? { Authorization: authorization } : {},
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: "invalidCredential" });
      expect(verifyMock).not.toHaveBeenCalled();
      expect(getMock).not.toHaveBeenCalled();
    },
  );

  it("does not read the policy for a revoked credential", async () => {
    const { app, getMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      }),
    });
    const response = await app.request("/sdk/collection-policy", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "credentialRevoked" });
    expect(getMock).not.toHaveBeenCalled();
  });
});
