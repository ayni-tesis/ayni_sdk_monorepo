import {
  type CollectionPolicySettings,
  DEFAULT_COLLECTION_POLICY,
  isCollectionNetwork,
} from "@ayni/api/collection-policy";
import { applicationCollectionPolicy } from "@ayni/db/schema/index";
import { eq } from "drizzle-orm";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";

export type CollectionPolicyDatabase = ApplicationDatabase;

export type CollectionPolicy = CollectionPolicySettings & {
  applicationId: string;
  /** When an administrator last saved it; null while the application keeps the default. */
  updatedAt: string | null;
};

type CollectionPolicyRow = {
  applicationId: string;
  enabled: boolean;
  consentRequired: boolean;
  network: string;
  maxImageSize: number;
  imageQuality: number;
  updatedAt: Date | string;
};

function toCollectionPolicy(row: CollectionPolicyRow): CollectionPolicy {
  if (!isCollectionNetwork(row.network)) {
    throw new Error(`Unsupported collection network: ${row.network}`);
  }
  return {
    applicationId: row.applicationId,
    enabled: row.enabled,
    consentRequired: row.consentRequired,
    network: row.network,
    maxImageSize: row.maxImageSize,
    imageQuality: row.imageQuality,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

type GetCollectionPolicyExecutor = {
  select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/** The application's collection policy, or the disabled default when none was saved. */
export async function getCollectionPolicy(
  database: CollectionPolicyDatabase,
  applicationId: string,
): Promise<CollectionPolicy> {
  return database.transaction(async (transaction) => {
    const tx = transaction as GetCollectionPolicyExecutor;
    const [row] = (await tx
      .select()
      .from(applicationCollectionPolicy)
      .where(eq(applicationCollectionPolicy.applicationId, applicationId))
      .limit(1)) as CollectionPolicyRow[];

    if (!row) return { applicationId, ...DEFAULT_COLLECTION_POLICY, updatedAt: null };
    return toCollectionPolicy(row);
  });
}

export type UpdateCollectionPolicyInput = CollectionPolicySettings & {
  applicationId: string;
  userId: string;
};

export type UpdateCollectionPolicyResult =
  | { ok: true; policy: CollectionPolicy }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

type UpsertCollectionPolicyExecutor = {
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => {
      onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => {
        returning: () => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/**
 * Saves the collection policy of an active application. Only workspace
 * administrators and owners may change it; any other outcome writes nothing,
 * so the previous policy is kept.
 */
export async function updateCollectionPolicy(
  database: CollectionPolicyDatabase,
  { applicationId, userId, ...settings }: UpdateCollectionPolicyInput,
): Promise<UpdateCollectionPolicyResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const upsert = tx as unknown as UpsertCollectionPolicyExecutor;
      const [saved] = (await upsert
        .insert(applicationCollectionPolicy)
        .values({ applicationId: application.id, ...settings, updatedById: userId })
        .onConflictDoUpdate({
          target: applicationCollectionPolicy.applicationId,
          set: { ...settings, updatedById: userId, updatedAt: new Date() },
        })
        .returning()) as CollectionPolicyRow[];

      if (!saved) throw new Error("Collection policy update returned no record");
      return toCollectionPolicy(saved);
    },
  );

  if (result.ok === false) return result;
  return { ok: true, policy: result.value };
}
