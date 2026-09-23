import { application, member, model, modelVersion } from "@ayni/db/schema/index";
import { describe, expect, it, vi } from "vitest";

import type { TransactionExecutor } from "./application-actions";
import { ModelVersionAlreadyStoredError } from "./model-version-storage";
import {
  createModelVersionWithArtifact,
  getSdkModelVersionManifest,
  listModelVersions,
  type ModelVersionStorage,
  SDK_MODEL_DOWNLOAD_URL_TTL_SECONDS,
} from "./model-version-store";
import { computeSha256Hex } from "./tflite-validator";

function validTfliteBytes(): Uint8Array {
  const bytes = new Uint8Array(20);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, 12, true);
  bytes.set([0x54, 0x46, 0x4c, 0x33], 4);
  dv.setUint16(8, 12, true);
  dv.setUint16(10, 8, true);
  dv.setInt32(12, 4, true);
  return bytes;
}

type FakeState = {
  application?: Record<string, unknown>;
  membership?: { role: string };
  modelRow?: { id: string };
  existingVersion?: { id: string };
  inserted: Record<string, unknown>[];
  insertError?: unknown;
  insertReturnsNothing?: boolean;
};

function makeFakeDb(state: FakeState) {
  const executor = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => ({
            for: async () => {
              if (table === application) {
                return state.application ? [state.application] : [];
              }
              if (table === member) return state.membership ? [state.membership] : [];
              if (table === model) return state.modelRow ? [state.modelRow] : [];
              if (table === modelVersion)
                return state.existingVersion ? [state.existingVersion] : [];
              return [];
            },
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          if (state.insertError) throw state.insertError;
          if (state.insertReturnsNothing) return [];
          const row = {
            ...value,
            createdAt: new Date("2026-09-20T00:00:00.000Z"),
          };
          state.inserted.push(row);
          return [row];
        },
      }),
    }),
  } as unknown as TransactionExecutor;

  return {
    transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(executor),
  };
}

function makeFakeStorage(putError?: unknown) {
  const artifacts = new Map<string, Uint8Array>();
  const storage: ModelVersionStorage & {
    putArtifact: ReturnType<typeof vi.fn>;
    removeArtifact: ReturnType<typeof vi.fn>;
    createDownloadUrl: ReturnType<typeof vi.fn>;
  } = {
    putArtifact: vi.fn(async (key: string, bytes: Uint8Array) => {
      if (putError) throw putError;
      artifacts.set(key, bytes);
    }),
    removeArtifact: vi.fn(async (key: string) => {
      artifacts.delete(key);
    }),
    createDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}?token=abc`),
  };
  return { storage, artifacts };
}

const adminState = (overrides: Partial<FakeState> = {}): FakeState => ({
  application: { id: "app-1", organizationId: "org-1", name: "App", status: "active" },
  membership: { role: "admin" },
  modelRow: { id: "model-1" },
  inserted: [],
  ...overrides,
});

describe("createModelVersionWithArtifact", () => {
  it("stores the artifact byte-identically and persists the version record", async () => {
    const bytes = validTfliteBytes();
    const db = makeFakeDb(adminState());
    const { storage, artifacts } = makeFakeStorage();

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const storageKey = "applications/app-1/models/model-1/versions/1.0.0.tflite";
    expect(artifacts.get(storageKey)).toBe(bytes);
    expect(result.modelVersion).toMatchObject({
      modelId: "model-1",
      version: "1.0.0",
      storageKey,
      sha256: await computeSha256Hex(bytes),
      sizeBytes: 20,
      uploadedById: "user-1",
    });
  });

  it("persists the row through the injected transaction", async () => {
    const bytes = validTfliteBytes();
    const state = adminState();
    const db = makeFakeDb(state);
    const { storage } = makeFakeStorage();

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "0.1.2",
      bytes,
    });

    expect(result.ok).toBe(true);
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      modelId: "model-1",
      version: "0.1.2",
      sha256: await computeSha256Hex(bytes),
      sizeBytes: 20,
      uploadedById: "user-1",
    });
    expect(state.inserted[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects non-SemVer versions before touching storage", async () => {
    const db = makeFakeDb(adminState());
    const { storage, artifacts } = makeFakeStorage();
    const putArtifact = vi.spyOn(storage, "putArtifact");

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "invalidVersion" });
    expect(putArtifact).not.toHaveBeenCalled();
    expect(artifacts.size).toBe(0);
  });

  it("rejects files that fail the FlatBuffers gate", async () => {
    const db = makeFakeDb(adminState());
    const { storage, artifacts } = makeFakeStorage();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(20)]);

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes: jpeg,
    });

    expect(result).toEqual({ ok: false, reason: "identifier" });
    expect(artifacts.size).toBe(0);
  });

  it("reports versionExists and compensates when the unique index collides", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const db = makeFakeDb(adminState({ insertError: uniqueViolation }));
    const { storage, artifacts } = makeFakeStorage();

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "versionExists" });
    expect(artifacts.size).toBe(0);
  });

  it("reports versionExists from the duplicate pre-check without touching storage", async () => {
    const db = makeFakeDb(adminState({ existingVersion: { id: "mv-existing" } }));
    const { storage, artifacts } = makeFakeStorage();

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "versionExists" });
    expect(storage.putArtifact).not.toHaveBeenCalled();
    expect(artifacts.size).toBe(0);
  });

  it("reports storageConflict without compensation when R2 refuses to overwrite", async () => {
    const db = makeFakeDb(adminState());
    const { storage, artifacts } = makeFakeStorage(
      new ModelVersionAlreadyStoredError("applications/app-1/models/model-1/versions/1.0.0.tflite"),
    );

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "storageConflict" });
    expect(storage.removeArtifact).not.toHaveBeenCalled();
    expect(artifacts.size).toBe(0);
  });

  it("detects unique violations wrapped in a cause chain", async () => {
    const uniqueViolation = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const db = makeFakeDb(
      adminState({ insertError: new Error("tx failed", { cause: uniqueViolation }) }),
    );
    const { storage, artifacts } = makeFakeStorage();

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "versionExists" });
    expect(artifacts.size).toBe(0);
  });

  it("compensates with databaseFailed for other insert errors", async () => {
    const db = makeFakeDb(
      adminState({ insertError: Object.assign(new Error("no table"), { code: "42P01" }) }),
    );
    const { storage, artifacts } = makeFakeStorage();

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "databaseFailed" });
    expect(artifacts.size).toBe(0);
  });

  it("rejects a model outside the application before touching storage", async () => {
    const db = makeFakeDb(adminState({ modelRow: undefined }));
    const { storage, artifacts } = makeFakeStorage();

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-of-another-app",
      userId: "user-1",
      version: "1.0.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "modelNotFound" });
    expect(storage.putArtifact).not.toHaveBeenCalled();
    expect(artifacts.size).toBe(0);
  });

  it("rejects unauthorized attempts before touching storage", async () => {
    const { storage, artifacts } = makeFakeStorage();

    const forbidden = await createModelVersionWithArtifact(
      makeFakeDb(adminState({ membership: { role: "member" } })),
      storage,
      {
        applicationId: "app-1",
        modelId: "model-1",
        userId: "user-1",
        version: "1.0.0",
        bytes: validTfliteBytes(),
      },
    );
    expect(forbidden).toEqual({ ok: false, reason: "forbidden" });

    const archived = await createModelVersionWithArtifact(
      makeFakeDb(
        adminState({
          application: { id: "app-1", organizationId: "org-1", name: "A", status: "archived" },
        }),
      ),
      storage,
      {
        applicationId: "app-1",
        modelId: "model-1",
        userId: "user-1",
        version: "1.0.0",
        bytes: validTfliteBytes(),
      },
    );
    expect(archived).toEqual({ ok: false, reason: "archived" });

    expect(storage.putArtifact).not.toHaveBeenCalled();
    expect(artifacts.size).toBe(0);
  });

  it("reports storageFailed without compensation when the upload itself fails", async () => {
    const db = makeFakeDb(adminState());
    const { storage, artifacts } = makeFakeStorage(new Error("r2 unavailable"));

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "storageFailed" });
    expect(artifacts.size).toBe(0);
  });

  it("compensates when the insert returns no record", async () => {
    const db = makeFakeDb(adminState({ insertReturnsNothing: true }));
    const { storage, artifacts } = makeFakeStorage();

    const result = await createModelVersionWithArtifact(db, storage, {
      applicationId: "app-1",
      modelId: "model-1",
      userId: "user-1",
      version: "1.0.0",
      bytes: validTfliteBytes(),
    });

    expect(result).toEqual({ ok: false, reason: "databaseFailed" });
    expect(artifacts.size).toBe(0);
  });
});

function makeListVersionsDb(state: {
  modelRow?: { id: string };
  versionRows: Record<string, unknown>[];
}) {
  const queriedTables: unknown[] = [];

  const executor = {
    select: () => ({
      from: (table: unknown) => {
        queriedTables.push(table);
        return {
          where: () => ({
            limit: () =>
              Promise.resolve(table === model && state.modelRow ? [{ id: state.modelRow.id }] : []),
            orderBy: () =>
              Promise.resolve(
                table === modelVersion ? state.versionRows.map((row) => ({ ...row })) : [],
              ),
          }),
        };
      },
    }),
  };

  return {
    queriedTables,
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(executor),
    },
  };
}

describe("listModelVersions", () => {
  it("lists a model's versions newest first with metadata only, never the artifact or storage key", async () => {
    const transaction = makeListVersionsDb({
      modelRow: { id: "model-1" },
      versionRows: [
        {
          id: "mv-2",
          version: "1.1.0",
          storageKey: "applications/app-1/models/model-1/versions/1.1.0.tflite",
          sha256: "b".repeat(64),
          sizeBytes: "4096",
          createdAt: new Date("2026-09-20T12:00:00.000Z"),
        },
        {
          id: "mv-1",
          version: "1.0.0",
          storageKey: "applications/app-1/models/model-1/versions/1.0.0.tflite",
          sha256: "a".repeat(64),
          sizeBytes: 2048,
          createdAt: "2026-09-19T12:00:00.000Z",
        },
      ],
    });

    const result = await listModelVersions(transaction.db, "app-1", "model-1");

    expect(result).toEqual({
      ok: true,
      versions: [
        {
          id: "mv-2",
          version: "1.1.0",
          sha256: "b".repeat(64),
          sizeBytes: 4096,
          createdAt: "2026-09-20T12:00:00.000Z",
          contract: null,
        },
        {
          id: "mv-1",
          version: "1.0.0",
          sha256: "a".repeat(64),
          sizeBytes: 2048,
          createdAt: "2026-09-19T12:00:00.000Z",
          contract: null,
        },
      ],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("applications/app-1");
    if (!result.ok) throw new Error("Expected the version list to load");
    expect(Object.keys(result.versions[0] ?? {})).toEqual([
      "id",
      "version",
      "sha256",
      "sizeBytes",
      "createdAt",
      "contract",
    ]);
  });

  it("returns an empty list for a model without versions", async () => {
    const transaction = makeListVersionsDb({ modelRow: { id: "model-1" }, versionRows: [] });

    const result = await listModelVersions(transaction.db, "app-1", "model-1");

    expect(result).toEqual({ ok: true, versions: [] });
  });

  it("does not reveal versions of a model outside the application", async () => {
    const transaction = makeListVersionsDb({ versionRows: [{ id: "mv-1" }] });

    const result = await listModelVersions(transaction.db, "app-1", "model-of-another-app");

    expect(result).toEqual({ ok: false, reason: "modelNotFound" });
    expect(transaction.queriedTables).not.toContain(modelVersion);
  });
});

const OWN_VERSION_ROW = {
  id: "mv-1",
  modelId: "model-1",
  version: "1.2.0",
  storageKey: "applications/app-1/models/model-1/versions/1.2.0.tflite",
  sha256: "c".repeat(64),
  sizeBytes: "2048",
  contract: null,
};

function makeManifestDb(state: {
  versionRow?: Record<string, unknown>;
  modelRow?: { id: string };
  applicationRow?: { id: string; status: string };
}) {
  const queriedTables: unknown[] = [];

  const db = {
    select: () => ({
      from: (table: unknown) => {
        queriedTables.push(table);
        return {
          where: () => ({
            limit: async () => {
              if (table === modelVersion) {
                return state.versionRow ? [{ ...state.versionRow }] : [];
              }
              if (table === model) return state.modelRow ? [{ ...state.modelRow }] : [];
              if (table === application) {
                return state.applicationRow ? [{ ...state.applicationRow }] : [];
              }
              return [];
            },
          }),
        };
      },
    }),
  };

  return { db, queriedTables };
}

function ownApplicationManifestState() {
  return {
    versionRow: { ...OWN_VERSION_ROW },
    modelRow: { id: "model-1" },
    applicationRow: { id: "app-1", status: "active" },
  };
}

describe("getSdkModelVersionManifest", () => {
  it("returns the version metadata with a temporary signed download location", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T00:00:00.000Z"));
    try {
      const { db } = makeManifestDb(ownApplicationManifestState());
      const { storage } = makeFakeStorage();

      const result = await getSdkModelVersionManifest(db, storage, "app-1", "mv-1");

      expect(result).toEqual({
        ok: true,
        manifest: {
          modelVersionId: "mv-1",
          version: "1.2.0",
          sha256: "c".repeat(64),
          sizeBytes: 2048,
          downloadUrl: `https://signed.example/${OWN_VERSION_ROW.storageKey}?token=abc`,
          downloadUrlExpiresAt: new Date(
            Date.now() + SDK_MODEL_DOWNLOAD_URL_TTL_SECONDS * 1000,
          ).toISOString(),
          contract: null,
        },
      });
      expect(storage.createDownloadUrl).toHaveBeenCalledWith(
        OWN_VERSION_ROW.storageKey,
        SDK_MODEL_DOWNLOAD_URL_TTL_SECONDS,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not sign a download URL for a version of another application", async () => {
    const { db } = makeManifestDb({
      versionRow: { ...OWN_VERSION_ROW, modelId: "model-of-another-app" },
      applicationRow: { id: "app-1", status: "active" },
    });
    const { storage } = makeFakeStorage();

    const result = await getSdkModelVersionManifest(db, storage, "app-1", "mv-1");

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it("reports notFound for a nonexistent version without querying scopes or signing", async () => {
    const { db, queriedTables } = makeManifestDb({
      applicationRow: { id: "app-1", status: "active" },
      modelRow: { id: "model-1" },
    });
    const { storage } = makeFakeStorage();

    const result = await getSdkModelVersionManifest(db, storage, "app-1", "mv-missing");

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(queriedTables).toEqual([modelVersion]);
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });

  it("reports notFound (never a manifest) when the owning application is archived", async () => {
    const { db } = makeManifestDb({
      versionRow: { ...OWN_VERSION_ROW },
      modelRow: { id: "model-1" },
      applicationRow: { id: "app-1", status: "archived" },
    });
    const { storage } = makeFakeStorage();

    const result = await getSdkModelVersionManifest(db, storage, "app-1", "mv-1");

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});
