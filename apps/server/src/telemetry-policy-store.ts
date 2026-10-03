import {
  DEFAULT_TELEMETRY_POLICY,
  isTelemetryRetentionDays,
  type TelemetryRetentionDays,
} from "@ayni/api/telemetry-policy";
import { applicationTelemetryPolicy } from "@ayni/db/schema/index";
import { eq } from "drizzle-orm";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";
import { getApplicationSetting, upsertApplicationSetting } from "./application-setting-store";
import { applyTraceRetention, type SdkTraceDatabase } from "./sdk-trace-store";

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

/** A change to the policy: a field left out keeps its saved value. */
export type UpdateTelemetryPolicyInput = {
  applicationId: string;
  userId: string;
  enabled?: boolean;
  retentionDays?: TelemetryRetentionDays;
};

export type UpdateTelemetryPolicyResult =
  | { ok: true; policy: TelemetryPolicy }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

/**
 * Saves the telemetry policy of an active application. Only workspace
 * administrators and owners may change it; any other outcome writes nothing,
 * so the previous policy is kept. A new retention period also applies, in the
 * same transaction, to the traces the application already stored (US-112).
 */
export async function updateTelemetryPolicy(
  database: TelemetryPolicyDatabase,
  { applicationId, userId, enabled, retentionDays }: UpdateTelemetryPolicyInput,
): Promise<UpdateTelemetryPolicyResult> {
  const changes = {
    ...(enabled === undefined ? {} : { enabled }),
    ...(retentionDays === undefined ? {} : { retentionDays }),
  };
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const saved = (await upsertApplicationSetting(
        tx,
        applicationTelemetryPolicy,
        {
          applicationId: application.id,
          ...DEFAULT_TELEMETRY_POLICY,
          ...changes,
          updatedById: userId,
        },
        applicationTelemetryPolicy.applicationId,
        { ...changes, updatedById: userId, updatedAt: new Date() },
      )) as TelemetryPolicyRow | undefined;

      if (!saved) throw new Error("Telemetry policy update returned no record");
      if (retentionDays !== undefined) {
        await applyTraceRetention(tx as unknown as Pick<SdkTraceDatabase, "update">, {
          applicationId: application.id,
          retentionDays,
        });
      }
      return toTelemetryPolicy(saved);
    },
  );

  if (result.ok === false) return result;
  return { ok: true, policy: result.value };
}
