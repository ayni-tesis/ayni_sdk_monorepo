import { model, modelVersion } from "@ayni/db/schema/index";
import { and, eq } from "drizzle-orm";

import {
  type ApplicationDatabase,
  executeApplicationAction,
  type TransactionExecutor,
} from "./application-actions";
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

type PreflightOutcome =
  | { kind: "authorized" }
  | { kind: "modelNotFound" }
  | { kind: "duplicate" };

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
            createdAt:
              created.createdAt instanceof Date
                ? created.createdAt.toISOString()
                : String(created.createdAt),
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
