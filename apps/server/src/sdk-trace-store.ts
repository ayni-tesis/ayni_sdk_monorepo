import { createHash } from "node:crypto";
import {
  type ApplicationTraceRecord,
  type ApplicationTraceSummary,
  applicationTraceRecordSchema,
  applicationTraceSummarySchema,
} from "@ayni/api/application-traces";
import type { SdkWorkflowTrace } from "@ayni/api/sdk-trace";
import type { TelemetryRetentionDays } from "@ayni/api/telemetry-policy";
import type * as schema from "@ayni/db/schema/index";
import { applicationTelemetryPolicy, sdkTrace } from "@ayni/db/schema/index";
import { and, desc, eq, gt, lt, lte, ne, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

export type SdkTraceDatabase = PostgresJsDatabase<typeof schema>;

export type StoreSdkTraceResult =
  | { ok: true; traceId: string; receivedAt: string }
  | { ok: false; reason: "conflict" };

export type ApplicationTracePage = {
  traces: ApplicationTraceSummary[];
  nextCursor: string | null;
};

export type ApplicationTraceRecordPage = {
  records: ApplicationTraceRecord[];
  nextCursor: string | null;
};

export class InvalidApplicationTraceCursorError extends Error {
  constructor() {
    super("Invalid application trace cursor");
  }
}

const traceCursorSchema = z.strictObject({
  receivedAt: z.iso.datetime(),
  traceId: z.uuid(),
});

function encodeCursor(row: { receivedAt: Date | string; traceId: string }): string {
  return Buffer.from(
    JSON.stringify({ receivedAt: iso(row.receivedAt), traceId: row.traceId }),
  ).toString("base64url");
}

function decodeCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded).toString("base64url") !== value) throw new Error();
    const parsed = traceCursorSchema.safeParse(JSON.parse(decoded));
    if (!parsed.success) throw new Error();
    return parsed.data;
  } catch {
    throw new InvalidApplicationTraceCursorError();
  }
}

function applicationTracePageFilter(applicationId: string, cursorValue: string | undefined) {
  const cursor = decodeCursor(cursorValue);
  const cursorTime = cursor ? new Date(cursor.receivedAt) : undefined;
  const afterCursor =
    cursor && cursorTime
      ? or(
          lt(sdkTrace.receivedAt, cursorTime),
          and(eq(sdkTrace.receivedAt, cursorTime), lt(sdkTrace.traceId, cursor.traceId)),
        )
      : undefined;

  return and(
    eq(sdkTrace.applicationId, applicationId),
    gt(sdkTrace.expiresAt, new Date()),
    afterCursor,
  );
}

function tracePage<T extends { receivedAt: Date | string; traceId: string }>(
  rows: T[],
  limit: number,
) {
  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows.at(-1);
  return {
    pageRows,
    nextCursor: rows.length > limit && lastRow ? encodeCursor(lastRow) : null,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function storeSdkTrace(
  database: SdkTraceDatabase,
  {
    applicationId,
    trace,
    retentionDays,
  }: { applicationId: string; trace: SdkWorkflowTrace; retentionDays: TelemetryRetentionDays },
): Promise<StoreSdkTraceResult> {
  const now = new Date();
  const contentSha256 = createHash("sha256").update(canonicalJson(trace)).digest("hex");

  // The daily retention task (US-112) also purges applications that stop sending traces.
  await purgeExpiredSdkTraces(database, now);

  const [inserted] = await database
    .insert(sdkTrace)
    .values({
      applicationId,
      traceId: trace.traceId,
      contentSha256,
      trace,
      source: "clientReported",
      receivedAt: now,
      // Read again from the policy row, locked FOR SHARE: a retention change
      // saved while this request was in flight either commits first and sets
      // this period, or waits for this insert and then recomputes it (US-112).
      expiresAt: sql`${now.toISOString()}::timestamp + make_interval(days => coalesce((select ${applicationTelemetryPolicy.retentionDays} from ${applicationTelemetryPolicy} where ${eq(applicationTelemetryPolicy.applicationId, applicationId)} for share), ${retentionDays})::integer)`,
    })
    .onConflictDoNothing()
    .returning({ receivedAt: sdkTrace.receivedAt });

  if (inserted) {
    return { ok: true, traceId: trace.traceId, receivedAt: iso(inserted.receivedAt) };
  }

  const [existing] = await database
    .select({ contentSha256: sdkTrace.contentSha256, receivedAt: sdkTrace.receivedAt })
    .from(sdkTrace)
    .where(and(eq(sdkTrace.applicationId, applicationId), eq(sdkTrace.traceId, trace.traceId)))
    .limit(1);

  if (!existing || existing.contentSha256 !== contentSha256)
    return { ok: false, reason: "conflict" };
  return { ok: true, traceId: trace.traceId, receivedAt: iso(existing.receivedAt) };
}

/**
 * Deletes every trace whose expiry has passed, of any application (US-112).
 * Queries already hide them; this removes them from the database. Deleting the
 * same expired rows twice is harmless, so a repeated scheduled run is safe.
 */
export async function purgeExpiredSdkTraces(
  database: Pick<SdkTraceDatabase, "delete">,
  now = new Date(),
): Promise<{ deletedTraces: number }> {
  const deleted = await database.delete(sdkTrace).where(lte(sdkTrace.expiresAt, now));
  return { deletedTraces: deleted.count };
}

/**
 * Sets the expiry of the application's live traces to their server receipt plus
 * the new retention period (US-112). Traces that already expired stay expired:
 * a longer period never brings them back. Rows that already have that expiry,
 * such as all of them when the period did not change, are not rewritten.
 */
export async function applyTraceRetention(
  database: Pick<SdkTraceDatabase, "update">,
  {
    applicationId,
    retentionDays,
    now = new Date(),
  }: { applicationId: string; retentionDays: TelemetryRetentionDays; now?: Date },
): Promise<void> {
  const expiresAt = sql`${sdkTrace.receivedAt} + make_interval(days => ${retentionDays}::integer)`;
  await database
    .update(sdkTrace)
    .set({ expiresAt })
    .where(
      and(
        eq(sdkTrace.applicationId, applicationId),
        gt(sdkTrace.expiresAt, now),
        ne(sdkTrace.expiresAt, expiresAt),
      ),
    );
}

export async function listApplicationTraceSummaries(
  database: SdkTraceDatabase,
  {
    applicationId,
    cursor: cursorValue,
    limit,
  }: { applicationId: string; cursor?: string; limit: number },
): Promise<ApplicationTracePage> {
  const rows = await database
    .select({
      source: sdkTrace.source,
      receivedAt: sdkTrace.receivedAt,
      traceId: sdkTrace.traceId,
      timestamp: sql<string>`${sdkTrace.trace} ->> 'timestamp'`,
      workflowId: sql<string>`${sdkTrace.trace} ->> 'workflowId'`,
      workflowVersionId: sql<string>`${sdkTrace.trace} ->> 'workflowVersionId'`,
      workflowVersion: sql<string>`${sdkTrace.trace} ->> 'workflowVersion'`,
      status: sql<string>`${sdkTrace.trace} ->> 'status'`,
      durationMs: sql<number>`${sdkTrace.trace} -> 'durationMs'`,
      models: sql<Array<{ version?: string }>>`${sdkTrace.trace} -> 'models'`,
      profile: sql<Record<string, unknown>>`${sdkTrace.trace} -> 'profile'`,
    })
    .from(sdkTrace)
    .where(applicationTracePageFilter(applicationId, cursorValue))
    .orderBy(desc(sdkTrace.receivedAt), desc(sdkTrace.traceId))
    .limit(limit + 1);

  const { pageRows, nextCursor } = tracePage(rows, limit);
  const traces = pageRows.flatMap((row) => {
    const parsed = applicationTraceSummarySchema.safeParse({
      source: row.source,
      receivedAt: iso(row.receivedAt),
      trace: {
        traceId: row.traceId,
        timestamp: row.timestamp,
        workflowId: row.workflowId,
        workflowVersionId: row.workflowVersionId,
        workflowVersion: row.workflowVersion,
        status: row.status,
        durationMs: row.durationMs,
        models: Array.isArray(row.models)
          ? row.models.map((model) => ({ version: model.version }))
          : [],
        profile: row.profile,
      },
    });
    return parsed.success ? [parsed.data] : [];
  });
  return { traces, nextCursor };
}

export async function getApplicationTrace(
  database: SdkTraceDatabase,
  applicationId: string,
  traceId: string,
): Promise<ApplicationTraceRecord | undefined> {
  const [row] = await database
    .select({
      source: sdkTrace.source,
      receivedAt: sdkTrace.receivedAt,
      expiresAt: sdkTrace.expiresAt,
      trace: sdkTrace.trace,
    })
    .from(sdkTrace)
    .where(
      and(
        eq(sdkTrace.applicationId, applicationId),
        eq(sdkTrace.traceId, traceId),
        gt(sdkTrace.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return;

  const parsed = applicationTraceRecordSchema.safeParse({
    source: row.source,
    receivedAt: iso(row.receivedAt),
    expiresAt: iso(row.expiresAt),
    trace: row.trace,
  });
  return parsed.success ? parsed.data : undefined;
}

export async function listApplicationTraceRecords(
  database: SdkTraceDatabase,
  {
    applicationId,
    cursor: cursorValue,
    limit,
  }: { applicationId: string; cursor?: string; limit: number },
): Promise<ApplicationTraceRecordPage> {
  const rows = await database
    .select({
      source: sdkTrace.source,
      receivedAt: sdkTrace.receivedAt,
      expiresAt: sdkTrace.expiresAt,
      traceId: sdkTrace.traceId,
      trace: sdkTrace.trace,
    })
    .from(sdkTrace)
    .where(applicationTracePageFilter(applicationId, cursorValue))
    .orderBy(desc(sdkTrace.receivedAt), desc(sdkTrace.traceId))
    .limit(limit + 1);

  const { pageRows, nextCursor } = tracePage(rows, limit);
  const records = pageRows.flatMap((row) => {
    const parsed = applicationTraceRecordSchema.safeParse({
      source: row.source,
      receivedAt: iso(row.receivedAt),
      expiresAt: iso(row.expiresAt),
      trace: row.trace,
    });
    return parsed.success ? [parsed.data] : [];
  });
  return { records, nextCursor };
}
