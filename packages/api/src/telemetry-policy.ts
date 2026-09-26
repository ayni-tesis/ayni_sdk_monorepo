/**
 * The telemetry policy of an application, shared by the server and the
 * dashboard. It only enables technical telemetry and sets how long traces are
 * kept: no field authorizes collecting images or raw inputs.
 */

/** The retention periods an administrator may choose, in days. */
export const TELEMETRY_RETENTION_DAYS = [7, 30, 90] as const;

export type TelemetryRetentionDays = (typeof TELEMETRY_RETENTION_DAYS)[number];

export type TelemetryPolicySettings = {
  enabled: boolean;
  retentionDays: TelemetryRetentionDays;
};

/** The policy of an application that never saved one: telemetry stays off. */
export const DEFAULT_TELEMETRY_POLICY: TelemetryPolicySettings = {
  enabled: false,
  retentionDays: 30,
};

export function isTelemetryRetentionDays(value: unknown): value is TelemetryRetentionDays {
  return TELEMETRY_RETENTION_DAYS.some((days) => days === value);
}
