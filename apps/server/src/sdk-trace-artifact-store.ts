import { createHash, randomUUID } from "node:crypto";
import {
  SDK_TRACE_ARTIFACT_MAX_BYTES,
  SDK_TRACE_ARTIFACT_UPLOAD_URL_TTL_SECONDS,
  type SdkTraceArtifactMetadata,
  type SdkTraceArtifactUploadRequest,
  sdkTraceArtifactMetadataSchema,
} from "@ayni/api/sdk-trace-artifact";
import type * as schema from "@ayni/db/schema/index";
import { sdkTrace, sdkTraceArtifact } from "@ayni/db/schema/index";
import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type SdkTraceArtifactDatabase = PostgresJsDatabase<typeof schema>;

export type SdkTraceArtifactStorage = {
  createUploadUrl(key: string, contentLength: number, expiresIn: number): Promise<string>;
  downloadFile(key: string): Promise<{
    body: ReadableStream<Uint8Array> | null;
    contentLength?: number;
    etag?: string;
  }>;
  copyFile(sourceKey: string, destinationKey: string, sourceETag: string): Promise<void>;
  getArtifact(key: string): Promise<{
    body: ReadableStream<Uint8Array> | null;
    contentLength?: number;
  }>;
  removeArtifact(key: string): Promise<void>;
};

export type SdkTraceArtifactReader = {
  listCompletedArtifacts(
    applicationId: string,
    traceIds: string[],
  ): Promise<Map<string, SdkTraceArtifactMetadata[]>>;
};

type ArtifactRow = typeof sdkTraceArtifact.$inferSelect;

type UploadIntentResult =
  | {
      ok: true;
      artifactId: string;
      uploadUrl: string;
      uploadUrlExpiresAt: string;
      requiredHeaders: { "Content-Type": "application/octet-stream"; "Content-Length": string };
    }
  | { ok: false; reason: "traceNotFound" };

export type CompleteSdkTraceArtifactResult =
  | { ok: true; artifact: SdkTraceArtifactMetadata }
  | {
      ok: false;
      reason:
        | "artifactNotFound"
        | "uploadInProgress"
        | "traceNotFound"
        | "uploadExpired"
        | "invalidContent"
        | "sourceChanged"
        | "telemetryDisabled";
    };

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toMetadata(row: ArtifactRow): SdkTraceArtifactMetadata | undefined {
  if (
    row.status !== "completed" ||
    row.format !== "perfetto_trace_proto" ||
    !row.storageKey ||
    !row.completedAt
  ) {
    return;
  }
  const parsed = sdkTraceArtifactMetadataSchema.safeParse({
    artifactId: row.id,
    format: row.format,
    byteLength: row.byteLength,
    sha256: row.sha256.toLowerCase(),
    logicalName: row.logicalName,
    producerTool: row.producerTool,
    producerVersion: row.producerVersion,
    createdAt: iso(row.createdAt),
    completedAt: iso(row.completedAt),
  });
  return parsed.success ? parsed.data : undefined;
}

function stagingKey(applicationId: string, traceId: string, artifactId: string) {
  return `applications/${applicationId}/traces/${traceId}/artifacts/${artifactId}/staging`;
}

function immutableKey(applicationId: string, traceId: string, artifactId: string) {
  return `applications/${applicationId}/traces/${traceId}/artifacts/${artifactId}/perfetto-trace.bin`;
}

class InvalidArtifactContentError extends Error {}

/** Validates a protobuf message without buffering length-delimited fields. */
class TracePacketProtoValidator {
  private state: "tag" | "value" | "length" | "skip" = "tag";
  private varint = 0n;
  private varintBytes = 0;
  private fieldNumber = 0;
  private skipRemaining = 0;
  private bytesConsumed = 0;
  private readonly groupFieldNumbers: number[] = [];

  constructor(private readonly byteLength: number) {}

  feed(bytes: Uint8Array) {
    let index = 0;
    while (index < bytes.length) {
      if (this.state === "skip") {
        const skipped = Math.min(this.skipRemaining, bytes.length - index);
        this.skipRemaining -= skipped;
        this.bytesConsumed += skipped;
        index += skipped;
        if (this.skipRemaining === 0) this.state = "tag";
        continue;
      }
      if (this.bytesConsumed >= this.byteLength) throw new InvalidArtifactContentError();

      const byte = bytes[index];
      if (byte === undefined) throw new InvalidArtifactContentError();
      index += 1;
      this.bytesConsumed += 1;
      this.varintBytes += 1;
      if (this.varintBytes > 10 || (this.varintBytes === 10 && (byte & 0xfe) !== 0)) {
        throw new InvalidArtifactContentError();
      }
      this.varint |= BigInt(byte & 0x7f) << BigInt((this.varintBytes - 1) * 7);
      if ((byte & 0x80) !== 0) continue;

      const value = this.varint;
      const completedState = this.state;
      this.varint = 0n;
      this.varintBytes = 0;
      if (completedState === "tag") this.readTag(value);
      else if (completedState === "length") this.readLength(value);
      else this.state = "tag";
    }
  }

  get isComplete() {
    return (
      this.bytesConsumed === this.byteLength &&
      this.state === "tag" &&
      this.varintBytes === 0 &&
      this.groupFieldNumbers.length === 0
    );
  }

  private readTag(tag: bigint) {
    if (tag === 0n || tag > 0xffff_ffffn) throw new InvalidArtifactContentError();
    this.fieldNumber = Number(tag >> 3n);
    if (this.fieldNumber === 0) throw new InvalidArtifactContentError();

    switch (Number(tag & 7n)) {
      case 0:
        this.state = "value";
        break;
      case 1:
        this.skip(8);
        break;
      case 2:
        this.state = "length";
        break;
      case 3:
        if (this.groupFieldNumbers.length >= 100) throw new InvalidArtifactContentError();
        this.groupFieldNumbers.push(this.fieldNumber);
        break;
      case 4:
        if (this.groupFieldNumbers.pop() !== this.fieldNumber)
          throw new InvalidArtifactContentError();
        break;
      case 5:
        this.skip(4);
        break;
      default:
        throw new InvalidArtifactContentError();
    }
  }

  private readLength(length: bigint) {
    const remaining = BigInt(this.byteLength - this.bytesConsumed);
    if (length > remaining || length > BigInt(Number.MAX_SAFE_INTEGER))
      throw new InvalidArtifactContentError();
    this.skip(Number(length));
  }

  private skip(length: number) {
    const remaining = this.byteLength - this.bytesConsumed;
    if (length > remaining) throw new InvalidArtifactContentError();
    this.skipRemaining = length;
    this.state = length > 0 ? "skip" : "tag";
  }
}

/** Checks the outer Perfetto Trace protobuf stream and every packet body. */
class PerfettoTraceProtoSniffer {
  private state: "tag" | "length" | "body" = "tag";
  private varint = 0;
  private shift = 0;
  private bodyRemaining = 0;
  private packetCount = 0;
  private packetValidator: TracePacketProtoValidator | undefined;

  feed(bytes: Uint8Array) {
    let index = 0;
    while (index < bytes.length) {
      if (this.state === "body") {
        const skipped = Math.min(this.bodyRemaining, bytes.length - index);
        const packetValidator = this.packetValidator;
        if (!packetValidator) throw new InvalidArtifactContentError();
        packetValidator.feed(bytes.subarray(index, index + skipped));
        this.bodyRemaining -= skipped;
        index += skipped;
        if (this.bodyRemaining === 0) {
          if (!packetValidator.isComplete) throw new InvalidArtifactContentError();
          this.packetValidator = undefined;
          this.state = "tag";
        }
        continue;
      }

      const byte = bytes[index];
      if (byte === undefined) throw new InvalidArtifactContentError();
      index += 1;
      if (this.state === "tag") {
        if (byte !== 0x0a) throw new InvalidArtifactContentError();
        this.state = "length";
        this.varint = 0;
        this.shift = 0;
        continue;
      }

      const part = byte & 0x7f;
      if (this.shift >= 35 || (this.shift === 28 && part > 0x0f))
        throw new InvalidArtifactContentError();
      this.varint += part * 2 ** this.shift;
      if ((byte & 0x80) !== 0) {
        this.shift += 7;
        continue;
      }
      if (
        this.varint <= 0 ||
        this.varint > SDK_TRACE_ARTIFACT_MAX_BYTES ||
        !Number.isSafeInteger(this.varint)
      ) {
        throw new InvalidArtifactContentError();
      }
      this.packetCount += 1;
      this.bodyRemaining = this.varint;
      this.packetValidator = new TracePacketProtoValidator(this.varint);
      this.state = "body";
    }
  }

  get isComplete() {
    return this.packetCount > 0 && this.state === "tag" && this.bodyRemaining === 0;
  }
}

async function verifyStagedArtifact(
  storage: SdkTraceArtifactStorage,
  key: string,
  expected: Pick<SdkTraceArtifactUploadRequest, "byteLength" | "sha256">,
) {
  const object = await storage.downloadFile(key);
  if (!object.body || object.contentLength !== expected.byteLength || !object.etag)
    throw new InvalidArtifactContentError();

  const reader = object.body.getReader();
  const hash = createHash("sha256");
  const sniffer = new PerfettoTraceProtoSniffer();
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > expected.byteLength || byteLength > SDK_TRACE_ARTIFACT_MAX_BYTES)
        throw new InvalidArtifactContentError();
      hash.update(value);
      sniffer.feed(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (
    byteLength !== expected.byteLength ||
    hash.digest("hex") !== expected.sha256.toLowerCase() ||
    !sniffer.isComplete
  ) {
    throw new InvalidArtifactContentError();
  }
  return object.etag;
}

async function traceIsLive(
  database: SdkTraceArtifactDatabase,
  applicationId: string,
  traceId: string,
  now = new Date(),
) {
  const [row] = await database
    .select({ traceId: sdkTrace.traceId })
    .from(sdkTrace)
    .where(
      and(
        eq(sdkTrace.applicationId, applicationId),
        eq(sdkTrace.traceId, traceId),
        gt(sdkTrace.expiresAt, now),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export function createSdkTraceArtifactStore(
  database: SdkTraceArtifactDatabase,
  storage: SdkTraceArtifactStorage,
) {
  return {
    async createUploadIntent(input: {
      applicationId: string;
      traceId: string;
      artifact: SdkTraceArtifactUploadRequest;
    }): Promise<UploadIntentResult> {
      const now = new Date();
      if (!(await traceIsLive(database, input.applicationId, input.traceId, now)))
        return { ok: false, reason: "traceNotFound" };

      const artifactId = randomUUID();
      const key = stagingKey(input.applicationId, input.traceId, artifactId);
      const uploadUrlExpiresAt = new Date(
        now.getTime() + SDK_TRACE_ARTIFACT_UPLOAD_URL_TTL_SECONDS * 1000,
      );
      await database.insert(sdkTraceArtifact).values({
        id: artifactId,
        applicationId: input.applicationId,
        traceId: input.traceId,
        logicalName: input.artifact.logicalName,
        producerTool: input.artifact.producerTool ?? null,
        producerVersion: input.artifact.producerVersion ?? null,
        byteLength: input.artifact.byteLength,
        sha256: input.artifact.sha256.toLowerCase(),
        stagingStorageKey: key,
        uploadExpiresAt: uploadUrlExpiresAt,
      });
      try {
        const uploadUrl = await storage.createUploadUrl(
          key,
          input.artifact.byteLength,
          SDK_TRACE_ARTIFACT_UPLOAD_URL_TTL_SECONDS,
        );
        return {
          ok: true,
          artifactId,
          uploadUrl,
          uploadUrlExpiresAt: uploadUrlExpiresAt.toISOString(),
          requiredHeaders: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(input.artifact.byteLength),
          },
        };
      } catch (error) {
        await database.delete(sdkTraceArtifact).where(eq(sdkTraceArtifact.id, artifactId));
        throw error;
      }
    },

    async complete(
      input: { applicationId: string; traceId: string; artifactId: string },
      isTelemetryEnabled: () => Promise<boolean>,
    ): Promise<CompleteSdkTraceArtifactResult> {
      const now = new Date();
      if (!(await traceIsLive(database, input.applicationId, input.traceId, now)))
        return { ok: false, reason: "traceNotFound" };
      if (!(await isTelemetryEnabled())) return { ok: false, reason: "telemetryDisabled" };

      const [row] = await database
        .select()
        .from(sdkTraceArtifact)
        .where(
          and(
            eq(sdkTraceArtifact.id, input.artifactId),
            eq(sdkTraceArtifact.applicationId, input.applicationId),
            eq(sdkTraceArtifact.traceId, input.traceId),
          ),
        )
        .limit(1);
      if (!row) return { ok: false, reason: "artifactNotFound" };
      if (row.status === "completed") {
        const artifact = toMetadata(row);
        return artifact ? { ok: true, artifact } : { ok: false, reason: "artifactNotFound" };
      }
      if (row.status === "verifying") return { ok: false, reason: "uploadInProgress" };
      if (row.uploadExpiresAt <= now) return { ok: false, reason: "uploadExpired" };
      if (!row.stagingStorageKey) return { ok: false, reason: "artifactNotFound" };

      const [claimed] = await database
        .update(sdkTraceArtifact)
        .set({ status: "verifying" })
        .where(and(eq(sdkTraceArtifact.id, row.id), eq(sdkTraceArtifact.status, "pending")))
        .returning();
      if (!claimed) {
        const [latest] = await database
          .select()
          .from(sdkTraceArtifact)
          .where(eq(sdkTraceArtifact.id, row.id))
          .limit(1);
        const artifact = latest && toMetadata(latest);
        if (artifact) return { ok: true, artifact };
        return latest?.status === "verifying"
          ? { ok: false, reason: "uploadInProgress" }
          : { ok: false, reason: "artifactNotFound" };
      }
      const stagingStorageKey = claimed.stagingStorageKey;
      if (!stagingStorageKey) {
        await database
          .update(sdkTraceArtifact)
          .set({ status: "pending" })
          .where(and(eq(sdkTraceArtifact.id, row.id), eq(sdkTraceArtifact.status, "verifying")));
        return { ok: false, reason: "artifactNotFound" };
      }

      const expected = { byteLength: row.byteLength, sha256: row.sha256 };
      try {
        let sourceETag: string;
        try {
          sourceETag = await verifyStagedArtifact(storage, stagingStorageKey, expected);
        } catch (error) {
          if (!(error instanceof InvalidArtifactContentError)) throw error;
          await storage.removeArtifact(stagingStorageKey);
          await database
            .update(sdkTraceArtifact)
            .set({ status: "pending" })
            .where(and(eq(sdkTraceArtifact.id, row.id), eq(sdkTraceArtifact.status, "verifying")));
          return { ok: false, reason: "invalidContent" };
        }

        if (!(await isTelemetryEnabled())) {
          await storage.removeArtifact(stagingStorageKey);
          await database
            .update(sdkTraceArtifact)
            .set({ status: "pending" })
            .where(and(eq(sdkTraceArtifact.id, row.id), eq(sdkTraceArtifact.status, "verifying")));
          return { ok: false, reason: "telemetryDisabled" };
        }

        const finalKey = immutableKey(input.applicationId, input.traceId, input.artifactId);
        try {
          await storage.copyFile(stagingStorageKey, finalKey, sourceETag);
        } catch (error) {
          if (typeof error === "object" && error !== null) {
            const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
            if (
              candidate.name === "PreconditionFailed" ||
              candidate.$metadata?.httpStatusCode === 412
            ) {
              await database
                .update(sdkTraceArtifact)
                .set({ status: "pending" })
                .where(
                  and(eq(sdkTraceArtifact.id, row.id), eq(sdkTraceArtifact.status, "verifying")),
                );
              return { ok: false, reason: "sourceChanged" };
            }
          }
          throw error;
        }

        // Confirm the server-owned copy too; the source ETag condition protects
        // the copy operation, and this SHA check remains authoritative.
        try {
          await verifyStagedArtifact(storage, finalKey, expected);
        } catch (error) {
          if (!(error instanceof InvalidArtifactContentError)) throw error;
          await storage.removeArtifact(finalKey);
          await database
            .update(sdkTraceArtifact)
            .set({ status: "pending" })
            .where(and(eq(sdkTraceArtifact.id, row.id), eq(sdkTraceArtifact.status, "verifying")));
          return { ok: false, reason: "sourceChanged" };
        }

        // Recheck the policy immediately before committing the immutable reference.
        if (!(await isTelemetryEnabled())) {
          await storage.removeArtifact(finalKey);
          await storage.removeArtifact(stagingStorageKey);
          await database
            .update(sdkTraceArtifact)
            .set({ status: "pending" })
            .where(and(eq(sdkTraceArtifact.id, row.id), eq(sdkTraceArtifact.status, "verifying")));
          return { ok: false, reason: "telemetryDisabled" };
        }

        const completedAt = new Date();
        const [completed] = await database
          .update(sdkTraceArtifact)
          .set({
            status: "completed",
            format: "perfetto_trace_proto",
            storageKey: finalKey,
            completedAt,
          })
          .where(
            and(
              eq(sdkTraceArtifact.id, row.id),
              eq(sdkTraceArtifact.status, "verifying"),
              gt(sdkTraceArtifact.uploadExpiresAt, completedAt),
              sql`exists (
                select 1 from ${sdkTrace}
                where ${sdkTrace.applicationId} = ${input.applicationId}
                  and ${sdkTrace.traceId} = ${input.traceId}
                  and ${sdkTrace.expiresAt} > ${completedAt}
              )`,
            ),
          )
          .returning();
        if (!completed) {
          const [latest] = await database
            .select()
            .from(sdkTraceArtifact)
            .where(eq(sdkTraceArtifact.id, row.id))
            .limit(1);
          const existing = latest && toMetadata(latest);
          if (existing) return { ok: true, artifact: existing };
          await storage.removeArtifact(finalKey);
          await storage.removeArtifact(stagingStorageKey);
          if (latest)
            await database.delete(sdkTraceArtifact).where(eq(sdkTraceArtifact.id, row.id));
          return { ok: false, reason: "traceNotFound" };
        }
        try {
          await storage.removeArtifact(stagingStorageKey);
        } catch {
          // The expiring staging key remains in the row for the retention job to remove.
        }
        const artifact = toMetadata(completed);
        return artifact ? { ok: true, artifact } : { ok: false, reason: "artifactNotFound" };
      } catch (error) {
        await database
          .update(sdkTraceArtifact)
          .set({ status: "pending" })
          .where(and(eq(sdkTraceArtifact.id, row.id), eq(sdkTraceArtifact.status, "verifying")));
        throw error;
      }
    },

    async getCompletedArtifact(applicationId: string, traceId: string, artifactId: string) {
      const [row] = await database
        .select()
        .from(sdkTraceArtifact)
        .innerJoin(
          sdkTrace,
          and(
            eq(sdkTraceArtifact.applicationId, sdkTrace.applicationId),
            eq(sdkTraceArtifact.traceId, sdkTrace.traceId),
          ),
        )
        .where(
          and(
            eq(sdkTraceArtifact.id, artifactId),
            eq(sdkTraceArtifact.applicationId, applicationId),
            eq(sdkTraceArtifact.traceId, traceId),
            eq(sdkTraceArtifact.status, "completed"),
            gt(sdkTrace.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!row?.sdk_trace_artifact.storageKey) return;
      const artifact = toMetadata(row.sdk_trace_artifact);
      if (!artifact) return;
      const object = await storage.getArtifact(row.sdk_trace_artifact.storageKey);
      if (!object.body) return;
      return { artifact, body: object.body, contentLength: object.contentLength };
    },

    async listCompletedArtifacts(applicationId: string, traceIds: string[]) {
      if (traceIds.length === 0) return new Map<string, SdkTraceArtifactMetadata[]>();
      const rows = await database
        .select({ artifact: sdkTraceArtifact })
        .from(sdkTraceArtifact)
        .innerJoin(
          sdkTrace,
          and(
            eq(sdkTraceArtifact.applicationId, sdkTrace.applicationId),
            eq(sdkTraceArtifact.traceId, sdkTrace.traceId),
          ),
        )
        .where(
          and(
            eq(sdkTraceArtifact.applicationId, applicationId),
            inArray(sdkTraceArtifact.traceId, traceIds),
            eq(sdkTraceArtifact.status, "completed"),
            gt(sdkTrace.expiresAt, new Date()),
          ),
        );
      const result = new Map<string, SdkTraceArtifactMetadata[]>();
      for (const { artifact: row } of rows) {
        const artifact = toMetadata(row);
        if (!artifact) continue;
        result.set(row.traceId, [...(result.get(row.traceId) ?? []), artifact]);
      }
      return result;
    },

    async purgeExpired(now = new Date()) {
      const rows = await database
        .select({
          id: sdkTraceArtifact.id,
          applicationId: sdkTraceArtifact.applicationId,
          traceId: sdkTraceArtifact.traceId,
          status: sdkTraceArtifact.status,
          uploadExpiresAt: sdkTraceArtifact.uploadExpiresAt,
          storageKey: sdkTraceArtifact.storageKey,
          stagingStorageKey: sdkTraceArtifact.stagingStorageKey,
          traceExpiresAt: sdkTrace.expiresAt,
        })
        .from(sdkTraceArtifact)
        .innerJoin(
          sdkTrace,
          and(
            eq(sdkTraceArtifact.applicationId, sdkTrace.applicationId),
            eq(sdkTraceArtifact.traceId, sdkTrace.traceId),
          ),
        )
        .where(or(lte(sdkTrace.expiresAt, now), lte(sdkTraceArtifact.uploadExpiresAt, now)));

      const expiredArtifactIds: string[] = [];
      for (const row of rows) {
        const expiredTrace = row.traceExpiresAt <= now;
        const expiredUpload = row.uploadExpiresAt <= now;
        if (!expiredTrace && !expiredUpload) continue;
        if (expiredTrace || row.status !== "completed") expiredArtifactIds.push(row.id);
        const keys = [
          row.stagingStorageKey,
          ...(expiredTrace ? [row.storageKey] : []),
          ...(!expiredTrace && row.status !== "completed"
            ? [immutableKey(row.applicationId, row.traceId, row.id)]
            : []),
        ].filter((key): key is string => Boolean(key));
        for (let offset = 0; offset < keys.length; offset += 50)
          await Promise.all(
            keys.slice(offset, offset + 50).map((key) => storage.removeArtifact(key)),
          );
        if (!expiredTrace && row.status === "completed" && row.stagingStorageKey) {
          await database
            .update(sdkTraceArtifact)
            .set({ stagingStorageKey: null })
            .where(eq(sdkTraceArtifact.id, row.id));
        }
      }

      if (expiredArtifactIds.length > 0)
        await database
          .delete(sdkTraceArtifact)
          .where(inArray(sdkTraceArtifact.id, expiredArtifactIds));
      const deletedTraces = await database.delete(sdkTrace).where(lte(sdkTrace.expiresAt, now));
      return {
        deletedTraces: deletedTraces.count,
        deletedArtifacts: expiredArtifactIds.length,
        deletedPendingUploads: rows.filter(
          (row) =>
            row.status !== "completed" && row.uploadExpiresAt <= now && row.traceExpiresAt > now,
        ).length,
      };
    },
  };
}
