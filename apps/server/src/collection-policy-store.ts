import {
  type CollectionPolicySettings,
  DEFAULT_COLLECTION_POLICY,
  isCollectionNetwork,
} from "@ayni/api/collection-policy";
import { applicationCollectionPolicy } from "@ayni/db/schema/index";
import { eq } from "drizzle-orm";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";
import { getApplicationSetting, upsertApplicationSetting } from "./application-setting-store";

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

/** The application's collection policy, or the disabled default when none was saved. */
export async function getCollectionPolicy(
  database: CollectionPolicyDatabase,
  applicationId: string,
): Promise<CollectionPolicy> {
  const row = (await getApplicationSetting(
    database,
    applicationCollectionPolicy,
    eq(applicationCollectionPolicy.applicationId, applicationId),
  )) as CollectionPolicyRow | undefined;
  return row
    ? toCollectionPolicy(row)
    : { applicationId, ...DEFAULT_COLLECTION_POLICY, updatedAt: null };
}

export type UpdateCollectionPolicyInput = CollectionPolicySettings & {
  applicationId: string;
  userId: string;
};

export type UpdateCollectionPolicyResult =
  | { ok: true; policy: CollectionPolicy }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

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
      const saved = (await upsertApplicationSetting(
        tx,
        applicationCollectionPolicy,
        { applicationId: application.id, ...settings, updatedById: userId },
        applicationCollectionPolicy.applicationId,
        { ...settings, updatedById: userId, updatedAt: new Date() },
      )) as CollectionPolicyRow | undefined;

      if (!saved) throw new Error("Collection policy update returned no record");
      return toCollectionPolicy(saved);
    },
  );

  if (result.ok === false) return result;
  return { ok: true, policy: result.value };
}
