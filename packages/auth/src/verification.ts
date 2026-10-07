import { createHash } from "node:crypto";
import { db } from "@ayni/db";
import * as schema from "@ayni/db/schema/auth";
import { and, eq } from "drizzle-orm";

export const EMAIL_VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60;

function emailVerificationTokenId(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function storeEmailVerificationToken(userId: string, token: string) {
  const now = new Date();
  await db
    .insert(schema.verification)
    .values({
      id: emailVerificationTokenId(token),
      identifier: "ayni-email-verification",
      value: userId,
      expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.verification.id,
      set: {
        identifier: "ayni-email-verification",
        value: userId,
        expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_SECONDS * 1000),
        updatedAt: now,
      },
    });
}

export async function consumeEmailVerificationToken(token: string) {
  const tokenId = emailVerificationTokenId(token);
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({ id: schema.verification.id, expiresAt: schema.verification.expiresAt })
      .from(schema.verification)
      .where(
        and(
          eq(schema.verification.id, tokenId),
          eq(schema.verification.identifier, "ayni-email-verification"),
        ),
      )
      .for("update")
      .limit(1);
    if (!record) return false;

    await tx
      .delete(schema.verification)
      .where(
        and(
          eq(schema.verification.id, tokenId),
          eq(schema.verification.identifier, "ayni-email-verification"),
        ),
      );
    return record.expiresAt.getTime() > Date.now();
  });
}
