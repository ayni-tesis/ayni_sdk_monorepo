import {
  DEFAULT_TELEMETRY_POLICY,
  isTelemetryRetentionDays,
  type TelemetryRetentionDays,
} from "@ayni/api/telemetry-policy";
import { applicationTelemetryPolicy } from "@ayni/db/schema/index";
import { eq } from "drizzle-orm";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";
import { getApplicationSetting, upsertApplicationSetting } from "./application-setting-store";

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

/** The application's telemetry policy, or the disabled default when none was saved. */
export async function getTelemetryPolicy(
  database: TelemetryPolicyDatabase,
  applicationId: string,
): Promise<TelemetryPolicy> {
  const row = (await getApplicationSetting(
    database,
    applicationTelemetryPolicy,
    eq(applicationTelemetryPolicy.applicationId, applicationId),
  )) as TelemetryPolicyRow | undefined;
  return row
    ? toTelemetryPolicy(row)
    : { applicationId, ...DEFAULT_TELEMETRY_POLICY, updatedAt: null };
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
      const saved = (await upsertApplicationSetting(
        tx,
        applicationTelemetryPolicy,
        { applicationId: application.id, enabled, retentionDays, updatedById: userId },
        applicationTelemetryPolicy.applicationId,
        { enabled, retentionDays, updatedById: userId, updatedAt: new Date() },
      )) as TelemetryPolicyRow | undefined;

      if (!saved) throw new Error("Telemetry policy update returned no record");
      return toTelemetryPolicy(saved);
    },
  );

  if (result.ok === false) return result;
  return { ok: true, policy: result.value };
}
