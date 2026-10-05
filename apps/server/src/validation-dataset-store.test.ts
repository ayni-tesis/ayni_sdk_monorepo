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
  membership?: { role: string; userId?: string; organizationId?: string };
  datasets: Record<string, unknown>[];
  versions: Record<string, unknown>[];
  insertedDatasets: Record<string, unknown>[];
  insertedVersions: Record<string, unknown>[];
  insertError?: unknown;
};

function makeFakeDb(state: FakeState) {
  const rowsFor = (table: unknown) => {
    if (table === application) return state.application ? [state.application] : [];
    if (table === member) return state.membership ? [state.membership] : [];
    if (table === validationDataset) return state.datasets;
    if (table === validationDatasetVersion) return state.versions;
    return [];
  };

  const predicatesFor = (condition: unknown): [string, unknown][] => {
    if (typeof condition !== "object" || condition === null) return [];
    const queryChunks = (condition as { queryChunks?: unknown[] }).queryChunks;
    if (!queryChunks) return [];

    const column = queryChunks.find(
      (chunk): chunk is { name: string; table: unknown } =>
        typeof chunk === "object" && chunk !== null && "name" in chunk && "table" in chunk,
    );
    const parameter = queryChunks.find(
      (chunk): chunk is { value: unknown; encoder: unknown } =>
        typeof chunk === "object" && chunk !== null && "value" in chunk && "encoder" in chunk,
    );
    const own = column && parameter ? [[column.name, parameter.value] as [string, unknown]] : [];
    return [...own, ...queryChunks.flatMap((chunk) => predicatesFor(chunk))];
  };

  const filterRows = (table: unknown, condition: unknown) => {
    const predicates = predicatesFor(condition);
    return rowsFor(table).filter((row) =>
      predicates.every(([columnName, value]) => {
        const propertyName = columnName.replace(/_([a-z])/g, (_match, letter: string) =>
          letter.toUpperCase(),
        );
        return row[propertyName] === value;
      }),
    );
  };

  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          const matches = filterRows(table, condition);
          return {
            limit: (count: number) => ({ for: async () => matches.slice(0, count) }),
            orderBy: async () => matches,
          };
        },
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

  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async (condition: unknown) => filterRows(table, condition),
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
    datasets: [],
    versions: [],
    insertedDatasets: [],
    insertedVersions: [],
    ...overrides,
    membership: overrides.membership
      ? {
          userId: "user-1",
          organizationId: "org-1",
          ...overrides.membership,
        }
      : { role: "admin", userId: "user-1", organizationId: "org-1" },
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

  it("removes an R2 object when the upload reports failure after committing it", async () => {
    const state = adminState({
      datasets: [{ id: "dataset-1", applicationId: "app-1" }],
    });
    const { storage, artifacts } = makeFakeStorage();
    vi.mocked(storage.putArtifact).mockImplementationOnce(async (key, bytes) => {
      artifacts.set(key, bytes.slice());
      throw new Error("connection dropped after R2 committed");
    });
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

    expect(result).toEqual({ ok: false, reason: "storageFailed" });
    expect(storage.removeArtifact).toHaveBeenCalledWith(storage.putArtifact.mock.calls[0]?.[0]);
    expect(artifacts.size).toBe(0);
    expect(state.insertedVersions).toHaveLength(0);
  });

  it("does not delete an object when R2 reports that the random key already exists", async () => {
    const state = adminState({
      datasets: [{ id: "dataset-1", applicationId: "app-1" }],
    });
    const { storage, artifacts } = makeFakeStorage();
    vi.mocked(storage.putArtifact).mockRejectedValueOnce(
      Object.assign(new Error("key already exists"), {
        name: "ValidationDatasetAlreadyStoredError",
      }),
    );
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

    expect(result).toEqual({ ok: false, reason: "storageFailed" });
    expect(storage.removeArtifact).not.toHaveBeenCalled();
    expect(artifacts.size).toBe(0);
  });

  it("removes the permanent object when the database insert fails", async () => {
    const state = adminState({
      datasets: [{ id: "dataset-1", applicationId: "app-1" }],
      insertError: new Error("database unavailable"),
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

    expect(result).toEqual({ ok: false, reason: "databaseFailed" });
    expect(storage.removeArtifact).toHaveBeenCalledWith(storage.putArtifact.mock.calls[0]?.[0]);
    expect(artifacts.size).toBe(0);
    expect(state.insertedVersions).toHaveLength(0);
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

  it("allows another partition for an already published version", async () => {
    const state = adminState({
      datasets: [{ id: "dataset-1", applicationId: "app-1" }],
      versions: [
        {
          id: "version-1",
          datasetId: "dataset-1",
          version: "1.0.0",
          partition: "train",
        },
      ],
    });
    const { storage } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });
    const bytes = new Uint8Array([1]);

    const result = await store.completeUpload({
      applicationId: "app-1",
      datasetId: "dataset-1",
      userId: "user-1",
      version: "1.0.0",
      partition: "test",
      expectedSha256: createHash("sha256").update(bytes).digest("hex"),
      bytes,
    });

    expect(result.ok).toBe(true);
    expect(state.insertedVersions).toHaveLength(1);
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
  });

  it("returns the complete stored manifest metadata for an active application's version", async () => {
    const state = adminState({
      datasets: [
        {
          id: "dataset-1",
          applicationId: "app-1",
          source: "Colección de tesis",
          license: "CC BY 4.0",
        },
      ],
      versions: [
        {
          id: "version-1",
          datasetId: "dataset-1",
          version: "1.0.0",
          partition: "test",
          storageKey: "applications/app-1/datasets/version-1.zip",
          sha256: "a".repeat(64),
          sizeBytes: 42,
        },
      ],
    });
    const { storage } = makeFakeStorage();
    const store = createValidationDatasetStore({ db: makeFakeDb(state), storage });

    const result = await store.getManifestData("app-1", "version-1");

    expect(result).toEqual({
      ok: true,
      value: {
        datasetVersionId: "version-1",
        datasetId: "dataset-1",
        applicationId: "app-1",
        version: "1.0.0",
        partition: "test",
        source: "Colección de tesis",
        license: "CC BY 4.0",
        sha256: "a".repeat(64),
        sizeBytes: 42,
        storageKey: "applications/app-1/datasets/version-1.zip",
      },
    });
  });
});
