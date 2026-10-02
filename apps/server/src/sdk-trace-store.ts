import { createHash } from "node:crypto";
import type { SdkWorkflowTrace } from "@ayni/api/sdk-trace";
import type * as schema from "@ayni/db/schema/index";
import { sdkTrace } from "@ayni/db/schema/index";
import { and, eq, lte } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type SdkTraceDatabase = PostgresJsDatabase<typeof schema>;

export type StoreSdkTraceResult =
  | { ok: true; traceId: string; receivedAt: string }
  | { ok: false; reason: "conflict" };

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
