import { application, member, sdkCredential } from "@ayni/db/schema/index";
import { and, eq, isNull } from "drizzle-orm";
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

export type RegeneratedSdkCredential = {
  id: string;
  applicationId: string;
  secret: string;
};

export type RegenerateSdkCredentialInput = {
  applicationId: string;
  credentialId: string;
  userId: string;
};

export type RegenerateSdkCredentialResult =
  | { ok: true; credential: RegeneratedSdkCredential; revokedCredentialId: string }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" | "notActive" };

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

export const INVALID_CREDENTIAL_MESSAGE = "La credencial no es válida.";

type ApplicationRow = { id: string; organizationId: string; status: string };

async function findManagedApplication(
  tx: TransactionExecutor,
  applicationId: string,
  userId: string,
): Promise<
  { ok: true; application: ApplicationRow } | { ok: false; reason: "forbidden" | "notFound" }
> {
  const applicationRows = (await tx
    .select({
      id: application.id,
      organizationId: application.organizationId,
      status: application.status,
    })
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

/**
 * Creates a new SDK credential for an active application.
 * Verifies that the user has admin or owner permissions in the application's workspace.
 * Rejects archived applications. Stores only the SHA-256 hash of the secret.
 */
export async function createSdkCredential(
  database: CredentialDatabase,
  { applicationId, userId }: CreateSdkCredentialInput,
): Promise<CreateSdkCredentialResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;

    const authorized = await findManagedApplication(tx, applicationId, userId);
    if (authorized.ok === false) return { ok: false, reason: authorized.reason };
    if (authorized.application.status !== "active") return { ok: false, reason: "archived" };

    const foundApplication = authorized.application;
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

/**
 * Revokes an SDK credential for an application.
 * Verifies that the user has admin or owner permissions in the workspace.
 * Sets revokedAt timestamp if not already set.
 */
export async function revokeSdkCredential(
  database: CredentialDatabase,
  { applicationId, credentialId, userId }: RevokeSdkCredentialInput,
): Promise<RevokeSdkCredentialResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;

    const authorized = await findManagedApplication(tx, applicationId, userId);
    if (authorized.ok === false) return { ok: false, reason: authorized.reason };

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

/**
 * Regenerates an active SDK credential for an active application.
 * Verifies that the user has admin or owner permissions in the workspace.
 * Revokes the target credential immediately (revokedAt: now)
 * and issues a replacement credential.
 * Rejects non-active (already revoked) credentials and archived applications.
 */
export async function regenerateSdkCredential(
  database: CredentialDatabase,
  { applicationId, credentialId, userId }: RegenerateSdkCredentialInput,
): Promise<RegenerateSdkCredentialResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;

    const authorized = await findManagedApplication(tx, applicationId, userId);
    if (authorized.ok === false) return { ok: false, reason: authorized.reason };
    if (authorized.application.status !== "active") return { ok: false, reason: "archived" };

    const foundApplication = authorized.application;

    const credentialRows = (await tx
      .select({
        id: sdkCredential.id,
        applicationId: sdkCredential.applicationId,
        revokedAt: sdkCredential.revokedAt,
      })
      .from(sdkCredential)
      .where(
        and(
          eq(sdkCredential.id, credentialId),
          eq(sdkCredential.applicationId, foundApplication.id),
        ),
      )
      .limit(1)
      .for("update")) as { id: string; applicationId: string; revokedAt: Date | null }[];
    const foundCredential = credentialRows[0];

    if (!foundCredential) return { ok: false, reason: "notFound" };
    if (foundCredential.revokedAt !== null) return { ok: false, reason: "notActive" };

    const revokedAt = new Date();
    await tx
      .update(sdkCredential)
      .set({ revokedAt })
      .where(eq(sdkCredential.id, foundCredential.id))
      .returning();

    const secret = generateSdkCredentialSecret();
    const newCredentialRows = (await tx
      .insert(sdkCredential)
      .values({
        id: crypto.randomUUID(),
        applicationId: foundApplication.id,
        secretHash: hashSdkCredentialSecret(secret),
        prefix: deriveSdkCredentialPrefix(secret),
      })
      .returning()) as { id: string; applicationId: string }[];
    const created = newCredentialRows[0];

    if (!created) throw new Error("SDK credential regeneration returned no record");

    return {
      ok: true,
      credential: {
        id: created.id,
        applicationId: created.applicationId,
        secret,
      },
      revokedCredentialId: foundCredential.id,
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

/**
 * Lists all SDK credentials for an application.
 * Verifies that the user has admin or owner permissions in the workspace.
 * Returns credentials sorted by creation date descending with operational metadata.
 */
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
        lastUsedAt: sdkCredential.lastUsedAt,
        revokedAt: sdkCredential.revokedAt,
      })
      .from(sdkCredential)
      .where(eq(sdkCredential.applicationId, foundApplication.id))) as {
      id: string;
      applicationId: string;
      prefix: string | null;
      createdAt: Date;
      lastUsedAt: Date | null;
      revokedAt: Date | null;
    }[];

    const credentials = credentialRows
      .map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        prefix: row.prefix,
        status: row.revokedAt ? ("revoked" as const) : ("active" as const),
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.revokedAt ? null : (row.lastUsedAt?.toISOString() ?? null),
      }))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));

    return { ok: true, credentials };
  });
}

/**
 * Verifies an SDK credential secret for SDK synchronization requests and
 * registers the credential's last use atomically. Rejects nonexistent or
 * revoked credentials without recording anything (the row lock held through
 * the transaction prevents a concurrent revocation from slipping between
 * verification and use).
 */
export async function useSdkCredential(
  database: CredentialDatabase,
  secret: string,
): Promise<VerifySdkCredentialResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;

    const foundRows = (await tx
      .select({
        id: sdkCredential.id,
        applicationId: sdkCredential.applicationId,
        revokedAt: sdkCredential.revokedAt,
      })
      .from(sdkCredential)
      .where(eq(sdkCredential.secretHash, hashSdkCredentialSecret(secret)))
      .limit(1)
      .for("update")) as { id: string; applicationId: string; revokedAt: Date | null }[];
    const found = foundRows[0];

    if (!found) {
      return { ok: false, code: "invalidCredential", message: INVALID_CREDENTIAL_MESSAGE };
    }
    if (found.revokedAt) {
      return { ok: false, code: "credentialRevoked", message: SDK_CREDENTIAL_REVOKED_MESSAGE };
    }

    await tx
      .update(sdkCredential)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(sdkCredential.id, found.id), isNull(sdkCredential.revokedAt)))
      .returning();

    return {
      ok: true,
      credential: { credentialId: found.id, applicationId: found.applicationId },
    };
  });
}
