import { createHash } from "node:crypto";
import {
  SdkValidationDatasetManifestSchema,
  ValidationDatasetUploadUrlResponseSchema,
} from "@ayni/api";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { VerifySdkCredentialResult } from "./sdk-credential-store";
import { createSdkValidationDatasetsApp } from "./sdk-validation-datasets";
import type {
  CompleteValidationDatasetUploadInput,
  CreateValidationDatasetInput,
  ValidationDataset,
  ValidationDatasetStoreResult,
  ValidationDatasetVersion,
} from "./validation-dataset-store";
import { createValidationDatasetsApp } from "./validation-datasets";

const FIXED_NOW = new Date("2026-10-04T12:00:00.000Z");
const SDK_SECRET = "ayni_sk_test_private_dataset";
const zipBytes = new Uint8Array(
  Buffer.from(
    [
      "UEsDBBQAAAAIAIUQRF230mKX1AAAABUBAAANAAAAbWFuaWZlc3QuanNvbjSOO27DMBBEryJMrTgUrZ9ZxpU7VwGCIMVqubZo",
      "2KKgZdIYPlWOkIsFkpLuYd4AM3co93KjV5k0xAEOBXJ4SqSSDh7un5/mfKQphbT2kmhCDo2fEwsc9vEqzOHne8i8ZEk0KHJc",
      "A8ugi99nL29ZuTHIwaSicO93KMtAU4hwGKOGFL7kzy/jMyzL4UZnOVLq4VbW59VtLuN5vtGTrWo4NFVnWlubzluSExe7bWuq",
      "znQNl21Zby2JKYnsjrkufFO1xna2ELLEhT9ZMXh8PH4BAAD//wMAUEsDBBQAAAAIAIUQRF1rnnu4GwAAABMAAAARAAAAaW1h",
      "Z2VzL2Nhc2UtMS5qcGdKy6woKS1KVcjMTUxPVUiqLEktBgAAAP//AwBQSwECFAAUAAAACACFEERdt9Jil9QAAAAVAQAADQAA",
      "AAAAAAAAAAAAAAAAAAAAbWFuaWZlc3QuanNvblBLAQIUABQAAAAIAIUQRF1rnnu4GwAAABMAAAARAAAAAAAAAAAAAAAAAP8A",
      "AABpbWFnZXMvY2FzZS0xLmpwZ1BLBQYAAAAAAgACAHoAAABJAQAAAAA=",
    ].join(""),
    "base64",
  ),
);
const expectedZipSha256 = createHash("sha256").update(zipBytes).digest("hex");

type StoredManifestData = {
  datasetVersionId: string;
  datasetId: string;
  applicationId: string;
  version: string;
  partition: string;
  source: string;
  license: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
};

function jsonRequest(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("private validation dataset delivery integration", () => {
  it("publishes an uploaded ZIP and returns its fresh signed URL to the owning SDK credential", async () => {
    const application = {
      id: "app-1",
      organizationId: "org-1",
      name: "Validación tesis",
      status: "active" as const,
    };
    const datasets = new Map<string, ValidationDataset>();
    const versions = new Map<string, ValidationDatasetVersion & { storageKey: string }>();
    const objects = new Map<string, Uint8Array>();
    const signedUploads = new Map<string, { key: string; sizeBytes: number }>();
    let uploadNumber = 0;
    let signedDownloadKey: string | undefined;

    const storage = {
      async putArtifact(key: string, bytes: Uint8Array) {
        objects.set(key, new Uint8Array(bytes));
      },
      async getArtifact(key: string) {
        const bytes = objects.get(key);
        return bytes ? new Uint8Array(bytes) : null;
      },
      async getArtifactSize(key: string) {
        return objects.get(key)?.byteLength ?? null;
      },
      async createUploadUrl(key: string, expiresIn: number, sizeBytes: number) {
        const url = `https://private-r2.test/upload?token=put-${++uploadNumber}&ttl=${expiresIn}&size=${sizeBytes}`;
        signedUploads.set(url, { key, sizeBytes });
        return url;
      },
      async removeArtifact(key: string) {
        objects.delete(key);
      },
      async createDownloadUrl(key: string, expiresIn: number) {
        signedDownloadKey = key;
        return `https://private-r2.test/download?token=read-${uploadNumber}&ttl=${expiresIn}`;
      },
    };

    const store = {
      async createDataset(
        input: CreateValidationDatasetInput,
      ): Promise<ValidationDatasetStoreResult<ValidationDataset>> {
        const dataset = {
          id: "dataset-1",
          applicationId: input.applicationId,
          name: input.name,
          source: input.source,
          license: input.license,
          createdAt: FIXED_NOW.toISOString(),
          createdById: input.userId,
        };
        datasets.set(dataset.id, dataset);
        return { ok: true, value: dataset };
      },
      async list(applicationId: string) {
        return {
          datasets: [...datasets.values()]
            .filter((dataset) => dataset.applicationId === applicationId)
            .map((dataset) => ({
              ...dataset,
              versions: [...versions.values()]
                .filter((version) => version.datasetId === dataset.id)
                .map(({ storageKey: _storageKey, ...version }) => version),
            })),
        };
      },
      async completeUpload(
        input: CompleteValidationDatasetUploadInput,
      ): Promise<ValidationDatasetStoreResult<ValidationDatasetVersion>> {
        if (createHash("sha256").update(input.bytes).digest("hex") !== input.expectedSha256) {
          return { ok: false, reason: "hashMismatch" };
        }
        const id = "dataset-version-1";
        const storageKey = `applications/${input.applicationId}/validation-datasets/${input.datasetId}/versions/${id}.zip`;
        await storage.putArtifact(storageKey, input.bytes);
        const version = {
          id,
          datasetId: input.datasetId,
          version: input.version,
          partition: input.partition,
          sha256: createHash("sha256").update(input.bytes).digest("hex"),
          sizeBytes: input.bytes.byteLength,
          createdAt: FIXED_NOW.toISOString(),
          uploadedById: input.userId,
        };
        versions.set(id, { ...version, storageKey });
        return { ok: true, value: version };
      },
      async getManifestData(
        applicationId: string,
        datasetVersionId: string,
      ): Promise<ValidationDatasetStoreResult<StoredManifestData>> {
        const version = versions.get(datasetVersionId);
        const dataset = version && datasets.get(version.datasetId);
        if (
          !version ||
          !dataset ||
          dataset.applicationId !== applicationId ||
          application.status !== "active"
        ) {
          return { ok: false, reason: "notFound" };
        }
        return {
          ok: true,
          value: {
            datasetVersionId: version.id,
            datasetId: dataset.id,
            applicationId: dataset.applicationId,
            version: version.version,
            partition: version.partition,
            source: dataset.source,
            license: dataset.license,
            sha256: version.sha256,
            sizeBytes: version.sizeBytes,
            storageKey: version.storageKey,
          },
        };
      },
    };

    const dashboard = createValidationDatasetsApp({
      getSession: async () => ({ user: { id: "admin-1" } }),
      applications: {
        get: async (id: string) => (id === application.id ? application : undefined),
        getMembership: async () => "admin",
      },
      validationDatasets: store,
      storage,
    });
    const verifyCredential = vi.fn(async (secret: string): Promise<VerifySdkCredentialResult> => {
      if (secret !== SDK_SECRET) {
        return { ok: false, code: "invalidCredential", message: "La credencial no es válida." };
      }
      return {
        ok: true,
        credential: { credentialId: "credential-1", applicationId: application.id },
      };
    });
    const sdk = createSdkValidationDatasetsApp({
      credentials: { verify: verifyCredential },
      datasets: store,
      storage: { createDownloadUrl: storage.createDownloadUrl },
      now: () => FIXED_NOW,
    });
    const app = new Hono();
    app.route("/", dashboard);
    app.route("/", sdk);

    const creation = await app.request(
      "/applications/app-1/validation-datasets",
      jsonRequest({ name: "Flores", source: "Colección de tesis", license: "CC BY 4.0" }),
    );
    expect(creation.status).toBe(201);
    await expect(creation.json()).resolves.toMatchObject({ dataset: { id: "dataset-1" } });

    const uploadStart = await app.request(
      "/applications/app-1/validation-datasets/dataset-1/versions/upload-url",
      jsonRequest({ version: "1.0.0", partition: "test", sizeBytes: zipBytes.byteLength }),
    );
    expect(uploadStart.status).toBe(200);
    const { uploadId, uploadUrl } = ValidationDatasetUploadUrlResponseSchema.parse(
      await uploadStart.json(),
    );
    expect(uploadUrl).toMatch(/^https:\/\/private-r2\.test\/upload\?token=put-/);
    expect(new URL(uploadUrl).searchParams.get("ttl")).toBe("900");
    expect(new URL(uploadUrl).searchParams.get("size")).toBe(String(zipBytes.byteLength));
    const signedUpload = signedUploads.get(uploadUrl);
    expect(signedUpload).toBeDefined();
    if (!signedUpload) throw new Error("Expected an upload URL associated with a staging object");
    expect(signedUpload.sizeBytes).toBe(zipBytes.byteLength);
    const stagingKey = signedUpload.key;
    objects.set(stagingKey, new Uint8Array(zipBytes));

    const completion = await app.request(
      "/applications/app-1/validation-datasets/dataset-1/versions/complete",
      jsonRequest({
        uploadId,
        version: "1.0.0",
        partition: "test",
        sizeBytes: zipBytes.byteLength,
        sha256: expectedZipSha256,
      }),
    );
    expect(completion.status).toBe(201);
    await expect(completion.json()).resolves.toMatchObject({
      datasetVersion: { sha256: expectedZipSha256, sizeBytes: zipBytes.byteLength },
    });
    expect(objects.has(stagingKey)).toBe(false);

    const manifestResponse = await app.request("/sdk/dataset-versions/dataset-version-1/manifest", {
      headers: { authorization: `Bearer ${SDK_SECRET}` },
    });
    expect(manifestResponse.status).toBe(200);
    const { manifest } = SdkValidationDatasetManifestSchema.parse(await manifestResponse.json());
    expect(manifest).toMatchObject({
      datasetVersionId: "dataset-version-1",
      datasetId: "dataset-1",
      version: "1.0.0",
      partition: "test",
      source: "Colección de tesis",
      license: "CC BY 4.0",
      sha256: expectedZipSha256,
      sizeBytes: zipBytes.byteLength,
      downloadUrlExpiresAt: new Date(FIXED_NOW.getTime() + 900_000).toISOString(),
    });
    expect(manifest.downloadUrl).toMatch(/^https:\/\/private-r2\.test\/download\?token=read-/);
    expect(new URL(manifest.downloadUrl).searchParams.get("ttl")).toBe("900");
    expect(manifest).not.toHaveProperty("applicationId");
    expect(manifest).not.toHaveProperty("storageKey");
    expect(signedDownloadKey).toBeDefined();
    if (!signedDownloadKey) throw new Error("Expected a signed download key.");
    expect(objects.get(signedDownloadKey)).toEqual(zipBytes);
    expect(verifyCredential).toHaveBeenCalledWith(SDK_SECRET);
  });
});
