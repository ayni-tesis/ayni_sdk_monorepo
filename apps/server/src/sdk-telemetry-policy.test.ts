import { describe, expect, it, vi } from "vitest";
import {
  SDK_CREDENTIAL_REVOKED_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";
import { createSdkTelemetryPolicyApp } from "./sdk-telemetry-policy";

const SECRET = "ayni_sk_abcd1234rest-of-secret";

function makeApp({
  verify = async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "cred-1", applicationId: "app-1" },
  }),
  get = async (applicationId: string) => ({
    applicationId,
    enabled: true,
    retentionDays: 90 as const,
    updatedAt: "2026-10-02T00:00:00.000Z",
  }),
}: {
  verify?: (secret: string) => Promise<VerifySdkCredentialResult>;
  get?: (applicationId: string) => Promise<{
    applicationId: string;
    enabled: boolean;
    retentionDays: 7 | 30 | 90;
    updatedAt: string | null;
  }>;
} = {}) {
  const verifyMock = vi.fn(verify);
  const getMock = vi.fn(get);
  return {
    app: createSdkTelemetryPolicyApp({
      credentials: { verify: verifyMock },
      policies: { get: getMock },
    }),
    verifyMock,
    getMock,
  };
}

describe("GET /sdk/telemetry-policy", () => {
  it("returns only the policy for the application authenticated by the SDK credential", async () => {
    const { app, verifyMock, getMock } = makeApp();

    const response = await app.request("/sdk/telemetry-policy", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enabled: true, retentionDays: 90 });
    expect(verifyMock).toHaveBeenCalledWith(SECRET);
    expect(getMock).toHaveBeenCalledWith("app-1");
  });

  it("returns the disabled policy and default retention when no policy was saved", async () => {
    const { app } = makeApp({
      get: async (applicationId) => ({
        applicationId,
        enabled: false,
        retentionDays: 30,
        updatedAt: null,
      }),
    });

    const response = await app.request("/sdk/telemetry-policy", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    await expect(response.json()).resolves.toEqual({ enabled: false, retentionDays: 30 });
  });

  it.each([undefined, "Bearer invalid"])(
    "rejects a malformed credential",
    async (authorization) => {
      const { app, verifyMock, getMock } = makeApp();
      const response = await app.request("/sdk/telemetry-policy", {
        headers: authorization ? { Authorization: authorization } : {},
      });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: "invalidCredential" });
      expect(verifyMock).not.toHaveBeenCalled();
      expect(getMock).not.toHaveBeenCalled();
    },
  );

  it("does not query policy for a revoked credential", async () => {
    const { app, getMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      }),
    });
    const response = await app.request("/sdk/telemetry-policy", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "credentialRevoked" });
    expect(getMock).not.toHaveBeenCalled();
  });
});
