import { application, member, sdkCredential } from "@ayni/db/schema/index";
import { and, eq } from "drizzle-orm";
import {
  deriveSdkCredentialPrefix,
  generateSdkCredentialSecret,
  hashSdkCredentialSecret,
} from "./sdk-credentials";

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
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<unknown>;
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
        status: "active",
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

export type RegenerateSdkCredentialInput = {
  applicationId: string;
  credentialId: string;
  userId: string;
};

export type RegeneratedSdkCredential = {
  id: string;
  applicationId: string;
  secret: string;
};

export type RegenerateSdkCredentialResult =
  | { ok: true; credential: RegeneratedSdkCredential; revokedCredentialId: string }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" | "notActive" };

/**
 * Regenerates an active SDK credential for an active application.
 * Verifies that the user has admin or owner permissions in the workspace.
 * Revokes the target credential immediately (status: "revoked", revokedAt: now)
 * and issues a replacement credential with status: "active".
 * Rejects non-active credentials and archived applications.
 */
export async function regenerateSdkCredential(
  database: CredentialDatabase,
  { applicationId, credentialId, userId }: RegenerateSdkCredentialInput,
): Promise<RegenerateSdkCredentialResult> {
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

    const credentialRows = (await tx
      .select({
        id: sdkCredential.id,
        applicationId: sdkCredential.applicationId,
        status: sdkCredential.status,
      })
      .from(sdkCredential)
      .where(
        and(
          eq(sdkCredential.id, credentialId),
          eq(sdkCredential.applicationId, foundApplication.id),
        ),
      )
      .limit(1)
      .for("update")) as { id: string; applicationId: string; status: string }[];
    const foundCredential = credentialRows[0];

    if (!foundCredential) return { ok: false, reason: "notFound" };
    if (foundCredential.status !== "active") return { ok: false, reason: "notActive" };

    await tx
      .update(sdkCredential)
      .set({
        status: "revoked",
        revokedAt: new Date(),
      })
      .where(eq(sdkCredential.id, foundCredential.id));

    const secret = generateSdkCredentialSecret();
    const newCredentialRows = (await tx
      .insert(sdkCredential)
      .values({
        id: crypto.randomUUID(),
        applicationId: foundApplication.id,
        secretHash: hashSdkCredentialSecret(secret),
        prefix: deriveSdkCredentialPrefix(secret),
        status: "active",
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
 * Returns credentials sorted by creation date descending with metadata.
 */
export async function listSdkCredentials(
  database: CredentialDatabase,
  { applicationId, userId }: ListSdkCredentialsInput,
): Promise<ListSdkCredentialsResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as ReadOnlyExecutor;

    const applicationRows = (await tx
      .select({ id: application.id, organizationId: application.organizationId })
      .from(application)
      .where(eq(application.id, applicationId))) as { id: string; organizationId: string }[];
    const foundApplication = applicationRows[0];

    if (!foundApplication) return { ok: false, reason: "notFound" };

    const membershipRows = (await tx
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.userId, userId), eq(member.organizationId, foundApplication.organizationId)),
      )) as { role: string }[];
    const membership = membershipRows[0];

    if (!membership) return { ok: false, reason: "notFound" };
    if (membership.role !== "admin" && membership.role !== "owner") {
      return { ok: false, reason: "forbidden" };
    }

    const credentialRows = (await tx
      .select({
        id: sdkCredential.id,
        applicationId: sdkCredential.applicationId,
        prefix: sdkCredential.prefix,
        status: sdkCredential.status,
        createdAt: sdkCredential.createdAt,
        lastUsedAt: sdkCredential.lastUsedAt,
      })
      .from(sdkCredential)
      .where(eq(sdkCredential.applicationId, foundApplication.id))) as {
      id: string;
      applicationId: string;
      prefix: string | null;
      status: "active" | "revoked";
      createdAt: Date;
      lastUsedAt: Date | null;
    }[];

    const credentials = credentialRows
      .map((row) => ({
        id: row.id,
        applicationId: row.applicationId,
        prefix: row.prefix,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      }))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));

    return { ok: true, credentials };
  });
}

export type AuthenticateSdkCredentialInput = {
  secret: string;
};

export type AuthenticatedSdkCredential = {
  id: string;
  applicationId: string;
  prefix: string | null;
  status: "active";
};

export type AuthenticateSdkCredentialResult =
  | { ok: true; credential: AuthenticatedSdkCredential }
  | { ok: false; reason: "notFound" | "revoked" | "notActive" | "archived" };

/**
 * Authenticates an SDK credential secret.
 *
 * Enforces the SDK security boundary by requiring both the matched credential
 * and its parent application to have an "active" status before granting access.
 * Rejects revoked credentials (immediate rejection after regeneration),
 * inactive credentials, and credentials belonging to archived applications.
 * Updates lastUsedAt on successful authentication.
 */
export async function authenticateSdkCredential(
  database: CredentialDatabase,
  { secret }: AuthenticateSdkCredentialInput,
): Promise<AuthenticateSdkCredentialResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as TransactionExecutor;
    const secretHash = hashSdkCredentialSecret(secret);

    const credentialRows = (await tx
      .select({
        id: sdkCredential.id,
        applicationId: sdkCredential.applicationId,
        prefix: sdkCredential.prefix,
        status: sdkCredential.status,
      })
      .from(sdkCredential)
      .where(eq(sdkCredential.secretHash, secretHash))
      .limit(1)
      .for("update")) as {
      id: string;
      applicationId: string;
      prefix: string | null;
      status: "active" | "revoked";
    }[];
    const foundCredential = credentialRows[0];

    if (!foundCredential) return { ok: false, reason: "notFound" };
    if (foundCredential.status === "revoked") return { ok: false, reason: "revoked" };
    if (foundCredential.status !== "active") return { ok: false, reason: "notActive" };

    const applicationRows = (await tx
      .select({
        id: application.id,
        status: application.status,
      })
      .from(application)
      .where(eq(application.id, foundCredential.applicationId))
      .limit(1)
      .for("update")) as { id: string; status: string }[];
    const foundApplication = applicationRows[0];

    if (foundApplication?.status !== "active") {
      return { ok: false, reason: "archived" };
    }

    await tx
      .update(sdkCredential)
      .set({ lastUsedAt: new Date() })
      .where(eq(sdkCredential.id, foundCredential.id));

    return {
      ok: true,
      credential: {
        id: foundCredential.id,
        applicationId: foundCredential.applicationId,
        prefix: foundCredential.prefix,
        status: "active",
      },
    };
  });
}
