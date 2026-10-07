import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  record: null as {
    id: string;
    value: string;
    identifier: string;
    expiresAt: Date;
    updatedAt: Date;
  } | null,
  insert: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@ayni/db", () => ({
  db: {
    insert: mock.insert,
    select: mock.select,
    transaction: mock.transaction,
  },
}));

import {
  claimEmailVerificationToken,
  completeEmailVerificationToken,
  EMAIL_VERIFICATION_CLAIM_LEASE_MS,
  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  isClaimedEmailVerificationToken,
  releaseEmailVerificationToken,
  storeEmailVerificationToken,
} from "./verification";

beforeEach(() => {
  mock.record = null;
  mock.insert.mockImplementation(() => ({
    values: (value: {
      id: string;
      value: string;
      identifier: string;
      expiresAt: Date;
      updatedAt: Date;
    }) => {
      mock.record = { ...value };
      return { onConflictDoUpdate: () => Promise.resolve() };
    },
  }));
  mock.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => (mock.record ? [mock.record] : []),
      }),
    }),
  }));
  mock.transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => {
    const query = {
      from: () => ({
        where: () => ({
          for: () => ({
            limit: async () =>
              mock.record
                ? [
                    {
                      ...mock.record,
                      userId: mock.record.value,
                    },
                  ]
                : [],
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
      update: () => ({
        set: (values: Partial<NonNullable<typeof mock.record>>) => ({
          where: async () => {
            if (mock.record) Object.assign(mock.record, values);
          },
        }),
      }),
    };
    return run(tx);
  });
});

describe("one-time email verification tokens", () => {
  it("stores a hash with the account id and a one-hour expiration", async () => {
    const token = "signed-verification-token";
    await storeEmailVerificationToken("user-1", token);

    expect(mock.record?.id).not.toBe(token);
    expect(mock.record?.value).toBe("user-1");
    expect(mock.record?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mock.record?.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000,
    );
  });

  it("allows only one claim and releases it when verification must be retried", async () => {
    const token = "signed-verification-token";
    await storeEmailVerificationToken("user-1", token);

    const claim = await claimEmailVerificationToken(token);
    if (!claim) throw new Error("Expected a token claim.");
    expect(claim.userId).toBe("user-1");
    await expect(claimEmailVerificationToken(token)).resolves.toBeNull();
    await expect(isClaimedEmailVerificationToken(token, claim.claimId, "user-1")).resolves.toBe(
      true,
    );
    await expect(
      isClaimedEmailVerificationToken(token, claim.claimId, "another-user"),
    ).resolves.toBe(false);

    await expect(releaseEmailVerificationToken(token, claim.claimId)).resolves.toBe(true);
    expect(mock.record?.identifier).toBe("ayni-email-verification");
    await expect(claimEmailVerificationToken(token)).resolves.toMatchObject({ userId: "user-1" });
  });

  it("deletes the token after successful verification and rejects later claims", async () => {
    const token = "verified-token";
    await storeEmailVerificationToken("user-1", token);
    const claim = await claimEmailVerificationToken(token);
    if (!claim) throw new Error("Expected a token claim.");

    await expect(completeEmailVerificationToken(token, claim.claimId)).resolves.toBe(true);
    expect(mock.record).toBeNull();
    await expect(claimEmailVerificationToken(token)).resolves.toBeNull();
  });

  it("deletes expired tokens without issuing a claim", async () => {
    const token = "expired-verification-token";
    await storeEmailVerificationToken("user-1", token);
    if (mock.record) mock.record.expiresAt = new Date(Date.now() - 1);

    await expect(claimEmailVerificationToken(token)).resolves.toBeNull();
    expect(mock.record).toBeNull();
  });

  it("reclaims an abandoned claim after its lease expires", async () => {
    const token = "abandoned-claim-token";
    await storeEmailVerificationToken("user-1", token);
    const abandonedClaim = await claimEmailVerificationToken(token);
    if (!abandonedClaim) throw new Error("Expected a token claim.");
    if (mock.record) {
      mock.record.updatedAt = new Date(Date.now() - EMAIL_VERIFICATION_CLAIM_LEASE_MS - 1);
    }
    await expect(
      isClaimedEmailVerificationToken(token, abandonedClaim.claimId, "user-1"),
    ).resolves.toBe(false);

    const retryClaim = await claimEmailVerificationToken(token);
    if (!retryClaim) throw new Error("Expected an abandoned claim to be reclaimed.");
    expect(retryClaim.claimId).not.toBe(abandonedClaim.claimId);
    await expect(
      isClaimedEmailVerificationToken(token, abandonedClaim.claimId, "user-1"),
    ).resolves.toBe(false);
    await expect(
      isClaimedEmailVerificationToken(token, retryClaim.claimId, "user-1"),
    ).resolves.toBe(true);
    await expect(completeEmailVerificationToken(token, abandonedClaim.claimId)).resolves.toBe(
      false,
    );
    await expect(completeEmailVerificationToken(token, retryClaim.claimId)).resolves.toBe(true);
    expect(mock.record).toBeNull();
  });

  it("deletes expired claimed tokens instead of leaving them stuck", async () => {
    const token = "expired-claimed-token";
    await storeEmailVerificationToken("user-1", token);
    const claim = await claimEmailVerificationToken(token);
    if (!claim) throw new Error("Expected a token claim.");
    if (mock.record) mock.record.expiresAt = new Date(Date.now() - 1);

    await expect(claimEmailVerificationToken(token)).resolves.toBeNull();
    expect(mock.record).toBeNull();
  });
});
