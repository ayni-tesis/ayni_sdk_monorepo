import type { PrivacyTreatment } from "@ayni/api/privacy-treatment";
import { applicationPrivacyTreatmentMap } from "@ayni/db/schema/index";
import { describe, expect, it, vi } from "vitest";
import {
  getPrivacyTreatmentMap,
  getPublishedPrivacyNotice,
  publishPrivacyNotice,
  updatePrivacyTreatmentMap,
} from "./privacy-treatment-map-store";

type Row = Record<string, unknown>;

const treatment: PrivacyTreatment = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  purpose: "Telemetría técnica",
  dataCategories: ["Versión del SDK"],
  dataContext: "ayniPlatform",
  source: "Dispositivo",
  requirement: "optional",
  legalBasis: "Por confirmar",
  legalBasisConfirmed: true,
  role: "processor",
  recipients: ["Ninguno"],
  transfers: "No aplica",
  retention: "30 días",
  rightsChannel: "privacidad@example.test",
};

function makeDatabase({
  application = { id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" },
  membership = { role: "admin" },
  saved,
  map,
}: {
  application?: Row | null;
  membership?: Row | null;
  saved?: Row;
  map?: Row;
} = {}) {
  const guardRows = [application ? [application] : [], membership ? [membership] : []];
  let selectCount = 0;
  const values = vi.fn();
  const onConflictDoUpdate = vi.fn();

  const tx = {
    select: () => {
      const index = selectCount++;
      return {
        from: () => ({
          where: () => ({
            limit: () =>
              Object.assign(Promise.resolve(map ? [map] : []), {
                for: () => Promise.resolve(index < 2 ? (guardRows[index] ?? []) : map ? [map] : []),
              }),
          }),
        }),
      };
    },
    insert: () => ({
      values: (value: Row) => {
        values(value);
        return {
          onConflictDoUpdate: (config: { set: Row }) => {
            onConflictDoUpdate(config.set);
            return { returning: () => Promise.resolve(saved ? [saved] : []) };
          },
          returning: () => Promise.resolve(saved ? [saved] : []),
        };
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };

  return {
    values,
    onConflictDoUpdate,
    db: {
      transaction: <T>(callback: (transaction: unknown) => Promise<T>) => {
        selectCount = 0;
        return callback(tx);
      },
    },
  };
}

describe("getPrivacyTreatmentMap", () => {
  it("returns an empty, incomplete map before one is saved", async () => {
    const { db } = makeDatabase();

    await expect(getPrivacyTreatmentMap(db, "app-1")).resolves.toEqual({
      applicationId: "app-1",
      treatments: [],
      readyToPublish: false,
      latestPublishedVersion: 0,
      updatedAt: null,
    });
  });

  it("returns the saved map and completeness state", async () => {
    const { db } = makeDatabase({
      map: {
        applicationId: "app-1",
        treatments: [treatment],
        latestPublishedVersion: 0,
        updatedAt: new Date("2026-09-30T12:00:00.000Z"),
      },
    });

    await expect(getPrivacyTreatmentMap(db, "app-1")).resolves.toEqual({
      applicationId: "app-1",
      treatments: [treatment],
      readyToPublish: true,
      latestPublishedVersion: 0,
      updatedAt: "2026-09-30T12:00:00.000Z",
    });
  });
});

describe("updatePrivacyTreatmentMap", () => {
  it("writes only through the authorized application action", async () => {
    const saved = {
      applicationId: "app-1",
      treatments: [treatment],
      latestPublishedVersion: 0,
      updatedAt: new Date("2026-09-30T12:00:00.000Z"),
    };
    const { db, values, onConflictDoUpdate } = makeDatabase({ saved });

    await expect(
      updatePrivacyTreatmentMap(db, {
        applicationId: "app-1",
        userId: "admin",
        treatments: [treatment],
      }),
    ).resolves.toEqual({
      ok: true,
      map: {
        applicationId: "app-1",
        treatments: [treatment],
        readyToPublish: true,
        latestPublishedVersion: 0,
        updatedAt: "2026-09-30T12:00:00.000Z",
      },
    });
    expect(values).toHaveBeenCalledWith({
      applicationId: "app-1",
      treatments: [treatment],
      updatedById: "admin",
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ treatments: [treatment], updatedById: "admin" }),
    );
  });

  it.each([
    ["a member", { membership: { role: "member" } }, "forbidden"],
    ["a non-member", { membership: null }, "notFound"],
    ["a missing application", { application: null }, "notFound"],
    [
      "an archived application",
      { application: { id: "app-1", organizationId: "org-1", name: "Cámara", status: "archived" } },
      "archived",
    ],
  ] as const)("does not write for %s", async (_name, state, reason) => {
    const { db, values } = makeDatabase(state);
    await expect(
      updatePrivacyTreatmentMap(db, {
        applicationId: "app-1",
        userId: "user-1",
        treatments: [treatment],
      }),
    ).resolves.toEqual({ ok: false, reason });
    expect(values).not.toHaveBeenCalled();
  });
});

describe("publishPrivacyNotice", () => {
  it("saves a confirmed immutable notice version", async () => {
    const publishedAt = new Date("2026-09-30T12:00:00.000Z");
    const { db, values } = makeDatabase({
      saved: { publishedAt },
      map: { treatments: [treatment], latestPublishedVersion: 0 },
    });

    await expect(
      publishPrivacyNotice(db, { applicationId: "app-1", userId: "admin" }),
    ).resolves.toEqual({
      ok: true,
      version: { applicationId: "app-1", version: 1, publishedAt: publishedAt.toISOString() },
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        version: 1,
        treatments: [treatment],
        publishedById: "admin",
      }),
    );
  });

  it("blocks an unconfirmed treatment and reports its pending field", async () => {
    const { db, values } = makeDatabase({
      map: {
        treatments: [{ ...treatment, role: "undetermined" }],
        latestPublishedVersion: 0,
      },
    });

    await expect(
      publishPrivacyNotice(db, { applicationId: "app-1", userId: "admin" }),
    ).resolves.toEqual({
      ok: false,
      reason: "incomplete",
      pendingTreatments: [{ id: treatment.id, purpose: treatment.purpose, fields: ["role"] }],
    });
    expect(values).not.toHaveBeenCalled();
  });
});

describe("getPublishedPrivacyNotice", () => {
  it("returns only the current immutable snapshot", async () => {
    const publishedAt = new Date("2026-09-30T12:00:00.000Z");
    const database = {
      transaction: <T>(callback: (transaction: unknown) => Promise<T>) =>
        callback({
          select: () => ({
            from: (table: unknown) => ({
              where: () => ({
                limit: async () =>
                  table === applicationPrivacyTreatmentMap
                    ? [{ latestPublishedVersion: 2 }]
                    : [{ publishedAt, treatments: [treatment] }],
              }),
            }),
          }),
        }),
    };

    await expect(getPublishedPrivacyNotice(database, "app-1")).resolves.toEqual({
      applicationId: "app-1",
      version: 2,
      publishedAt: publishedAt.toISOString(),
      treatments: [treatment],
    });
  });
});
