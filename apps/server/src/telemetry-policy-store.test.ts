import { sdkTrace } from "@ayni/db/schema/index";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { getTelemetryPolicy, updateTelemetryPolicy } from "./telemetry-policy-store";

type Row = Record<string, unknown>;

function render(fragment: SQL) {
  return new PgDialect().sqlToQuery(fragment);
}

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
  const traceUpdate = vi.fn();

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
    update: (table: unknown) => ({
      set: (set: Row) => ({
        where: (condition: unknown) => {
          traceUpdate({ table, set, condition });
          return Promise.resolve();
        },
      }),
    }),
  };

  return {
    values,
    onConflictDoUpdate,
    traceUpdate,
    db: {
      transaction: <T>(callback: (transaction: unknown) => Promise<T>) => {
        selectCount = 0;
        return callback(tx);
      },
    },
  };
}

describe("getTelemetryPolicy", () => {
  it("keeps telemetry disabled for an application that never saved a policy", async () => {
    const { db } = makeDatabase();

    await expect(getTelemetryPolicy(db, "app-1")).resolves.toEqual({
      applicationId: "app-1",
      enabled: false,
      retentionDays: 30,
      updatedAt: null,
    });
  });

  it("returns the saved policy of the application", async () => {
    const { db } = makeDatabase({
      policy: {
        applicationId: "app-1",
        enabled: true,
        retentionDays: 90,
        updatedAt: new Date("2026-09-26T12:00:00.000Z"),
      },
    });

    await expect(getTelemetryPolicy(db, "app-1")).resolves.toEqual({
      applicationId: "app-1",
      enabled: true,
      retentionDays: 90,
      updatedAt: "2026-09-26T12:00:00.000Z",
    });
  });
});

describe("updateTelemetryPolicy", () => {
  const input = {
    applicationId: "app-1",
    userId: "admin",
    enabled: true,
    retentionDays: 7 as const,
  };

  it("saves the policy of an active application for an administrator", async () => {
    const { db, values, onConflictDoUpdate } = makeDatabase({
      saved: {
        applicationId: "app-1",
        enabled: true,
        retentionDays: 7,
        updatedAt: new Date("2026-09-26T12:00:00.000Z"),
      },
    });

    await expect(updateTelemetryPolicy(db, input)).resolves.toEqual({
      ok: true,
      policy: {
        applicationId: "app-1",
        enabled: true,
        retentionDays: 7,
        updatedAt: "2026-09-26T12:00:00.000Z",
      },
    });
    expect(values).toHaveBeenCalledWith({
      applicationId: "app-1",
      enabled: true,
      retentionDays: 7,
      updatedById: "admin",
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, retentionDays: 7, updatedById: "admin" }),
    );
  });

  it("recomputes from receipt the expiry of the application's live traces (US-112)", async () => {
    const { db, traceUpdate } = makeDatabase({
      saved: { applicationId: "app-1", enabled: true, retentionDays: 7, updatedAt: new Date() },
    });

    await updateTelemetryPolicy(db, input);

    expect(traceUpdate).toHaveBeenCalledTimes(1);
    const [{ table, set, condition }] = traceUpdate.mock.calls[0] as [
      { table: unknown; set: { expiresAt: SQL }; condition: SQL },
    ];
    expect(table).toBe(sdkTrace);
    const expiry = render(set.expiresAt);
    expect(expiry.sql).toBe('"sdk_trace"."received_at" + make_interval(days => $1::integer)');
    expect(expiry.params).toEqual([7]);
    const where = render(condition);
    // Only live rows whose expiry changes: an unchanged period rewrites nothing.
    expect(where.sql).toBe(
      '("sdk_trace"."application_id" = $1 and "sdk_trace"."expires_at" > $2 and "sdk_trace"."expires_at" <> "sdk_trace"."received_at" + make_interval(days => $3::integer))',
    );
    expect(where.params[0]).toBe("app-1");
    expect(where.params[2]).toBe(7);
  });

  it("saves only the retention period, keeping the switch (US-112)", async () => {
    const { db, values, onConflictDoUpdate } = makeDatabase({
      saved: { applicationId: "app-1", enabled: true, retentionDays: 90, updatedAt: new Date() },
    });

    await updateTelemetryPolicy(db, { applicationId: "app-1", userId: "admin", retentionDays: 90 });

    // A first save keeps telemetry off; an existing policy keeps its switch.
    expect(values).toHaveBeenCalledWith({
      applicationId: "app-1",
      enabled: false,
      retentionDays: 90,
      updatedById: "admin",
    });
    const [set] = onConflictDoUpdate.mock.calls[0] as [Row];
    expect(set).toEqual({ retentionDays: 90, updatedById: "admin", updatedAt: expect.any(Date) });
  });

  it("leaves the traces untouched when only the switch changes", async () => {
    const { db, onConflictDoUpdate, traceUpdate } = makeDatabase({
      saved: { applicationId: "app-1", enabled: true, retentionDays: 30, updatedAt: new Date() },
    });

    await updateTelemetryPolicy(db, { applicationId: "app-1", userId: "admin", enabled: true });

    const [set] = onConflictDoUpdate.mock.calls[0] as [Row];
    expect(set).not.toHaveProperty("retentionDays");
    expect(traceUpdate).not.toHaveBeenCalled();
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
    const { db, values, traceUpdate } = makeDatabase(state);

    await expect(updateTelemetryPolicy(db, input)).resolves.toEqual({ ok: false, reason });
    expect(values).not.toHaveBeenCalled();
    expect(traceUpdate).not.toHaveBeenCalled();
  });
});
