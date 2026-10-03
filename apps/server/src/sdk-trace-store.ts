import { createHash } from "node:crypto";
import {
  type ApplicationTraceRecord,
  type ApplicationTraceSummary,
  applicationTraceRecordSchema,
  applicationTraceSummarySchema,
} from "@ayni/api/application-traces";
import type { SdkWorkflowTrace } from "@ayni/api/sdk-trace";
import type * as schema from "@ayni/db/schema/index";
import { sdkTrace } from "@ayni/db/schema/index";
import { and, desc, eq, gt, lt, lte, or, sql } from "drizzle-orm";
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
  }: { applicationId: string; trace: SdkWorkflowTrace; retentionDays: 7 | 30 | 90 },
): Promise<StoreSdkTraceResult> {
  const now = new Date();
  const contentSha256 = createHash("sha256").update(canonicalJson(trace)).digest("hex");

  // ponytail: purge expired rows on ingestion; add scheduled cleanup if idle applications need timed physical deletion.
  await database.delete(sdkTrace).where(lte(sdkTrace.expiresAt, now));

  const [inserted] = await database
    .insert(sdkTrace)
    .values({
      applicationId,
      traceId: trace.traceId,
      contentSha256,
      trace,
      source: "clientReported",
      receivedAt: now,
      expiresAt: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000),
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
