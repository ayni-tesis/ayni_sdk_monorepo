import {
  DEFAULT_TELEMETRY_POLICY,
  isTelemetryRetentionDays,
  type TelemetryRetentionDays,
} from "@ayni/api/telemetry-policy";
import { applicationTelemetryPolicy } from "@ayni/db/schema/index";
import { eq } from "drizzle-orm";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";

export type TelemetryPolicyDatabase = ApplicationDatabase;

export type TelemetryPolicy = {
  applicationId: string;
  enabled: boolean;
  retentionDays: TelemetryRetentionDays;
  /** When an administrator last saved it; null while the application keeps the default. */
  updatedAt: string | null;
};

type TelemetryPolicyRow = {
  applicationId: string;
  enabled: boolean;
  retentionDays: number;
  updatedAt: Date | string;
};

function toTelemetryPolicy(row: TelemetryPolicyRow): TelemetryPolicy {
  if (!isTelemetryRetentionDays(row.retentionDays)) {
    throw new Error(`Unsupported telemetry retention: ${String(row.retentionDays)}`);
  }
  return {
    applicationId: row.applicationId,
    enabled: row.enabled,
    retentionDays: row.retentionDays,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

type GetTelemetryPolicyExecutor = {
  select: () => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/** The application's telemetry policy, or the disabled default when none was saved. */
export async function getTelemetryPolicy(
  database: TelemetryPolicyDatabase,
  applicationId: string,
): Promise<TelemetryPolicy> {
  return database.transaction(async (transaction) => {
    const tx = transaction as GetTelemetryPolicyExecutor;
    const [row] = (await tx
      .select()
      .from(applicationTelemetryPolicy)
      .where(eq(applicationTelemetryPolicy.applicationId, applicationId))
      .limit(1)) as TelemetryPolicyRow[];

    if (!row) return { applicationId, ...DEFAULT_TELEMETRY_POLICY, updatedAt: null };
    return toTelemetryPolicy(row);
  });
}

export type UpdateTelemetryPolicyInput = {
  applicationId: string;
  userId: string;
  enabled: boolean;
  retentionDays: TelemetryRetentionDays;
};

export type UpdateTelemetryPolicyResult =
  | { ok: true; policy: TelemetryPolicy }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

type UpsertTelemetryPolicyExecutor = {
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => {
      onConflictDoUpdate: (config: { target: unknown; set: Record<string, unknown> }) => {
        returning: () => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/**
 * Saves the telemetry policy of an active application. Only workspace
 * administrators and owners may change it; any other outcome writes nothing,
 * so the previous policy is kept.
 */
export async function updateTelemetryPolicy(
  database: TelemetryPolicyDatabase,
  { applicationId, userId, enabled, retentionDays }: UpdateTelemetryPolicyInput,
): Promise<UpdateTelemetryPolicyResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const upsert = tx as unknown as UpsertTelemetryPolicyExecutor;
      const [saved] = (await upsert
        .insert(applicationTelemetryPolicy)
        .values({ applicationId: application.id, enabled, retentionDays, updatedById: userId })
        .onConflictDoUpdate({
          target: applicationTelemetryPolicy.applicationId,
          set: { enabled, retentionDays, updatedById: userId, updatedAt: new Date() },
        })
        .returning()) as TelemetryPolicyRow[];

      if (!saved) throw new Error("Telemetry policy update returned no record");
      return toTelemetryPolicy(saved);
    },
  );

  if (result.ok === false) return result;
  return { ok: true, policy: result.value };
}
