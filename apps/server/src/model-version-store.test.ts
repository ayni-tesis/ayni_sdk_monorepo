import { application, member, model } from "@ayni/db/schema/index";
import { describe, expect, it, vi } from "vitest";

import type { TransactionExecutor } from "./application-actions";
import { createModelVersionWithArtifact, type ModelVersionStorage } from "./model-version-store";
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

function makeFakeStorage(putError?: unknown): {
  storage: ModelVersionStorage;
  artifacts: Map<string, Uint8Array>;
} {
  const artifacts = new Map<string, Uint8Array>();
  const storage: ModelVersionStorage = {
    putArtifact: async (key, bytes) => {
      if (putError) throw putError;
      artifacts.set(key, bytes);
    },
    removeArtifact: async (key) => {
      artifacts.delete(key);
    },
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

  it("compensates when the model belongs to another application", async () => {
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
    expect(artifacts.size).toBe(0);
  });

  it("propagates authorization failures and compensates", async () => {
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
