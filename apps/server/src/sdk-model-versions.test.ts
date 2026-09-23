import { describe, expect, it, vi } from "vitest";

import type {
  GetSdkModelVersionManifestResult,
  SdkModelVersionManifest,
} from "./model-version-store";
import {
  SDK_CREDENTIAL_REVOKED_MESSAGE,
  type VerifySdkCredentialResult,
} from "./sdk-credential-store";
import { createSdkModelVersionsApp } from "./sdk-model-versions";

const SECRET = "ayni_sk_abcd1234rest-of-secret";

const ownManifest: SdkModelVersionManifest = {
  modelVersionId: "mv-1",
  version: "1.2.0",
  sha256: "c".repeat(64),
  sizeBytes: 2048,
  downloadUrl: "https://signed.example/applications/app-1/models/model-1/versions/1.2.0.tflite",
  downloadUrlExpiresAt: "2026-09-21T01:00:00.000Z",
  contract: null,
};

function makeApp({
  verify = async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "cred-1", applicationId: "app-1" },
  }),
  getManifest = async (): Promise<GetSdkModelVersionManifestResult> => ({
    ok: true,
    manifest: ownManifest,
  }),
}: {
  verify?: (secret: string) => Promise<VerifySdkCredentialResult>;
  getManifest?: (
    applicationId: string,
    modelVersionId: string,
  ) => Promise<GetSdkModelVersionManifestResult>;
} = {}) {
  const verifyMock = vi.fn(verify);
  const getManifestMock = vi.fn(getManifest);
  const app = createSdkModelVersionsApp({
    credentials: { verify: verifyMock },
    modelVersions: { getManifest: getManifestMock },
  });
  return { app, verifyMock, getManifestMock };
}

function sdkRequest(secret?: string) {
  const headers: Record<string, string> = {};
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return { method: "GET", headers };
}

const MANIFEST_URL = "/sdk/model-versions/mv-1/manifest";

describe("GET /sdk/model-versions/:modelVersionId/manifest", () => {
  it("returns the manifest to an active credential of the owning application", async () => {
    const { app, verifyMock, getManifestMock } = makeApp();

    const response = await app.request(MANIFEST_URL, sdkRequest(SECRET));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ manifest: ownManifest });
    expect(verifyMock).toHaveBeenCalledWith(SECRET);
    expect(getManifestMock).toHaveBeenCalledWith("app-1", "mv-1");
  });

  it.each([
    ["no Authorization header", undefined],
    ["a non-SDK bearer token", "some-other-token"],
    ["a malformed credential", "ayni_sk_not*valid*base64url!"],
    ["an uppercased credential", "BEARER AYNi_SK_ABCD1234rest-of-secret"],
    ["a scheme without a space", "Bearerayni_sk_abcd1234rest-of-secret"],
  ])("rejects %s with 401 without consulting credentials", async (_label, authorization) => {
    const { app, verifyMock, getManifestMock } = makeApp();

    const response = await app.request(MANIFEST_URL, {
      method: "GET",
      headers: authorization ? { Authorization: authorization } : {},
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "invalidCredential" });
    expect(verifyMock).not.toHaveBeenCalled();
    expect(getManifestMock).not.toHaveBeenCalled();
  });

  it.each(["bearer ayni_sk_abcd1234rest-of-secret", "BEARER  ayni_sk_abcd1234rest-of-secret"])(
    "accepts the %s spelling of the scheme per the HTTP auth grammar",
    async (authorization) => {
      const { app, verifyMock } = makeApp();

      const response = await app.request(MANIFEST_URL, {
        method: "GET",
        headers: { Authorization: authorization },
      });

      expect(response.status).toBe(200);
      expect(verifyMock).toHaveBeenCalledWith(SECRET);
    },
  );

  it("rejects a revoked credential with the credentialRevoked state and no manifest", async () => {
    const { app, getManifestMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      }),
    });

    const response = await app.request(MANIFEST_URL, sdkRequest(SECRET));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: SDK_CREDENTIAL_REVOKED_MESSAGE,
      code: "credentialRevoked",
    });
    expect(getManifestMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown credential with the invalidCredential state", async () => {
    const { app, getManifestMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "invalidCredential",
        message: "La credencial no es válida.",
      }),
    });

    const response = await app.request(MANIFEST_URL, sdkRequest(SECRET));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "La credencial no es válida.",
      code: "invalidCredential",
    });
    expect(getManifestMock).not.toHaveBeenCalled();
  });

  it("reports modelVersionNotFound without revealing artifact information", async () => {
    const { app } = makeApp({ getManifest: async () => ({ ok: false, reason: "notFound" }) });

    const response = await app.request(MANIFEST_URL, sdkRequest(SECRET));

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      message: "La versión del modelo ya no está disponible.",
      code: "modelVersionNotFound",
    });
    expect(body).not.toContain("storageKey");
    expect(body).not.toContain("signed.example");
    expect(body).not.toContain("tflite");
  });
});
