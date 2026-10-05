import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type {
  CompleteValidationDatasetUploadInput,
  CreateValidationDatasetInput,
  ValidationDataset,
  ValidationDatasetStoreResult,
  ValidationDatasetVersion,
} from "./validation-dataset-store";
import { createValidationDatasetsApp } from "./validation-datasets";

const activeApplication = {
  id: "app-1",
  organizationId: "org-1",
  name: "Invernos",
  status: "active" as const,
};
type TestApplication = Omit<typeof activeApplication, "status"> & { status: "active" | "archived" };

const dataset = {
  id: "dataset-1",
  applicationId: "app-1",
  name: "Flores",
  source: "Colección de tesis",
  license: "CC BY 4.0",
  createdAt: "2026-10-01T00:00:00.000Z",
  createdById: "admin",
};

const datasetVersion = {
  id: "dataset-version-1",
  datasetId: "dataset-1",
  version: "1.0.0",
  partition: "test",
  sha256: "a".repeat(64),
  sizeBytes: 42,
  createdAt: "2026-10-02T00:00:00.000Z",
  uploadedById: "admin",
};

const uploadUrl = "/applications/app-1/validation-datasets";
const testZipSha256 = createHash("sha256")
  .update(new Uint8Array([1, 2, 3]))
  .digest("hex");

function makeApp({
  session = { user: { id: "admin" } },
  application = activeApplication,
  membershipRole = "admin",
  datasets = [{ ...dataset, versions: [datasetVersion] }],
  createDataset = async (
    _input: CreateValidationDatasetInput,
  ): Promise<ValidationDatasetStoreResult<ValidationDataset>> => ({
    ok: true as const,
    value: dataset,
  }),
  completeUpload = async (
    _input: CompleteValidationDatasetUploadInput,
  ): Promise<ValidationDatasetStoreResult<ValidationDatasetVersion>> => ({
    ok: true as const,
    value: datasetVersion,
  }),
  artifactSize = async () => 3,
  artifact = async () => new Uint8Array([1, 2, 3]),
  uploadUrlResult = async (key: string, expiresIn: number, _contentLength: number) =>
    `https://r2.test/${key}?ttl=${expiresIn}`,
  removeArtifact = async () => undefined,
}: {
  session?: { user: { id: string } } | null;
  application?: TestApplication | null;
  membershipRole?: string | null;
  datasets?: (typeof dataset & { versions: (typeof datasetVersion)[] })[];
  createDataset?: (
    input: CreateValidationDatasetInput,
  ) => Promise<ValidationDatasetStoreResult<ValidationDataset>>;
  completeUpload?: (
    input: CompleteValidationDatasetUploadInput,
  ) => Promise<ValidationDatasetStoreResult<ValidationDatasetVersion>>;
  artifactSize?: (key: string) => Promise<number | null>;
  artifact?: (key: string) => Promise<Uint8Array>;
  uploadUrlResult?: (key: string, expiresIn: number, contentLength: number) => Promise<string>;
  removeArtifact?: (key: string) => Promise<void>;
} = {}) {
  const listMock = vi.fn(async () => ({ datasets }));
  const createDatasetMock = vi.fn(createDataset);
  const completeUploadMock = vi.fn(completeUpload);
  const createUploadUrlMock = vi.fn(uploadUrlResult);
  const getArtifactSizeMock = vi.fn(artifactSize);
  const getArtifactMock = vi.fn(artifact);
  const removeArtifactMock = vi.fn(removeArtifact);

  const app = createValidationDatasetsApp({
    getSession: async () => session,
    applications: {
      get: async () => application ?? undefined,
      getMembership: async () => membershipRole ?? undefined,
    },
    validationDatasets: {
      list: listMock,
      createDataset: createDatasetMock,
      completeUpload: completeUploadMock,
    },
    storage: {
      createUploadUrl: createUploadUrlMock,
      getArtifactSize: getArtifactSizeMock,
      getArtifact: getArtifactMock,
      removeArtifact: removeArtifactMock,
    },
  });

  return {
    app,
    listMock,
    createDatasetMock,
    completeUploadMock,
    createUploadUrlMock,
    getArtifactSizeMock,
    getArtifactMock,
    removeArtifactMock,
  };
}

function jsonRequest(body: unknown) {
  const sizedBody =
    typeof body === "object" && body !== null && "version" in body && "partition" in body
      ? {
          ...body,
          sizeBytes: "sizeBytes" in body ? body.sizeBytes : 3,
        }
      : body;
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sizedBody),
  };
}

function stagingKey(uploadId: string, sizeBytes = 3) {
  return `staging/app-1/validation-datasets/dataset-1/1.0.0/test/${sizeBytes}/${uploadId}.zip`;
}

describe("validation dataset access and registration", () => {
  it("requires a session before listing or creating datasets", async () => {
    const { app, listMock, createDatasetMock } = makeApp({ session: null });

    const listing = await app.request(uploadUrl, { method: "GET" });
    const creation = await app.request(
      uploadUrl,
      jsonRequest({
        name: "Flores",
        source: "Colección de tesis",
        license: "CC BY 4.0",
      }),
    );

    expect(listing.status).toBe(401);
    expect(creation.status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
    expect(createDatasetMock).not.toHaveBeenCalled();
  });

  it("lists datasets to any member of the application", async () => {
    const { app, listMock } = makeApp({ membershipRole: "member" });

    const response = await app.request(uploadUrl, { method: "GET" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      datasets: [{ ...dataset, versions: [datasetVersion] }],
    });
    expect(listMock).toHaveBeenCalledWith("app-1");
  });

  it("conceals a foreign application when listing", async () => {
    const { app, listMock } = makeApp({ membershipRole: null });

    const response = await app.request(uploadUrl, { method: "GET" });

    expect(response.status).toBe(404);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("creates dataset metadata for administrators with a source and license declaration", async () => {
    const { app, createDatasetMock } = makeApp();

    const response = await app.request(
      uploadUrl,
      jsonRequest({
        name: "Flores",
        source: "Colección de tesis",
        license: "CC BY 4.0",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ dataset });
    expect(createDatasetMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      userId: "admin",
      name: "Flores",
      source: "Colección de tesis",
      license: "CC BY 4.0",
    });
  });

  it("rejects duplicate dataset names without writing", async () => {
    const { app, createDatasetMock } = makeApp({
      createDataset: async (_input) => ({ ok: false, reason: "datasetExists" }),
    });

    const response = await app.request(
      uploadUrl,
      jsonRequest({
        name: "Flores",
        source: "Colección de tesis",
        license: "CC BY 4.0",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "datasetExists" });
    expect(createDatasetMock).toHaveBeenCalledTimes(1);
  });

  it("does not create dataset metadata for a member", async () => {
    const { app, createDatasetMock } = makeApp({ membershipRole: "member" });

    const response = await app.request(
      uploadUrl,
      jsonRequest({
        name: "Flores",
        source: "Colección de tesis",
        license: "CC BY 4.0",
      }),
    );

    expect(response.status).toBe(403);
    expect(createDatasetMock).not.toHaveBeenCalled();
  });

  it("does not create datasets for an archived application", async () => {
    const { app, createDatasetMock } = makeApp({
      application: { ...activeApplication, status: "archived" },
    });

    const response = await app.request(
      uploadUrl,
      jsonRequest({
        name: "Flores",
        source: "Colección de tesis",
        license: "CC BY 4.0",
      }),
    );

    expect(response.status).toBe(409);
    expect(createDatasetMock).not.toHaveBeenCalled();
  });

  it("requires nonempty source and license declarations", async () => {
    const { app, createDatasetMock } = makeApp();

    const response = await app.request(
      uploadUrl,
      jsonRequest({ name: "Flores", source: " ", license: "" }),
    );

    expect(response.status).toBe(400);
    expect(createDatasetMock).not.toHaveBeenCalled();
  });
});

describe("direct-to-R2 validation dataset upload", () => {
  it("issues a short-lived URL only for an existing dataset and returns no storage-key field", async () => {
    const { app, createUploadUrlMock } = makeApp({ datasets: [{ ...dataset, versions: [] }] });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/upload-url`,
      jsonRequest({
        version: "1.0.0",
        partition: "test",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      uploadId: expect.any(String),
      uploadUrl: expect.stringContaining("https://r2.test/"),
    });
    expect(body).not.toHaveProperty("storageKey");
    expect(createUploadUrlMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^staging\/app-1\/validation-datasets\/dataset-1\/1\.0\.0\/test\/3\/[0-9a-f-]+\.zip$/,
      ),
      900,
      3,
    );
  });

  it("does not issue a URL for a missing or foreign dataset", async () => {
    const { app, createUploadUrlMock } = makeApp({ datasets: [] });

    const response = await app.request(
      `${uploadUrl}/missing/versions/upload-url`,
      jsonRequest({ version: "1.0.0", partition: "test" }),
    );

    expect(response.status).toBe(404);
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it("rejects member uploads before creating an R2 URL", async () => {
    const { app, createUploadUrlMock } = makeApp({ membershipRole: "member" });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/upload-url`,
      jsonRequest({ version: "1.0.0", partition: "test" }),
    );

    expect(response.status).toBe(403);
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it("rejects invalid SemVer and partitions before signing", async () => {
    const { app, createUploadUrlMock } = makeApp();

    const badVersion = await app.request(
      `${uploadUrl}/dataset-1/versions/upload-url`,
      jsonRequest({ version: "v1", partition: "test" }),
    );
    const badPartition = await app.request(
      `${uploadUrl}/dataset-1/versions/upload-url`,
      jsonRequest({ version: "1.0.0", partition: "../private" }),
    );

    expect(badVersion.status).toBe(400);
    expect(badPartition.status).toBe(400);
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared length before issuing an upload URL", async () => {
    const { app, createUploadUrlMock } = makeApp();

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/upload-url`,
      jsonRequest({ version: "1.0.0", partition: "test", sizeBytes: 128 * 1024 * 1024 + 1 }),
    );

    expect(response.status).toBe(413);
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it("rejects upload starts for archived applications", async () => {
    const { app, createUploadUrlMock } = makeApp({
      application: { ...activeApplication, status: "archived" },
    });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/upload-url`,
      jsonRequest({ version: "1.0.0", partition: "test" }),
    );

    expect(response.status).toBe(409);
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it("publishes a verified staged ZIP and always deletes the staging object", async () => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const bytes = new Uint8Array([1, 2, 3]);
    const { app, completeUploadMock, removeArtifactMock } = makeApp({
      artifact: async () => bytes,
    });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/complete`,
      jsonRequest({
        uploadId,
        version: "1.0.0",
        partition: "test",
        sha256: testZipSha256,
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ datasetVersion });
    expect(completeUploadMock).toHaveBeenCalledWith({
      applicationId: "app-1",
      datasetId: "dataset-1",
      userId: "admin",
      version: "1.0.0",
      partition: "test",
      expectedSha256: testZipSha256,
      bytes,
    });
    expect(removeArtifactMock).toHaveBeenCalledWith(stagingKey(uploadId));
  });

  it("rejects an absent ZIP and still attempts staging cleanup", async () => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const { app, completeUploadMock, getArtifactMock, removeArtifactMock } = makeApp({
      artifactSize: async () => null,
    });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/complete`,
      jsonRequest({ uploadId, version: "1.0.0", partition: "test", sha256: testZipSha256 }),
    );

    expect(response.status).toBe(400);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(completeUploadMock).not.toHaveBeenCalled();
    expect(removeArtifactMock).toHaveBeenCalledWith(stagingKey(uploadId));
  });

  it("rejects bytes whose downloaded length differs from the R2 metadata", async () => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const { app, completeUploadMock, removeArtifactMock } = makeApp({
      artifactSize: async () => 42,
      artifact: async () => new Uint8Array([1, 2, 3]),
    });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/complete`,
      jsonRequest({ uploadId, version: "1.0.0", partition: "test", sha256: testZipSha256 }),
    );

    expect(response.status).toBe(400);
    expect(completeUploadMock).not.toHaveBeenCalled();
    expect(removeArtifactMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up a staged ZIP when the completion payload is malformed", async () => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const { app, completeUploadMock, removeArtifactMock } = makeApp();

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/complete`,
      jsonRequest({
        uploadId,
        version: "1.0.0",
        partition: "test",
        sizeBytes: 3,
        sha256: "not-a-sha256",
      }),
    );

    expect(response.status).toBe(400);
    expect(completeUploadMock).not.toHaveBeenCalled();
    expect(removeArtifactMock).toHaveBeenCalledWith(stagingKey(uploadId));
  });

  it("rejects ZIPs over 128 MiB and still deletes staging", async () => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const { app, completeUploadMock, getArtifactMock, removeArtifactMock } = makeApp({
      artifactSize: async () => 128 * 1024 * 1024 + 1,
    });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/complete`,
      jsonRequest({ uploadId, version: "1.0.0", partition: "test", sha256: testZipSha256 }),
    );

    expect(response.status).toBe(413);
    expect(getArtifactMock).not.toHaveBeenCalled();
    expect(completeUploadMock).not.toHaveBeenCalled();
    expect(removeArtifactMock).toHaveBeenCalledTimes(1);
  });

  it("maps a duplicate immutable version to conflict and removes the staging object", async () => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const { app, completeUploadMock, removeArtifactMock } = makeApp({
      completeUpload: async (_input) => ({ ok: false, reason: "versionExists" }),
    });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/complete`,
      jsonRequest({ uploadId, version: "1.0.0", partition: "test", sha256: testZipSha256 }),
    );

    expect(response.status).toBe(409);
    expect(completeUploadMock).toHaveBeenCalledTimes(1);
    expect(removeArtifactMock).toHaveBeenCalledTimes(1);
  });

  it("returns a bad request for a mismatched ZIP hash and removes the staging object", async () => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const { app, completeUploadMock, removeArtifactMock } = makeApp({
      completeUpload: async (_input) => ({ ok: false, reason: "hashMismatch" }),
    });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/complete`,
      jsonRequest({
        uploadId,
        version: "1.0.0",
        partition: "test",
        sha256: "f".repeat(64),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "datasetHashMismatch" });
    expect(completeUploadMock).toHaveBeenCalledTimes(1);
    expect(removeArtifactMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["hash", 500],
    ["databaseFailed", 500],
    ["storageFailed", 500],
  ] as const)("cleans staging after a %s completion failure", async (reason, expectedStatus) => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const { app, removeArtifactMock } = makeApp({
      completeUpload: async (_input) => ({ ok: false, reason }),
    });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/complete`,
      jsonRequest({ uploadId, version: "1.0.0", partition: "test", sha256: testZipSha256 }),
    );

    expect(response.status).toBe(expectedStatus);
    expect(removeArtifactMock).toHaveBeenCalledWith(stagingKey(uploadId));
  });

  it("lets an application administrator delete a canceled staged ZIP", async () => {
    const uploadId = "5a50fbab-a999-4c20-b190-2c2fb7e5b98e";
    const { app, removeArtifactMock } = makeApp();

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/cancel`,
      jsonRequest({
        uploadId,
        version: "1.0.0",
        partition: "test",
        sizeBytes: 3,
      }),
    );

    expect(response.status).toBe(204);
    expect(removeArtifactMock).toHaveBeenCalledWith(stagingKey(uploadId));
  });

  it("does not let a member delete a staged ZIP", async () => {
    const { app, removeArtifactMock } = makeApp({ membershipRole: "member" });

    const response = await app.request(
      `${uploadUrl}/dataset-1/versions/cancel`,
      jsonRequest({
        uploadId: "5a50fbab-a999-4c20-b190-2c2fb7e5b98e",
        version: "1.0.0",
        partition: "test",
        sizeBytes: 3,
      }),
    );

    expect(response.status).toBe(403);
    expect(removeArtifactMock).not.toHaveBeenCalled();
  });
});
