import { describe, expect, it, vi } from "vitest";

import { getCollectionPolicy, updateCollectionPolicy } from "./collection-policy-store";

type Row = Record<string, unknown>;

function makeDatabase({
  application = { id: "app-1", organizationId: "org-1", name: "Cámara", status: "active" },
  membership = { role: "admin" },
  policy,
  saved,
}: {
  application?: Row | null;
  membership?: Row | null;
  policy?: Row;
  saved?: Row;
} = {}) {
  const guardRows = [application ? [application] : [], membership ? [membership] : []];
  let selectCount = 0;
  const values = vi.fn();
  const onConflictDoUpdate = vi.fn();

  const tx = {
    select: () => {
      const rows = guardRows[selectCount] ?? [];
      selectCount += 1;
      return {
        from: () => ({
          where: () => ({
            limit: () =>
              Object.assign(Promise.resolve(policy ? [policy] : []), {
                for: () => Promise.resolve(rows),
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
        };
      },
    }),
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

const settings = {
  enabled: true,
  consentRequired: true,
  network: "wifiAndCellular" as const,
  maxImageSize: 640,
  imageQuality: 75,
};

describe("getCollectionPolicy", () => {
  it("keeps collection disabled for an application that never saved a policy", async () => {
    const { db } = makeDatabase();

    await expect(getCollectionPolicy(db, "app-1")).resolves.toEqual({
      applicationId: "app-1",
      enabled: false,
      consentRequired: false,
      network: "wifi",
      maxImageSize: 1024,
      imageQuality: 80,
      updatedAt: null,
    });
  });

  it("returns the saved policy of the application", async () => {
    const { db } = makeDatabase({
      policy: {
        applicationId: "app-1",
        ...settings,
        updatedAt: new Date("2026-09-26T12:00:00.000Z"),
      },
    });

    await expect(getCollectionPolicy(db, "app-1")).resolves.toEqual({
      applicationId: "app-1",
      ...settings,
      updatedAt: "2026-09-26T12:00:00.000Z",
    });
  });
});

describe("updateCollectionPolicy", () => {
  const input = { applicationId: "app-1", userId: "admin", ...settings };

  it("saves the policy of an active application for an administrator", async () => {
    const { db, values, onConflictDoUpdate } = makeDatabase({
      saved: {
        applicationId: "app-1",
        ...settings,
        updatedAt: new Date("2026-09-26T12:00:00.000Z"),
      },
    });

    await expect(updateCollectionPolicy(db, input)).resolves.toEqual({
      ok: true,
      policy: { applicationId: "app-1", ...settings, updatedAt: "2026-09-26T12:00:00.000Z" },
    });
    expect(values).toHaveBeenCalledWith({
      applicationId: "app-1",
      ...settings,
      updatedById: "admin",
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ ...settings, updatedById: "admin" }),
    );
  });

  it.each([
    ["a plain member", { membership: { role: "member" } }, "forbidden"],
    ["a non-member", { membership: null }, "notFound"],
    ["a missing application", { application: null }, "notFound"],
    [
      "an archived application",
      { application: { id: "app-1", organizationId: "org-1", name: "Cámara", status: "archived" } },
      "archived",
    ],
  ] as const)("writes nothing for %s", async (_case, state, reason) => {
    const { db, values } = makeDatabase(state);

    await expect(updateCollectionPolicy(db, input)).resolves.toEqual({ ok: false, reason });
    expect(values).not.toHaveBeenCalled();
  });
});
