import { describe, expect, it, vi } from "vitest";

import type { ValidationDatasetStoreResult } from "./validation-dataset-store";
import type { VerifySdkCredentialResult } from "./sdk-credential-store";
import { createSdkValidationDatasetsApp } from "./sdk-validation-datasets";

const SECRET = "ayni_sk_abcd1234rest-of-secret";
const DATASET_VERSION_ID = "dataset-version-1";
const STORAGE_KEY = "applications/app-1/validation-datasets/dataset-1/versions/version-1.zip";
const EXPIRY_BASE = new Date("2026-10-04T12:00:00.000Z");

const manifestData = {
  datasetVersionId: DATASET_VERSION_ID,
  datasetId: "dataset-1",
  applicationId: "app-1",
  version: "1.0.0",
  partition: "validation",
  source: "Colección de tesis",
  license: "CC BY 4.0",
  sha256: "a".repeat(64),
  sizeBytes: 42,
  storageKey: STORAGE_KEY,
};

function makeApp({
  verify = async (): Promise<VerifySdkCredentialResult> => ({
    ok: true,
    credential: { credentialId: "cred-1", applicationId: "app-1" },
  }),
  getManifestData = async (): Promise<ValidationDatasetStoreResult<typeof manifestData>> => ({
    ok: true,
    value: manifestData,
  }),
  createDownloadUrl = async () => "https://signed.example/private-dataset?token=temporary",
  now = () => new Date(EXPIRY_BASE),
}: {
  verify?: (secret: string) => Promise<VerifySdkCredentialResult>;
  getManifestData?: (
    applicationId: string,
    datasetVersionId: string,
  ) => Promise<ValidationDatasetStoreResult<typeof manifestData>>;
  createDownloadUrl?: (key: string, expiresIn: number) => Promise<string>;
  now?: () => Date;
} = {}) {
  const verifyMock = vi.fn(verify);
  const getManifestDataMock = vi.fn(getManifestData);
  const createDownloadUrlMock = vi.fn(createDownloadUrl);
  const app = createSdkValidationDatasetsApp({
    credentials: { verify: verifyMock },
    datasets: { getManifestData: getManifestDataMock },
    storage: { createDownloadUrl: createDownloadUrlMock },
    now,
  });
  return { app, verifyMock, getManifestDataMock, createDownloadUrlMock };
}

function sdkRequest(authorization = `Bearer ${SECRET}`) {
  return { method: "GET", headers: { Authorization: authorization } };
}

const MANIFEST_URL = `/sdk/dataset-versions/${DATASET_VERSION_ID}/manifest`;

describe("GET /sdk/dataset-versions/:datasetVersionId/manifest", () => {
  it("returns a fresh private download URL scoped by the active application credential", async () => {
    const { app, verifyMock, getManifestDataMock, createDownloadUrlMock } = makeApp();

    const response = await app.request(MANIFEST_URL, sdkRequest());

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      manifest: {
        datasetVersionId: DATASET_VERSION_ID,
        datasetId: "dataset-1",
        version: "1.0.0",
        partition: "validation",
        source: "Colección de tesis",
        license: "CC BY 4.0",
        sha256: "a".repeat(64),
        sizeBytes: 42,
        downloadUrl: "https://signed.example/private-dataset?token=temporary",
        downloadUrlExpiresAt: "2026-10-04T12:15:00.000Z",
      },
    });
    expect(verifyMock).toHaveBeenCalledWith(SECRET);
    expect(getManifestDataMock).toHaveBeenCalledWith("app-1", DATASET_VERSION_ID);
    expect(createDownloadUrlMock).toHaveBeenCalledWith(STORAGE_KEY, 900);
    expect(body).not.toContain("storageKey");
    expect(body).not.toContain("applications/app-1/");
  });

  it.each([
    ["no Authorization header", ""],
    ["a non-SDK bearer token", "Bearer dashboard-session"],
    ["a malformed SDK credential", "Bearer ayni_sk_not*valid*secret!"],
  ])("rejects %s without checking storage", async (_label, authorization) => {
    const { app, verifyMock, getManifestDataMock, createDownloadUrlMock } = makeApp();

    const response = await app.request(MANIFEST_URL, {
      method: "GET",
      headers: authorization ? { Authorization: authorization } : {},
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "invalidCredential" });
    expect(verifyMock).not.toHaveBeenCalled();
    expect(getManifestDataMock).not.toHaveBeenCalled();
    expect(createDownloadUrlMock).not.toHaveBeenCalled();
  });

  it("rejects a revoked credential without looking up or signing a dataset", async () => {
    const { app, getManifestDataMock, createDownloadUrlMock } = makeApp({
      verify: async () => ({
        ok: false,
        code: "credentialRevoked",
        message: "La credencial fue revocada. Genera una nueva credencial para continuar.",
      }),
    });

    const response = await app.request(MANIFEST_URL, sdkRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "credentialRevoked" });
    expect(getManifestDataMock).not.toHaveBeenCalled();
    expect(createDownloadUrlMock).not.toHaveBeenCalled();
  });

    it("hides an archived application's datasets behind the unavailable-version response", async () => {
      const { app, getManifestDataMock, createDownloadUrlMock } = makeApp({
        verify: async () => ({
          ok: false,
          code: "applicationArchived",
          message: "La credencial no es válida.",
        }),
      });

      const response = await app.request(MANIFEST_URL, sdkRequest());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: "El dataset de validación ya no está disponible.",
        code: "datasetVersionNotFound",
      });
      expect(getManifestDataMock).not.toHaveBeenCalled();
      expect(createDownloadUrlMock).not.toHaveBeenCalled();
    });

  it.each(["foreign application", "missing version", "archived application"])(
    "returns the same 404 for a %s and never asks R2 to sign it",
    async () => {
      const { app, createDownloadUrlMock } = makeApp({
        getManifestData: async () => ({ ok: false, reason: "notFound" }),
      });

      const response = await app.request(MANIFEST_URL, sdkRequest());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        message: "El dataset de validación ya no está disponible.",
        code: "datasetVersionNotFound",
      });
      expect(createDownloadUrlMock).not.toHaveBeenCalled();
    },
  );

  it("accepts case-insensitive bearer schemes with multiple spaces", async () => {
    const { app, verifyMock } = makeApp();

    const response = await app.request(MANIFEST_URL, sdkRequest(`BEARER  ${SECRET}`));

    expect(response.status).toBe(200);
    expect(verifyMock).toHaveBeenCalledWith(SECRET);
  });

  it("reports a storage signing failure without revealing the key", async () => {
    const { app } = makeApp({
      createDownloadUrl: async () => {
        throw new Error("R2 signer unavailable");
      },
    });

    const response = await app.request(MANIFEST_URL, sdkRequest());

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain(STORAGE_KEY);
    expect(body).not.toContain("R2 signer unavailable");
  });

  it("does not sign a manifest after a database failure", async () => {
    const { app, createDownloadUrlMock } = makeApp({
      getManifestData: async () => ({ ok: false, reason: "databaseFailed" }),
    });

    const response = await app.request(MANIFEST_URL, sdkRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "datasetManifestUnavailable" });
    expect(createDownloadUrlMock).not.toHaveBeenCalled();
  });
});
