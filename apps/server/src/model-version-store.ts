import { application, model, modelVersion } from "@ayni/db/schema/index";
import { and, desc, eq } from "drizzle-orm";

import {
  type ApplicationDatabase,
  executeApplicationAction,
  type TransactionExecutor,
} from "./application-actions";
import { toIsoString } from "./model-store";
import {
  buildModelVersionStorageKey,
  ModelVersionAlreadyStoredError,
  type ModelVersionStorage,
} from "./model-version-storage";
import { computeSha256Hex, DEFAULT_MAX_TFLITE_BYTES, gateTfLiteBuffer } from "./tflite-validator";

export type { ModelVersionStorage };

const SEMVER_STRICT = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export type ModelVersionRecord = {
  id: string;
  modelId: string;
  version: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  uploadedById: string | null;
};

export type CreateModelVersionInput = {
  applicationId: string;
  modelId: string;
  userId: string;
  version: string;
  bytes: Uint8Array;
  maxBytes?: number;
};

export type CreateModelVersionFailureReason =
  | "size"
  | "compressed"
  | "identifier"
  | "root-offset"
  | "vtable"
  | "invalidVersion"
  | "modelNotFound"
  | "versionExists"
  | "storageFailed"
  | "storageConflict"
  | "databaseFailed"
  | "forbidden"
  | "notFound"
  | "archived";

export type CreateModelVersionResult =
  | { ok: true; modelVersion: ModelVersionRecord }
  | { ok: false; reason: CreateModelVersionFailureReason };

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "23505") return true;
    current = candidate.cause;
  }
  return false;
}

type ModelVersionActionOutcome =
  | { kind: "modelNotFound" }
  | { kind: "created"; record: ModelVersionRecord };

type PreflightOutcome = { kind: "authorized" } | { kind: "modelNotFound" } | { kind: "duplicate" };

export async function createModelVersionWithArtifact(
  database: ApplicationDatabase,
  storage: ModelVersionStorage,
  {
    applicationId,
    modelId,
    userId,
    version,
    bytes,
    maxBytes = DEFAULT_MAX_TFLITE_BYTES,
  }: CreateModelVersionInput,
): Promise<CreateModelVersionResult> {
  if (!SEMVER_STRICT.test(version)) return { ok: false, reason: "invalidVersion" };

  const gate = gateTfLiteBuffer(bytes, maxBytes);
  if (!gate.ok) return { ok: false, reason: gate.reason };

  let preflight: Awaited<ReturnType<typeof executeApplicationAction<PreflightOutcome>>>;
  try {
    preflight = await executeApplicationAction<PreflightOutcome>(
      database,
      { applicationId, userId },
      async (tx: TransactionExecutor, application) => {
        const modelRows = (await tx
          .select({ id: model.id })
          .from(model)
          .where(and(eq(model.id, modelId), eq(model.applicationId, application.id)))
          .limit(1)
          .for("update")) as { id: string }[];
        const foundModel = modelRows[0];

        if (!foundModel) return { kind: "modelNotFound" } as const;

        const duplicateRows = (await tx
          .select({ id: modelVersion.id })
          .from(modelVersion)
          .where(and(eq(modelVersion.modelId, foundModel.id), eq(modelVersion.version, version)))
          .limit(1)
          .for("update")) as { id: string }[];

        if (duplicateRows.length > 0) return { kind: "duplicate" } as const;

        return { kind: "authorized" } as const;
      },
    );
  } catch {
    return { ok: false, reason: "databaseFailed" };
  }

  if (!preflight.ok) return { ok: false, reason: preflight.reason };
  if (preflight.value.kind === "modelNotFound") return { ok: false, reason: "modelNotFound" };
  if (preflight.value.kind === "duplicate") return { ok: false, reason: "versionExists" };

  const sha256 = await computeSha256Hex(bytes);
  const storageKey = buildModelVersionStorageKey({ applicationId, modelId, version });

  try {
    await storage.putArtifact(storageKey, bytes);
  } catch (error) {
    if (error instanceof ModelVersionAlreadyStoredError) {
      return { ok: false, reason: "storageConflict" };
    }
    return { ok: false, reason: "storageFailed" };
  }

  const compensate = async () => {
    try {
      await storage.removeArtifact(storageKey);
    } catch {
      // best-effort: un objeto huérfano se reconcilea fuera de banda
    }
  };

  let outcome: Awaited<ReturnType<typeof executeApplicationAction<ModelVersionActionOutcome>>>;
  try {
    outcome = await executeApplicationAction(
      database,
      { applicationId, userId },
      async (tx: TransactionExecutor, application) => {
        const modelRows = (await tx
          .select({ id: model.id })
          .from(model)
          .where(and(eq(model.id, modelId), eq(model.applicationId, application.id)))
          .limit(1)
          .for("update")) as { id: string }[];
        const foundModel = modelRows[0];

        if (!foundModel) return { kind: "modelNotFound" } as const;

        const insertedRows = (await tx
          .insert(modelVersion)
          .values({
            id: crypto.randomUUID(),
            modelId: foundModel.id,
            version,
            storageKey,
            sha256,
            sizeBytes: bytes.length,
            uploadedById: userId,
          })
          .returning()) as {
          id: string;
          modelId: string;
          version: string;
          storageKey: string;
          sha256: string;
          sizeBytes: number | string;
          createdAt: Date | string;
          uploadedById: string | null;
        }[];
        const created = insertedRows[0];

        if (!created) throw new Error("Model version creation returned no record");

        return {
          kind: "created",
          record: {
            id: created.id,
            modelId: created.modelId,
            version: created.version,
            storageKey: created.storageKey,
            sha256: created.sha256,
            sizeBytes: Number(created.sizeBytes),
            createdAt: toIsoString(created.createdAt),
            uploadedById: created.uploadedById,
          },
        } as const;
      },
    );
  } catch (error) {
    await compensate();
    return { ok: false, reason: isUniqueViolation(error) ? "versionExists" : "databaseFailed" };
  }

  if (!outcome.ok) {
    await compensate();
    return { ok: false, reason: outcome.reason };
  }

  if (outcome.value.kind === "modelNotFound") {
    await compensate();
    return { ok: false, reason: "modelNotFound" };
  }

  return { ok: true, modelVersion: outcome.value.record };
}

export type ModelVersionListItem = {
  id: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
};

export type ListModelVersionsResult =
  | { ok: true; versions: ModelVersionListItem[] }
  | { ok: false; reason: "modelNotFound" };

export type DeleteModelVersionFailureReason =
  | "notFound"
  | "forbidden"
  | "archived"
  | "inUse"
  | "storageFailed"
  | "databaseFailed";

export type DeleteModelVersionResult =
  | { ok: true }
  | { ok: false; reason: DeleteModelVersionFailureReason };

type DeleteModelVersionExecutor = TransactionExecutor & {
  delete: (table: unknown) => {
    where: (condition: unknown) => {
      returning: () => Promise<Record<string, unknown>[]>;
    };
  };
};

/**
 * Deletes a model version owned by an application and removes its artifact.
 * The caller supplies the published-workflow reference check so this store
 * remains independent of the workflow JSON representation.
 */
export async function deleteModelVersion(
  database: ApplicationDatabase,
  storage: ModelVersionStorage,
  {
    applicationId,
    modelId,
    modelVersionId,
    userId,
    isReferencedByPublishedWorkflow,
  }: {
    applicationId: string;
    modelId: string;
    modelVersionId: string;
    userId: string;
    isReferencedByPublishedWorkflow?: (modelVersionId: string) => Promise<boolean>;
  },
): Promise<DeleteModelVersionResult> {
  if (await isReferencedByPublishedWorkflow?.(modelVersionId)) {
    return { ok: false, reason: "inUse" };
  }

  let deleted: Awaited<
    ReturnType<
      typeof executeApplicationAction<
        { kind: "notFound" } | { kind: "deleted"; storageKey: string }
      >
    >
  >;
  try {
    deleted = await executeApplicationAction(
      database,
      { applicationId, userId },
      async (transaction, application) => {
        const tx = transaction as DeleteModelVersionExecutor;
        const modelRows = (await tx
          .select({ id: model.id })
          .from(model)
          .where(and(eq(model.id, modelId), eq(model.applicationId, application.id)))
          .limit(1)
          .for("update")) as { id: string }[];
        if (!modelRows[0]) return { kind: "notFound" } as const;

        const versionRows = (await tx
          .select({ id: modelVersion.id, storageKey: modelVersion.storageKey })
          .from(modelVersion)
          .where(and(eq(modelVersion.id, modelVersionId), eq(modelVersion.modelId, modelId)))
          .limit(1)
          .for("update")) as { id: string; storageKey: string }[];
        const found = versionRows[0];
        if (!found) return { kind: "notFound" } as const;

        const rows = await tx
          .delete(modelVersion)
          .where(eq(modelVersion.id, found.id))
          .returning();
        if (!rows[0]) throw new Error("Model version deletion returned no record");
        return { kind: "deleted", storageKey: found.storageKey } as const;
      },
    );
  } catch {
    return { ok: false, reason: "databaseFailed" };
  }

  if (!deleted.ok) return { ok: false, reason: deleted.reason };
  if (deleted.value.kind === "notFound") return { ok: false, reason: "notFound" };

  try {
    await storage.removeArtifact(deleted.value.storageKey);
  } catch {
    return { ok: false, reason: "storageFailed" };
  }

  return { ok: true };
}

type ListVersionsRow = {
  id: string;
  version: string;
  sha256: string;
  sizeBytes: number | string;
  createdAt: Date | string;
};

type ListVersionsExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<Record<string, unknown>[]>;
        orderBy: (column: unknown) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/**
 * Lists the stored versions of a model that belongs to the given application,
 * newest upload first. Exposes operational metadata only (id, SemVer, SHA-256,
 * size, upload date): never the artifact itself, a storage key, or a download
 * URL. A model outside the application is indistinguishable from a missing one.
 */
export async function listModelVersions(
  database: ApplicationDatabase,
  applicationId: string,
  modelId: string,
): Promise<ListModelVersionsResult> {
  return database.transaction(async (transaction) => {
    const tx = transaction as ListVersionsExecutor;

    const modelRows = await tx
      .select({ id: model.id })
      .from(model)
      .where(and(eq(model.id, modelId), eq(model.applicationId, applicationId)))
      .limit(1);
    if (!modelRows[0]) return { ok: false, reason: "modelNotFound" };

    const versionRows = (await tx
      .select({
        id: modelVersion.id,
        version: modelVersion.version,
        sha256: modelVersion.sha256,
        sizeBytes: modelVersion.sizeBytes,
        createdAt: modelVersion.createdAt,
      })
      .from(modelVersion)
      .where(eq(modelVersion.modelId, modelId))
      .orderBy(desc(modelVersion.createdAt))) as ListVersionsRow[];

    return {
      ok: true,
      versions: versionRows.map((row) => ({
        id: row.id,
        version: row.version,
        sha256: row.sha256,
        sizeBytes: Number(row.sizeBytes),
        createdAt: toIsoString(row.createdAt),
      })),
    };
  });
}

/** Seconds a presigned SDK download URL stays valid. Long enough for a mobile
 * connection to fetch a model artifact, short enough to be non-permanent. */
export const SDK_MODEL_DOWNLOAD_URL_TTL_SECONDS = 3600;

export type SdkModelVersionManifest = {
  modelVersionId: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  downloadUrl: string;
  downloadUrlExpiresAt: string;
};

export type GetSdkModelVersionManifestResult =
  | { ok: true; manifest: SdkModelVersionManifest }
  | { ok: false; reason: "notFound" };

type ManifestVersionRow = {
  id: string;
  modelId: string;
  version: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number | string;
};

type ManifestQueryDatabase = {
  select(fields: Record<string, unknown>): {
    from(table: unknown): {
      where(condition: unknown): {
        limit(count: number): Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/**
 * Builds the download manifest of one model version for the SDK. The version
 * is served only when its model belongs to the given application: a version
 * of another application is indistinguishable from a missing one. Only then is
 * a short-lived signed download location produced; the raw storage key never
 * leaves the server.
 */
export async function getSdkModelVersionManifest(
  database: ManifestQueryDatabase,
  storage: ModelVersionStorage,
  applicationId: string,
  modelVersionId: string,
): Promise<GetSdkModelVersionManifestResult> {
  const versionRows = (await database
    .select({
      id: modelVersion.id,
      modelId: modelVersion.modelId,
      version: modelVersion.version,
      storageKey: modelVersion.storageKey,
      sha256: modelVersion.sha256,
      sizeBytes: modelVersion.sizeBytes,
    })
    .from(modelVersion)
    .where(eq(modelVersion.id, modelVersionId))
    .limit(1)) as ManifestVersionRow[];
  const found = versionRows[0];
  if (!found) return { ok: false, reason: "notFound" };

  const modelRows = await database
    .select({ id: model.id })
    .from(model)
    .where(and(eq(model.id, found.modelId), eq(model.applicationId, applicationId)))
    .limit(1);
  if (!modelRows[0]) return { ok: false, reason: "notFound" };

  const applicationRows = (await database
    .select({ status: application.status })
    .from(application)
    .where(eq(application.id, applicationId))
    .limit(1)) as { status: string }[];
  if (applicationRows[0]?.status !== "active") return { ok: false, reason: "notFound" };

  const downloadUrl = await storage.createDownloadUrl(
    found.storageKey,
    SDK_MODEL_DOWNLOAD_URL_TTL_SECONDS,
  );

  return {
    ok: true,
    manifest: {
      modelVersionId: found.id,
      version: found.version,
      sha256: found.sha256,
      sizeBytes: Number(found.sizeBytes),
      downloadUrl,
      downloadUrlExpiresAt: new Date(
        Date.now() + SDK_MODEL_DOWNLOAD_URL_TTL_SECONDS * 1000,
      ).toISOString(),
    },
  };
}
