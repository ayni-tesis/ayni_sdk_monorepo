import { createHash } from "node:crypto";
import { EVIDENCE_UPLOAD_URL_TTL_SECONDS, type SdkEvidence } from "@ayni/api/sdk-evidence";
import type * as schema from "@ayni/db/schema/index";
import { model, modelVersion, sdkEvidence, workflow, workflowVersion } from "@ayni/db/schema/index";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { readJpegSize } from "./jpeg-size";
import type { CompleteSdkEvidenceResult, StartSdkEvidenceResult } from "./sdk-evidence";
import { canonicalJson } from "./sdk-trace-store";

/** One row of `sdk_evidence`, as the service writes and reads it. */
export type SdkEvidenceRow = {
  applicationId: string;
  evidenceId: string;
  workflowId: string;
  workflowVersionId: string;
  captureNodeId: string;
  modelId: string;
  modelVersionId: string;
  modelVersion: string;
  modelSha256: string;
  taskType: "classification" | "detection";
  result: Record<string, unknown>;
  capturedAt: Date;
  imageMediaType: string;
  imageWidth: number;
  imageHeight: number;
  imageByteSize: number;
  imageSha256: string;
  maxImageSize: number;
  imageQuality: number;
  storageKey: string;
  contentSha256: string;
  status: "awaitingUpload" | "received";
  receivedAt: Date | null;
};

/** The queries the evidence service needs, each limited to one application. */
export type SdkEvidenceRepository = {
  /** The workflow version `id` when its workflow belongs to `applicationId`. */
  findWorkflowVersion(
    applicationId: string,
    id: string,
  ): Promise<{ workflowId: string; version: string; definition: unknown } | null>;
  /** The model version `id` when its model belongs to `applicationId`. */
  findModelVersion(
    applicationId: string,
    id: string,
  ): Promise<{ modelId: string; version: string; sha256: string; contract: unknown } | null>;
  /** Inserts `row` unless its evidence ID exists in its application; whether it did. */
  insert(row: SdkEvidenceRow): Promise<boolean>;
  find(applicationId: string, evidenceId: string): Promise<SdkEvidenceRow | null>;
  /** Marks an evidence still awaiting its image as received; `null` when it was not. */
  markReceived(applicationId: string, evidenceId: string, receivedAt: Date): Promise<Date | null>;
};

/** Where evidence images live: a staging key the SDK uploads to and a final one. */
export type EvidenceStorage = {
  createUploadUrl(key: string, expiresIn: number): Promise<string>;
  /** The size of the object at `key`, or `null` when there is none. */
  getSize(key: string): Promise<number | null>;
  read(key: string): Promise<Uint8Array>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
};

export function evidenceStagingKey(applicationId: string, evidenceId: string) {
  return `staging/${applicationId}/evidence/${evidenceId}.jpg`;
}

export function evidenceStorageKey(applicationId: string, evidenceId: string) {
  return `applications/${applicationId}/evidence/${evidenceId}.jpg`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** The labels the evidence's result names, which its model must declare. */
function resultLabels(result: SdkEvidence["result"]): string[] {
  return result.type === "classification"
    ? [result.label, ...Object.keys(result.confidences)]
    : result.detections.map(({ label }) => label);
}

/**
 * The evidence service (US-070). `start` checks that the evidence comes from a
 * `dataset.capture` node of a published version of the application's workflow,
 * fed by the model version it names (also of that application, with the same
 * version, SHA-256, task type and labels), saves its metadata once per
 * evidence ID and signs an upload URL for its image. `complete` accepts the
 * image only when it has the size, SHA-256 and dimensions of the metadata and
 * is a JPEG, copies it to its final key and only then marks it received.
 */
export function createSdkEvidenceService({
  repository,
  storage,
  now = () => new Date(),
}: {
  repository: SdkEvidenceRepository;
  storage: EvidenceStorage;
  now?: () => Date;
}) {
  async function source(applicationId: string, evidence: SdkEvidence) {
    const version = await repository.findWorkflowVersion(applicationId, evidence.workflowVersionId);
    if (
      !version ||
      version.workflowId !== evidence.workflowId ||
      version.version !== evidence.workflowVersion ||
      !isRecord(version.definition)
    ) {
      return null;
    }
    const nodes = records(version.definition.nodes);
    const capture = nodes.find(
      (node) => node.id === evidence.captureNodeId && node.type === "dataset.capture",
    );
    const feed = records(version.definition.connections).find(
      (connection) =>
        connection.targetNodeId === evidence.captureNodeId && connection.targetPort === "resultado",
    );
    const modelNode = nodes.find(
      (node) => node.id === feed?.sourceNodeId && node.type === "model.tflite",
    );
    if (!capture || modelNode?.modelVersionId !== evidence.model.modelVersionId) return null;

    const found = await repository.findModelVersion(applicationId, evidence.model.modelVersionId);
    const output = isRecord(found?.contract) ? found.contract.output : undefined;
    const labels = isRecord(output) && Array.isArray(output.labels) ? output.labels : [];
    if (
      !found ||
      found.version !== evidence.model.version ||
      found.sha256 !== evidence.model.sha256 ||
      !isRecord(output) ||
      output.type !== evidence.result.type ||
      !resultLabels(evidence.result).every((label) => labels.includes(label))
    ) {
      return null;
    }
    return { workflowId: version.workflowId, modelId: found.modelId };
  }

  return {
    async start(applicationId: string, evidence: SdkEvidence): Promise<StartSdkEvidenceResult> {
      const found = await source(applicationId, evidence);
      if (!found) return { ok: false, reason: "sourceNotFound" };

      const contentSha256 = createHash("sha256").update(canonicalJson(evidence)).digest("hex");
      const row: SdkEvidenceRow = {
        applicationId,
        evidenceId: evidence.evidenceId,
        workflowId: found.workflowId,
        workflowVersionId: evidence.workflowVersionId,
        captureNodeId: evidence.captureNodeId,
        modelId: found.modelId,
        modelVersionId: evidence.model.modelVersionId,
        modelVersion: evidence.model.version,
        modelSha256: evidence.model.sha256,
        taskType: evidence.result.type,
        result: evidence.result,
        capturedAt: new Date(evidence.capturedAt),
        imageMediaType: evidence.image.mediaType,
        imageWidth: evidence.image.width,
        imageHeight: evidence.image.height,
        imageByteSize: evidence.image.byteSize,
        imageSha256: evidence.image.sha256,
        maxImageSize: evidence.image.maxImageSize,
        imageQuality: evidence.image.imageQuality,
        storageKey: evidenceStorageKey(applicationId, evidence.evidenceId),
        contentSha256,
        status: "awaitingUpload",
        receivedAt: null,
      };
      const saved = (await repository.insert(row))
        ? row
        : await repository.find(applicationId, evidence.evidenceId);
      if (!saved || saved.contentSha256 !== contentSha256) return { ok: false, reason: "conflict" };
      if (saved.status === "received" && saved.receivedAt) {
        return { ok: true, status: "received", receivedAt: saved.receivedAt.toISOString() };
      }

      const issuedAt = now();
      const uploadUrl = await storage.createUploadUrl(
        evidenceStagingKey(applicationId, evidence.evidenceId),
        EVIDENCE_UPLOAD_URL_TTL_SECONDS,
      );
      return {
        ok: true,
        status: "uploadRequired",
        uploadUrl,
        uploadUrlExpiresAt: new Date(
          issuedAt.getTime() + EVIDENCE_UPLOAD_URL_TTL_SECONDS * 1000,
        ).toISOString(),
      };
    },

    async complete(applicationId: string, evidenceId: string): Promise<CompleteSdkEvidenceResult> {
      const row = await repository.find(applicationId, evidenceId);
      if (!row) return { ok: false, reason: "notFound" };
      if (row.status === "received" && row.receivedAt) {
        return { ok: true, receivedAt: row.receivedAt.toISOString() };
      }

      const stagingKey = evidenceStagingKey(applicationId, evidenceId);
      const size = await storage.getSize(stagingKey);
      if (size === null) return { ok: false, reason: "imageMissing" };
      // Checking the size first keeps an oversized upload out of memory.
      const bytes = size === row.imageByteSize ? await storage.read(stagingKey) : undefined;
      const dimensions = bytes ? readJpegSize(bytes) : null;
      if (
        !bytes ||
        bytes.length !== row.imageByteSize ||
        createHash("sha256").update(bytes).digest("hex") !== row.imageSha256 ||
        dimensions?.width !== row.imageWidth ||
        dimensions.height !== row.imageHeight
      ) {
        await storage.remove(stagingKey);
        return { ok: false, reason: "invalidImage" };
      }

      // The validated bytes go to a key no signed URL points at, so nothing
      // uploaded later can replace the image of a received evidence.
      await storage.write(row.storageKey, bytes);
      const receivedAt =
        (await repository.markReceived(applicationId, evidenceId, now())) ??
        (await repository.find(applicationId, evidenceId))?.receivedAt;
      await storage.remove(stagingKey).catch(() => {});
      if (!receivedAt) throw new Error("Evidence receipt returned no record");
      return { ok: true, receivedAt: receivedAt.toISOString() };
    },
  };
}

export type SdkEvidenceDatabase = PostgresJsDatabase<typeof schema>;

/** The `SdkEvidenceRepository` over the database. */
export function drizzleSdkEvidenceRepository(database: SdkEvidenceDatabase): SdkEvidenceRepository {
  return {
    async findWorkflowVersion(applicationId, id) {
      const [found] = await database
        .select({
          workflowId: workflowVersion.workflowId,
          version: workflowVersion.version,
          definition: workflowVersion.definition,
        })
        .from(workflowVersion)
        .innerJoin(workflow, eq(workflow.id, workflowVersion.workflowId))
        .where(and(eq(workflowVersion.id, id), eq(workflow.applicationId, applicationId)))
        .limit(1);
      return found ?? null;
    },
    async findModelVersion(applicationId, id) {
      const [found] = await database
        .select({
          modelId: modelVersion.modelId,
          version: modelVersion.version,
          sha256: modelVersion.sha256,
          contract: modelVersion.contract,
        })
        .from(modelVersion)
        .innerJoin(model, eq(model.id, modelVersion.modelId))
        .where(and(eq(modelVersion.id, id), eq(model.applicationId, applicationId)))
        .limit(1);
      return found ?? null;
    },
    async insert(row) {
      const inserted = await database
        .insert(sdkEvidence)
        .values(row)
        .onConflictDoNothing()
        .returning({ evidenceId: sdkEvidence.evidenceId });
      return inserted.length > 0;
    },
    async find(applicationId, evidenceId) {
      const [found] = await database
        .select()
        .from(sdkEvidence)
        .where(
          and(eq(sdkEvidence.applicationId, applicationId), eq(sdkEvidence.evidenceId, evidenceId)),
        )
        .limit(1);
      return (found as SdkEvidenceRow | undefined) ?? null;
    },
    async markReceived(applicationId, evidenceId, receivedAt) {
      const [updated] = await database
        .update(sdkEvidence)
        .set({ status: "received", receivedAt })
        .where(
          and(
            eq(sdkEvidence.applicationId, applicationId),
            eq(sdkEvidence.evidenceId, evidenceId),
            eq(sdkEvidence.status, "awaitingUpload"),
          ),
        )
        .returning({ receivedAt: sdkEvidence.receivedAt });
      return updated?.receivedAt ?? null;
    },
  };
}
