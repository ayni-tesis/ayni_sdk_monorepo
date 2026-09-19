import { application, member, sdkCredential } from "@ayni/db/schema/index";
import { and, eq } from "drizzle-orm";
import { generateSdkCredentialSecret, hashSdkCredentialSecret } from "./sdk-credentials";

export type TransactionExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => {
          for: (strength: "update") => Promise<Record<string, unknown>[]>;
        };
      };
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => {
      returning: () => Promise<Record<string, unknown>[]>;
    };
  };
};

export type CredentialDatabase = {
  transaction: <T>(callback: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type CreatedSdkCredential = {
  id: string;
  applicationId: string;
  secret: string;
};

export type CreateSdkCredentialResult =
  | { ok: true; credential: CreatedSdkCredential }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export type CreateSdkCredentialInput = {
  applicationId: string;
  userId: string;
};

export async function createSdkCredential(
  database: CredentialDatabase,
  { applicationId, userId }: CreateSdkCredentialInput,
): Promise<CreateSdkCredentialResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;

    const applicationRows = (await tx
      .select({
        id: application.id,
        organizationId: application.organizationId,
        status: application.status,
      })
      .from(application)
      .where(eq(application.id, applicationId))
      .limit(1)
      .for("update")) as { id: string; organizationId: string; status: string }[];
    const foundApplication = applicationRows[0];

    if (!foundApplication) return { ok: false, reason: "notFound" };

    const membershipRows = (await tx
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.userId, userId), eq(member.organizationId, foundApplication.organizationId)),
      )
      .limit(1)
      .for("update")) as { role: string }[];
    const membership = membershipRows[0];

    if (!membership) return { ok: false, reason: "notFound" };
    if (membership.role !== "admin" && membership.role !== "owner") {
      return { ok: false, reason: "forbidden" };
    }
    if (foundApplication.status !== "active") return { ok: false, reason: "archived" };

    const secret = generateSdkCredentialSecret();
    const credentialRows = (await tx
      .insert(sdkCredential)
      .values({
        id: crypto.randomUUID(),
        applicationId: foundApplication.id,
        secretHash: hashSdkCredentialSecret(secret),
      })
      .returning()) as { id: string; applicationId: string }[];
    const created = credentialRows[0];

    if (!created) throw new Error("SDK credential creation returned no record");

    return {
      ok: true,
      credential: {
        id: created.id,
        applicationId: created.applicationId,
        secret,
      },
    };
  });
}
