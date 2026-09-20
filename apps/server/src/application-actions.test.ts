import { describe, expect, it, vi } from "vitest";

import { executeApplicationAction, type TransactionExecutor } from "./application-actions";

type FakeTransactionState = {
  application: Record<string, unknown> | undefined;
  membership: Record<string, unknown> | undefined;
};

function makeTransactionDb(state: FakeTransactionState) {
  let selectCount = 0;
  const executor: TransactionExecutor = {
    select: (fields: Record<string, unknown>) => {
      void fields;
      const rows =
        selectCount === 0
          ? state.application
            ? [state.application]
            : []
          : state.membership
            ? [state.membership]
            : [];
      selectCount += 1;
      return {
        from: (table: unknown) => {
          void table;
          return {
            where: (condition: unknown) => {
              void condition;
              return {
                limit: (count: number) => {
                  void count;
                  return {
                    for: (strength: "update") => {
                      void strength;
                      return Promise.resolve(rows);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    insert: (table: unknown) => {
      void table;
      return {
        values: () => ({
          returning: () => Promise.resolve([]),
        }),
      };
    },
  };

  return {
    db: {
      transaction: <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        selectCount = 0;
        return callback(executor);
      },
    },
  };
}

describe("executeApplicationAction", () => {
  it("executes the callback for an administrator of an active application and wraps value in ok: true", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "admin" },
    });

    const action = vi.fn(async (tx, app) => {
      void tx;
      return { createdId: `item-for-${app.id}` };
    });

    const result = await executeApplicationAction(
      transaction.db,
      { applicationId: "app-1", userId: "admin-1" },
      action,
    );

    expect(result).toEqual({
      ok: true,
      value: { createdId: "item-for-app-1" },
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("allows workspace owners as administrators", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "owner" },
    });

    const action = vi.fn(async () => "success-payload");

    const result = await executeApplicationAction(
      transaction.db,
      { applicationId: "app-1", userId: "owner-1" },
      action,
    );

    expect(result).toEqual({
      ok: true,
      value: "success-payload",
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("returns reason: notFound when application does not exist without invoking action", async () => {
    const transaction = makeTransactionDb({
      application: undefined,
      membership: { role: "admin" },
    });

    const action = vi.fn();

    const result = await executeApplicationAction(
      transaction.db,
      { applicationId: "missing-app", userId: "admin-1" },
      action,
    );

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(action).not.toHaveBeenCalled();
  });

  it("returns reason: notFound when user is not a workspace member without invoking action", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: undefined,
    });

    const action = vi.fn();

    const result = await executeApplicationAction(
      transaction.db,
      { applicationId: "app-1", userId: "stranger" },
      action,
    );

    expect(result).toEqual({ ok: false, reason: "notFound" });
    expect(action).not.toHaveBeenCalled();
  });

  it("returns reason: forbidden when member is not an admin or owner without invoking action", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "active" },
      membership: { role: "member" },
    });

    const action = vi.fn();

    const result = await executeApplicationAction(
      transaction.db,
      { applicationId: "app-1", userId: "regular-user" },
      action,
    );

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(action).not.toHaveBeenCalled();
  });

  it("checks membership before checking archived status", async () => {
    const nonMemberTx = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: undefined,
    });

    const nonMemberResult = await executeApplicationAction(
      nonMemberTx.db,
      { applicationId: "app-1", userId: "stranger" },
      async () => {},
    );
    expect(nonMemberResult).toEqual({ ok: false, reason: "notFound" });

    const memberTx = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "member" },
    });

    const memberResult = await executeApplicationAction(
      memberTx.db,
      { applicationId: "app-1", userId: "regular-user" },
      async () => {},
    );
    expect(memberResult).toEqual({ ok: false, reason: "forbidden" });
  });

  it("returns reason: archived when application status is archived without invoking action", async () => {
    const transaction = makeTransactionDb({
      application: { id: "app-1", organizationId: "org-1", status: "archived" },
      membership: { role: "admin" },
    });

    const action = vi.fn();

    const result = await executeApplicationAction(
      transaction.db,
      { applicationId: "app-1", userId: "admin-1" },
      action,
    );

    expect(result).toEqual({ ok: false, reason: "archived" });
    expect(action).not.toHaveBeenCalled();
  });
});
