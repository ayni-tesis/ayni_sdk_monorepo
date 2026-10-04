import { createHash } from "node:crypto";

import {
  application,
  member,
  validationDataset,
  validationDatasetVersion,
} from "@ayni/db/schema/index";
import { describe, expect, it, vi } from "vitest";

import type { TransactionExecutor } from "./application-actions";
import {
  createValidationDatasetStore,
  type ValidationDatasetStorage,
} from "./validation-dataset-store";

type FakeState = {
  application?: Record<string, unknown>;
  membership?: { role: string };
  datasets: Record<string, unknown>[];
  versions: Record<string, unknown>[];
  insertedDatasets: Record<string, unknown>[];
  insertedVersions: Record<string, unknown>[];
  insertError?: unknown;
};

function makeFakeDb(state: FakeState) {
  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => ({
            for: async () => {
              if (table === application) return state.application ? [state.application] : [];
              if (table === member) return state.membership ? [state.membership] : [];
              if (table === validationDataset) return state.datasets;
              if (table === validationDatasetVersion) return state.versions;
              return [];
            },
          }),
          orderBy: async () => {
            if (table === validationDataset) return state.datasets;
            if (table === validationDatasetVersion) return state.versions;
            return [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          if (state.insertError) throw state.insertError;
          const row = { ...value, createdAt: new Date("2026-10-04T00:00:00.000Z") };
          if (table === validationDataset) {
            state.insertedDatasets.push(row);
            state.datasets.push(row);
          }
          if (table === validationDatasetVersion) {
            state.insertedVersions.push(row);
            state.versions.push(row);
          }
          return [row];
        },
      }),
    }),
  } as unknown as TransactionExecutor;

  const readRows = (table: unknown) => {
    if (table === application) return state.application ? [state.application] : [];
    if (table === validationDataset) return state.datasets;
    if (table === validationDatasetVersion) return state.versions;
    return [];
  };

  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => readRows(table),
      }),
    }),
    transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(executor),
  };
}

function makeFakeStorage() {
  const artifacts = new Map<string, Uint8Array>();
  const storage: ValidationDatasetStorage & {
    putArtifact: ReturnType<typeof vi.fn>;
    removeArtifact: ReturnType<typeof vi.fn>;
  } = {
    putArtifact: vi.fn(async (key: string, bytes: Uint8Array) => {
      artifacts.set(key, bytes.slice());
    }),
    getArtifact: vi.fn(async (key: string) => artifacts.get(key) ?? null),
    getArtifactSize: vi.fn(async (key: string) => artifacts.get(key)?.byteLength ?? null),
    createUploadUrl: vi.fn(async (key: string) => `https://r2.test/${key}`),
    removeArtifact: vi.fn(async (key: string) => {
      artifacts.delete(key);
    }),
    createDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}?token=secret`),
  };
  return { storage, artifacts };
}

function adminState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    application: {
      id: "app-1",
      organizationId: "org-1",
      name: "Tesis",
      status: "active",
    },
    membership: { role: "admin" },
    datasets: [],
    versions: [],
    insertedDatasets: [],
    insertedVersions: [],
    ...overrides,
  };
}

describe("createValidationDatasetStore", () => {
  it("creates and lists an application dataset with its declared source and license", async () => {
    const state = adminState();
    const { storage } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });

    const created = await store.createDataset({
      applicationId: "app-1",
      userId: "user-1",
      name: "Dataset de prueba",
      source: "Repositorio público de la tesis",
      license: "CC BY 4.0",
    });

    expect(created.ok).toBe(true);
    expect(state.insertedDatasets).toHaveLength(1);
    expect(state.insertedDatasets[0]).toMatchObject({
      applicationId: "app-1",
      name: "Dataset de prueba",
      source: "Repositorio público de la tesis",
      license: "CC BY 4.0",
      createdById: "user-1",
    });
    expect((await store.list("app-1")).datasets).toHaveLength(1);
  });

  it("maps a unique application/name collision to a dataset conflict", async () => {
    const state = adminState({ insertError: { code: "23505" } });
    const { storage } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });

    const result = await store.createDataset({
      applicationId: "app-1",
      userId: "user-1",
      name: "Dataset de prueba",
      source: "Repositorio público de la tesis",
      license: "CC BY 4.0",
    });

    expect(result).toEqual({ ok: false, reason: "datasetExists" });
    expect(state.insertedDatasets).toHaveLength(0);
  });

  it("maps a PostgreSQL unique violation wrapped by the Drizzle driver", async () => {
    const state = adminState({
      insertError: {
        name: "DrizzleQueryError",
        cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
      },
    });
    const { storage } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });

    const result = await store.createDataset({
      applicationId: "app-1",
      userId: "user-1",
      name: "Dataset de prueba",
      source: "Repositorio público de la tesis",
      license: "CC BY 4.0",
    });

    expect(result).toEqual({ ok: false, reason: "datasetExists" });
  });

  it("stores the actual ZIP SHA-256 and byte count in an immutable version", async () => {
    const state = adminState({
      datasets: [
        {
          id: "dataset-1",
          applicationId: "app-1",
          name: "Dataset de prueba",
          source: "Repositorio público de la tesis",
          license: "CC BY 4.0",
        },
      ],
    });
    const { storage, artifacts } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await store.completeUpload({
      applicationId: "app-1",
      datasetId: "dataset-1",
      userId: "user-1",
      version: "1.0.0",
      partition: "validation",
      expectedSha256: createHash("sha256").update(bytes).digest("hex"),
      bytes,
    });

    expect(result.ok).toBe(true);
    expect(state.insertedVersions).toHaveLength(1);
    expect(state.insertedVersions[0]).toMatchObject({
      datasetId: "dataset-1",
      version: "1.0.0",
      partition: "validation",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: 3,
      uploadedById: "user-1",
    });
    expect(artifacts.size).toBe(1);
  });

  it("rejects a ZIP whose bytes do not match the upload's expected SHA-256", async () => {
    const state = adminState({
      datasets: [{ id: "dataset-1", applicationId: "app-1" }],
    });
    const { storage, artifacts } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await store.completeUpload({
      applicationId: "app-1",
      datasetId: "dataset-1",
      userId: "user-1",
      version: "1.0.0",
      partition: "validation",
      expectedSha256: "f".repeat(64),
      bytes,
    });

    expect(result).toEqual({ ok: false, reason: "hashMismatch" });
    expect(storage.putArtifact).not.toHaveBeenCalled();
    expect(artifacts.size).toBe(0);
    expect(state.insertedVersions).toHaveLength(0);
  });

  it("rejects a duplicate version and partition without touching R2", async () => {
    const state = adminState({
      datasets: [{ id: "dataset-1", applicationId: "app-1" }],
      versions: [
        {
          id: "version-1",
          datasetId: "dataset-1",
          version: "1.0.0",
          partition: "validation",
        },
      ],
    });
    const { storage, artifacts } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });

    const result = await store.completeUpload({
      applicationId: "app-1",
      datasetId: "dataset-1",
      userId: "user-1",
      version: "1.0.0",
      partition: "validation",
      expectedSha256: createHash("sha256")
        .update(new Uint8Array([1]))
        .digest("hex"),
      bytes: new Uint8Array([1]),
    });

    expect(result).toEqual({ ok: false, reason: "versionExists" });
    expect(storage.putArtifact).not.toHaveBeenCalled();
    expect(artifacts.size).toBe(0);
    expect(state.insertedVersions).toHaveLength(0);
  });

  it("does not return manifest metadata for a dataset owned by another application", async () => {
    const state = adminState({
      application: { id: "app-2", organizationId: "org-2", status: "active" },
      datasets: [
        {
          id: "dataset-2",
          applicationId: "app-2",
          source: "Fuente",
          license: "CC BY 4.0",
        },
      ],
      versions: [
        {
          id: "version-2",
          datasetId: "dataset-2",
          storageKey: "applications/app-2/secret.zip",
        },
      ],
    });
    const { storage } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });

    const result = await store.getManifestData("app-1", "version-2");

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it("does not return manifest metadata when its application is archived", async () => {
    const state = adminState({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      datasets: [
        {
          id: "dataset-1",
          applicationId: "app-1",
          source: "Fuente",
          license: "CC BY 4.0",
        },
      ],
      versions: [
        {
          id: "version-1",
          datasetId: "dataset-1",
          storageKey: "applications/app-1/secret.zip",
        },
      ],
    });
    const { storage } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });

    const result = await store.getManifestData("app-1", "version-1");

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});
