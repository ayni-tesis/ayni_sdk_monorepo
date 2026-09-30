import {
  isPrivacyMapComplete,
  type PrivacyTreatment,
  privacyTreatmentSchema,
} from "@ayni/api/privacy-treatment";
import { applicationPrivacyTreatmentMap } from "@ayni/db/schema/index";
import { eq } from "drizzle-orm";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";

export type PrivacyTreatmentMap = {
  applicationId: string;
  treatments: PrivacyTreatment[];
  readyToPublish: boolean;
  updatedAt: string | null;
};

type PrivacyTreatmentMapRow = {
  applicationId: string;
  treatments: unknown;
  updatedAt: Date | string;
};

function toPrivacyTreatmentMap(row: PrivacyTreatmentMapRow): PrivacyTreatmentMap {
  if (!Array.isArray(row.treatments)) throw new Error("Invalid saved privacy treatment map");
  const treatments = row.treatments.map((value) => privacyTreatmentSchema.parse(value));
  return {
    applicationId: row.applicationId,
    treatments,
    readyToPublish: isPrivacyMapComplete(treatments),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

type GetMapExecutor = {
  select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

export async function getPrivacyTreatmentMap(
  database: ApplicationDatabase,
  applicationId: string,
): Promise<PrivacyTreatmentMap> {
  return database.transaction(async (transaction) => {
    const tx = transaction as GetMapExecutor;
    const [row] = (await tx
      .select()
      .from(applicationPrivacyTreatmentMap)
      .where(eq(applicationPrivacyTreatmentMap.applicationId, applicationId))
      .limit(1)) as PrivacyTreatmentMapRow[];

    if (!row) return { applicationId, treatments: [], readyToPublish: false, updatedAt: null };
    return toPrivacyTreatmentMap(row);
  });
}

export type UpdatePrivacyTreatmentMapInput = {
  applicationId: string;
  userId: string;
  treatments: PrivacyTreatment[];
};

export type UpdatePrivacyTreatmentMapResult =
  | { ok: true; map: PrivacyTreatmentMap }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

type UpsertMapExecutor = {
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => {
      onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => {
        returning: () => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

export async function updatePrivacyTreatmentMap(
  database: ApplicationDatabase,
  { applicationId, userId, treatments }: UpdatePrivacyTreatmentMapInput,
): Promise<UpdatePrivacyTreatmentMapResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const upsert = tx as unknown as UpsertMapExecutor;
      const [saved] = (await upsert
        .insert(applicationPrivacyTreatmentMap)
        .values({ applicationId: application.id, treatments, updatedById: userId })
        .onConflictDoUpdate({
          target: applicationPrivacyTreatmentMap.applicationId,
          set: { treatments, updatedById: userId, updatedAt: new Date() },
        })
        .returning()) as PrivacyTreatmentMapRow[];

      if (!saved) throw new Error("Privacy treatment map update returned no record");
      return toPrivacyTreatmentMap(saved);
    },
  );

  if (result.ok === false) return result;
  return { ok: true, map: result.value };
}
