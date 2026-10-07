import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  record: null as { id: string; expiresAt: Date } | null,
  insert: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@ayni/db", () => ({
  db: {
    insert: mock.insert,
    transaction: mock.transaction,
  },
}));

import {
  consumeEmailVerificationToken,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  storeEmailVerificationToken,
} from "./verification";

beforeEach(() => {
  mock.record = null;
  mock.insert.mockImplementation(() => ({
    values: (value: { id: string; expiresAt: Date }) => {
      mock.record = { id: value.id, expiresAt: value.expiresAt };
      return { onConflictDoUpdate: () => Promise.resolve() };
    },
  }));
  mock.transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => {
    const query = {
      from: () => ({
        where: () => ({
          for: () => ({
            limit: async () => (mock.record ? [mock.record] : []),
          }),
        }),
      }),
    };
    const tx = {
      select: () => query,
      delete: () => ({
        where: async () => {
          mock.record = null;
        },
      }),
    };
    return run(tx);
  });
});

describe("one-time email verification tokens", () => {
  it("stores only a hash, expires after an hour, and can be consumed once", async () => {
    const token = "signed-verification-token";
    await storeEmailVerificationToken("user-1", token);

    expect(mock.record?.id).not.toBe(token);
    expect(mock.record?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mock.record?.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000,
    );
    await expect(consumeEmailVerificationToken(token)).resolves.toBe(true);
    await expect(consumeEmailVerificationToken(token)).resolves.toBe(false);
  });

  it("deletes expired tokens without consuming them", async () => {
    const token = "expired-verification-token";
    await storeEmailVerificationToken("user-1", token);
    if (mock.record) mock.record.expiresAt = new Date(Date.now() - 1);

    await expect(consumeEmailVerificationToken(token)).resolves.toBe(false);
    expect(mock.record).toBeNull();
  });
});
