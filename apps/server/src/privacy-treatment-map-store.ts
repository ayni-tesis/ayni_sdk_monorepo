import {
  isPrivacyMapComplete,
  missingPrivacyTreatmentFields,
  type PrivacyTreatment,
  privacyTreatmentSchema,
} from "@ayni/api/privacy-treatment";
import {
  applicationPrivacyNoticeVersion,
  applicationPrivacyTreatmentMap,
} from "@ayni/db/schema/index";
import { and, eq } from "drizzle-orm";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";
import { getApplicationSetting, upsertApplicationSetting } from "./application-setting-store";

export type PrivacyTreatmentMap = {
  applicationId: string;
  treatments: PrivacyTreatment[];
  readyToPublish: boolean;
  latestPublishedVersion: number;
  updatedAt: string | null;
};

type PrivacyTreatmentMapRow = {
  applicationId: string;
  treatments: unknown;
  latestPublishedVersion: number;
  updatedAt: Date | string;
};

function toPrivacyTreatmentMap(row: PrivacyTreatmentMapRow): PrivacyTreatmentMap {
  if (!Array.isArray(row.treatments)) throw new Error("Invalid saved privacy treatment map");
  const treatments = row.treatments.map((value) => privacyTreatmentSchema.parse(value));
  return {
    applicationId: row.applicationId,
    treatments,
    readyToPublish: isPrivacyMapComplete(treatments),
    latestPublishedVersion: row.latestPublishedVersion,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function getPrivacyTreatmentMap(
  database: ApplicationDatabase,
  applicationId: string,
): Promise<PrivacyTreatmentMap> {
  const row = (await getApplicationSetting(
    database,
    applicationPrivacyTreatmentMap,
    eq(applicationPrivacyTreatmentMap.applicationId, applicationId),
  )) as PrivacyTreatmentMapRow | undefined;
  return row
    ? toPrivacyTreatmentMap(row)
    : {
        applicationId,
        treatments: [],
        readyToPublish: false,
        latestPublishedVersion: 0,
        updatedAt: null,
      };
}

export type UpdatePrivacyTreatmentMapInput = {
  applicationId: string;
  userId: string;
  treatments: PrivacyTreatment[];
};

export type UpdatePrivacyTreatmentMapResult =
  | { ok: true; map: PrivacyTreatmentMap }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export type PrivacyNoticeVersion = {
  applicationId: string;
  version: number;
  publishedAt: string;
};

export type PublishPrivacyNoticeResult =
  | { ok: true; version: PrivacyNoticeVersion }
  | {
      ok: false;
      reason: "forbidden" | "notFound" | "archived" | "incomplete";
      pendingTreatments?: Array<{ id: string; purpose: string; fields: string[] }>;
    };

export type PublishedPrivacyNotice = PrivacyNoticeVersion & {
  treatments: PrivacyTreatment[];
};

/** Public, read-only view of the current immutable notice snapshot. */
export async function getPublishedPrivacyNotice(
  database: ApplicationDatabase,
  applicationId: string,
): Promise<PublishedPrivacyNotice | undefined> {
  const map = await getApplicationSetting(
    database,
    applicationPrivacyTreatmentMap,
    eq(applicationPrivacyTreatmentMap.applicationId, applicationId),
  );
  const version = Number(map?.latestPublishedVersion ?? 0);
  if (!Number.isInteger(version) || version < 1) return;

  const row = await getApplicationSetting(
    database,
    applicationPrivacyNoticeVersion,
    and(
      eq(applicationPrivacyNoticeVersion.applicationId, applicationId),
      eq(applicationPrivacyNoticeVersion.version, version),
    ),
  );
  if (!row || !Array.isArray(row.treatments)) return;
  const publishedAt = row.publishedAt;
  return {
    applicationId,
    version,
    publishedAt: publishedAt instanceof Date ? publishedAt.toISOString() : String(publishedAt),
    treatments: row.treatments.map((value) => privacyTreatmentSchema.parse(value)),
  };
}

export async function updatePrivacyTreatmentMap(
  database: ApplicationDatabase,
  { applicationId, userId, treatments }: UpdatePrivacyTreatmentMapInput,
): Promise<UpdatePrivacyTreatmentMapResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const saved = (await upsertApplicationSetting(
        tx,
        applicationPrivacyTreatmentMap,
        { applicationId: application.id, treatments, updatedById: userId },
        applicationPrivacyTreatmentMap.applicationId,
        { treatments, updatedById: userId, updatedAt: new Date() },
      )) as PrivacyTreatmentMapRow | undefined;

      if (!saved) throw new Error("Privacy treatment map update returned no record");
      return toPrivacyTreatmentMap(saved);
    },
  );

  if (result.ok === false) return result;
  return { ok: true, map: result.value };
}

/** Publishes an immutable snapshot only after every treatment is confirmed. */
export async function publishPrivacyNotice(
  database: ApplicationDatabase,
  { applicationId, userId }: { applicationId: string; userId: string },
): Promise<PublishPrivacyNoticeResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (transaction, application) => {
      const tx = transaction as unknown as {
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
      const [map] = (await tx
        .select({
          treatments: applicationPrivacyTreatmentMap.treatments,
          latestPublishedVersion: applicationPrivacyTreatmentMap.latestPublishedVersion,
        })
        .from(applicationPrivacyTreatmentMap)
        .where(eq(applicationPrivacyTreatmentMap.applicationId, application.id))
        .limit(1)
        .for("update")) as Array<{ treatments: unknown; latestPublishedVersion: number }>;
      const treatments = Array.isArray(map?.treatments)
        ? map.treatments.map((value) => privacyTreatmentSchema.parse(value))
        : [];
      const pendingTreatments = treatments.flatMap((treatment) => {
        const fields = missingPrivacyTreatmentFields(treatment);
        return fields.length > 0 ? [{ id: treatment.id, purpose: treatment.purpose, fields }] : [];
      });

      if (pendingTreatments.length > 0 || treatments.length === 0) {
        return { ok: false as const, reason: "incomplete" as const, pendingTreatments };
      }

      const version = (map?.latestPublishedVersion ?? 0) + 1;
      const [saved] = (await tx
        .insert(applicationPrivacyNoticeVersion)
        .values({
          id: crypto.randomUUID(),
          applicationId: application.id,
          version,
          treatments,
          publishedById: userId,
        })
        .returning()) as Array<{ publishedAt: Date | string }>;
      if (!saved) throw new Error("Privacy notice publish returned no record");
      await tx
        .update(applicationPrivacyTreatmentMap)
        .set({ latestPublishedVersion: version })
        .where(eq(applicationPrivacyTreatmentMap.applicationId, application.id));
      return {
        ok: true as const,
        version: {
          applicationId: application.id,
          version,
          publishedAt:
            saved.publishedAt instanceof Date
              ? saved.publishedAt.toISOString()
              : String(saved.publishedAt),
        },
      };
    },
  );

  if (result.ok === false) return result;
  return result.value;
}
