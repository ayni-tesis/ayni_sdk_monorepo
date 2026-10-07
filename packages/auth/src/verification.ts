import { createHash, randomUUID } from "node:crypto";
import { db } from "@ayni/db";
import * as schema from "@ayni/db/schema/auth";
import { eq } from "drizzle-orm";

export const EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60;
// ponytail: 5-minute claim ceiling; raise it if verification handlers can legitimately run longer.
export const EMAIL_VERIFICATION_CLAIM_LEASE_MS = 5 * 60 * 1000;
const EMAIL_VERIFICATION_IDENTIFIER = "ayni-email-verification";

function claimedIdentifier(claimId: string) {
  return `${EMAIL_VERIFICATION_IDENTIFIER}:claimed:${claimId}`;
}

function emailVerificationTokenId(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function storeEmailVerificationToken(userId: string, token: string) {
  const now = new Date();
  await db
    .insert(schema.verification)
    .values({
      id: emailVerificationTokenId(token),
      identifier: EMAIL_VERIFICATION_IDENTIFIER,
      value: userId,
      expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.verification.id,
      set: {
        identifier: EMAIL_VERIFICATION_IDENTIFIER,
        value: userId,
        expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000),
        updatedAt: now,
      },
    });
}

export async function claimEmailVerificationToken(token: string) {
  const tokenId = emailVerificationTokenId(token);
  const claimId = randomUUID();
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        identifier: schema.verification.identifier,
        userId: schema.verification.value,
        expiresAt: schema.verification.expiresAt,
        updatedAt: schema.verification.updatedAt,
      })
      .from(schema.verification)
      .where(eq(schema.verification.id, tokenId))
      .for("update")
      .limit(1);
    if (!record) return null;

    if (record.expiresAt.getTime() <= Date.now()) {
      await tx.delete(schema.verification).where(eq(schema.verification.id, tokenId));
      return null;
    }

    const now = Date.now();
    const pending = record.identifier === EMAIL_VERIFICATION_IDENTIFIER;
    const abandonedClaim =
      record.identifier.startsWith(`${EMAIL_VERIFICATION_IDENTIFIER}:claimed:`) &&
      now - record.updatedAt.getTime() >= EMAIL_VERIFICATION_CLAIM_LEASE_MS;
    if (!pending && !abandonedClaim) return null;

    await tx
      .update(schema.verification)
      .set({ identifier: claimedIdentifier(claimId), updatedAt: new Date(now) })
      .where(eq(schema.verification.id, tokenId));
    return { claimId, userId: record.userId };
  });
}

export async function isClaimedEmailVerificationToken(
  token: string,
  claimId: string,
  userId?: string,
) {
  const [record] = await db
    .select({
      identifier: schema.verification.identifier,
      value: schema.verification.value,
      expiresAt: schema.verification.expiresAt,
      updatedAt: schema.verification.updatedAt,
    })
    .from(schema.verification)
    .where(eq(schema.verification.id, emailVerificationTokenId(token)))
    .limit(1);

  return Boolean(
    record &&
      record.identifier === claimedIdentifier(claimId) &&
      (userId === undefined || record.value === userId) &&
      Date.now() - record.updatedAt.getTime() < EMAIL_VERIFICATION_CLAIM_LEASE_MS &&
      record.expiresAt.getTime() > Date.now(),
  );
}

export async function completeEmailVerificationToken(token: string, claimId: string) {
  const tokenId = emailVerificationTokenId(token);
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({ identifier: schema.verification.identifier })
      .from(schema.verification)
      .where(eq(schema.verification.id, tokenId))
      .for("update")
      .limit(1);
    if (!record || record.identifier !== claimedIdentifier(claimId)) return false;

    await tx.delete(schema.verification).where(eq(schema.verification.id, tokenId));
    return true;
  });
}

export async function releaseEmailVerificationToken(token: string, claimId: string) {
  const tokenId = emailVerificationTokenId(token);
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({ identifier: schema.verification.identifier })
      .from(schema.verification)
      .where(eq(schema.verification.id, tokenId))
      .for("update")
      .limit(1);
    if (!record || record.identifier !== claimedIdentifier(claimId)) return false;

    await tx
      .update(schema.verification)
      .set({ identifier: EMAIL_VERIFICATION_IDENTIFIER, updatedAt: new Date() })
      .where(eq(schema.verification.id, tokenId));
    return true;
  });
}
