import { application, member, sdkCredential } from "@ayni/db/schema/index";
import { and, eq } from "drizzle-orm";
import {
  deriveSdkCredentialPrefix,
  generateSdkCredentialSecret,
  hashSdkCredentialSecret,
} from "./sdk-credentials";

type RowsPromise = PromiseLike<Record<string, unknown>[]>;

export type SelectStep = RowsPromise & {
  limit: (count: number) => RowsPromise & {
    for: (strength: "update") => RowsPromise;
  };
};

export type TransactionExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => SelectStep;
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => {
      returning: () => Promise<Record<string, unknown>[]>;
    };
  };
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => {
        returning: () => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

export type CredentialDatabase = {
  transaction: <T>(callback: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type CredentialQueryDatabase = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Record<string, unknown>[]>;
      };
    };
  };
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

export type RevokedSdkCredential = {
  id: string;
  applicationId: string;
  revokedAt: string;
};

export type RevokeSdkCredentialInput = {
  applicationId: string;
  credentialId: string;
  userId: string;
};

export type RevokeSdkCredentialResult =
  | { ok: true; credential: RevokedSdkCredential }
  | { ok: false; reason: "forbidden" | "notFound" };

export type ListedSdkCredential = {
  id: string;
  applicationId: string;
  prefix: string | null;
  status: "active" | "revoked";
  createdAt: string;
  lastUsedAt: string | null;
};

export type ListSdkCredentialsInput = {
  applicationId: string;
  userId: string;
};

export type ListSdkCredentialsResult =
  | { ok: true; credentials: ListedSdkCredential[] }
  | { ok: false; reason: "forbidden" | "notFound" };

export type VerifiedSdkCredential = {
  credentialId: string;
  applicationId: string;
};

export type VerifySdkCredentialResult =
  | { ok: true; credential: VerifiedSdkCredential }
  | { ok: false; code: "invalidCredential" | "credentialRevoked"; message: string };

export const SDK_CREDENTIAL_REVOKED_MESSAGE =
  "La credencial fue revocada. Genera una nueva credencial para continuar.";

const INVALID_CREDENTIAL_MESSAGE = "La credencial no es válida.";

type ApplicationRow = { id: string; organizationId: string };

async function findManagedApplication(
  tx: TransactionExecutor,
  applicationId: string,
  userId: string,
): Promise<
  { ok: true; application: ApplicationRow } | { ok: false; reason: "forbidden" | "notFound" }
> {
  const applicationRows = (await tx
    .select({ id: application.id, organizationId: application.organizationId })
    .from(application)
    .where(eq(application.id, applicationId))
    .limit(1)
    .for("update")) as ApplicationRow[];
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

  return { ok: true, application: foundApplication };
}

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
        prefix: deriveSdkCredentialPrefix(secret),
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

export async function revokeSdkCredential(
  database: CredentialDatabase,
  { applicationId, credentialId, userId }: RevokeSdkCredentialInput,
): Promise<RevokeSdkCredentialResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;

    const authorized = await findManagedApplication(tx, applicationId, userId);
    if (!authorized.ok) return { ok: false, reason: authorized.reason };

    const credentialRows = (await tx
      .select({
        id: sdkCredential.id,
        applicationId: sdkCredential.applicationId,
        revokedAt: sdkCredential.revokedAt,
      })
      .from(sdkCredential)
      .where(
        and(eq(sdkCredential.id, credentialId), eq(sdkCredential.applicationId, applicationId)),
      )
      .limit(1)
      .for("update")) as { id: string; applicationId: string; revokedAt: Date | null }[];
    const foundCredential = credentialRows[0];

    if (!foundCredential) return { ok: false, reason: "notFound" };

    const revokedAt = foundCredential.revokedAt ?? new Date();
    if (!foundCredential.revokedAt) {
      const updatedRows = (await tx
        .update(sdkCredential)
        .set({ revokedAt })
        .where(eq(sdkCredential.id, foundCredential.id))
        .returning()) as { id: string; applicationId: string }[];
      if (!updatedRows[0]) throw new Error("SDK credential revocation returned no record");
    }

    return {
      ok: true,
      credential: {
        id: foundCredential.id,
        applicationId: foundCredential.applicationId,
        revokedAt: revokedAt.toISOString(),
      },
    };
  });
}

export type ReadOnlyExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => Promise<Record<string, unknown>[]>;
    };
  };
};

export async function listSdkCredentials(
  database: CredentialDatabase,
  { applicationId, userId }: ListSdkCredentialsInput,
): Promise<ListSdkCredentialsResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as ReadOnlyExecutor;

    const applicationRows = await tx
      .select({ id: application.id, organizationId: application.organizationId })
      .from(application)
      .where(eq(application.id, applicationId));
    const foundApplication = applicationRows[0] as
      | { id: string; organizationId: string }
      | undefined;

    if (!foundApplication) return { ok: false, reason: "notFound" };

    const membershipRows = await tx
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.userId, userId), eq(member.organizationId, foundApplication.organizationId)),
      );
    const membership = membershipRows[0] as { role: string } | undefined;

    if (!membership) return { ok: false, reason: "notFound" };
    if (membership.role !== "admin" && membership.role !== "owner") {
      return { ok: false, reason: "forbidden" };
    }

    const credentialRows = (await tx
      .select({
        id: sdkCredential.id,
        applicationId: sdkCredential.applicationId,
        prefix: sdkCredential.prefix,
        createdAt: sdkCredential.createdAt,
        revokedAt: sdkCredential.revokedAt,
      })
      .from(sdkCredential)
      .where(eq(sdkCredential.applicationId, foundApplication.id))) as {
      id: string;
      applicationId: string;
      prefix: string | null;
      createdAt: Date;
      revokedAt: Date | null;
    }[];

    const credentials = credentialRows
      .map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        prefix: row.prefix,
        status: row.revokedAt ? ("revoked" as const) : ("active" as const),
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: null,
      }))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));

    return { ok: true, credentials };
  });
}

export async function verifySdkCredential(
  database: CredentialQueryDatabase,
  secret: string,
): Promise<VerifySdkCredentialResult> {
  const foundRows = (await database
    .select({
      id: sdkCredential.id,
      applicationId: sdkCredential.applicationId,
      revokedAt: sdkCredential.revokedAt,
    })
    .from(sdkCredential)
    .where(eq(sdkCredential.secretHash, hashSdkCredentialSecret(secret)))
    .limit(1)) as { id: string; applicationId: string; revokedAt: Date | null }[];
  const found = foundRows[0];

  if (!found) {
    return { ok: false, code: "invalidCredential", message: INVALID_CREDENTIAL_MESSAGE };
  }
  if (found.revokedAt) {
    return { ok: false, code: "credentialRevoked", message: SDK_CREDENTIAL_REVOKED_MESSAGE };
  }

  return {
    ok: true,
    credential: { credentialId: found.id, applicationId: found.applicationId },
  };
}
