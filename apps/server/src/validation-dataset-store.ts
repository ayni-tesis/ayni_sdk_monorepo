import { and, eq } from "drizzle-orm";

import {
  application,
  validationDataset,
  validationDatasetVersion,
} from "@ayni/db/schema/index";

import { executeApplicationAction, type ApplicationDatabase } from "./application-actions";
import type { TransactionExecutor } from "./application-actions";
import { computeSha256Hex } from "./tflite-validator";

export const MAX_VALIDATION_DATASET_BYTES = 128 * 1024 * 1024;

const STRICT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PARTITION = /^[A-Za-z0-9._-]{1,64}$/;

export type ValidationDatasetStorage = {
  putArtifact(key: string, bytes: Uint8Array): Promise<void>;
  getArtifact(key: string): Promise<Uint8Array | null>;
  getArtifactSize(key: string): Promise<number | null>;
  createUploadUrl(key: string, expiresIn: number): Promise<string>;
  removeArtifact(key: string): Promise<void>;
  createDownloadUrl(key: string, expiresIn: number): Promise<string>;
};

export type ValidationDataset = {
  id: string;
  applicationId: string;
  name: string;
  source: string;
  license: string;
  createdAt: string;
  createdById: string | null;
};

export type ValidationDatasetVersion = {
  id: string;
  datasetId: string;
  version: string;
  partition: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
  uploadedById: string | null;
};

export type ValidationDatasetListItem = ValidationDataset & {
  versions: ValidationDatasetVersion[];
};

export type ValidationDatasetStoreFailureReason =
  | "notFound"
  | "forbidden"
  | "archived"
  | "datasetExists"
  | "invalidVersion"
  | "invalidPartition"
  | "versionExists"
  | "size"
  | "hash"
  | "storageFailed"
  | "databaseFailed";

export type ValidationDatasetStoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ValidationDatasetStoreFailureReason };

export type CreateValidationDatasetInput = {
  applicationId: string;
  userId: string;
  name: string;
  source: string;
  license: string;
};

export type CompleteValidationDatasetUploadInput = {
  applicationId: string;
  datasetId: string;
  userId: string;
  version: string;
  partition: string;
  bytes: Uint8Array;
};

type ReadDatabase = {
  select(fields: Record<string, unknown>): {
    from(table: unknown): {
      where(condition: unknown): Promise<Record<string, unknown>[]>;
    };
  };
};

type StoreDependencies = {
  db: ApplicationDatabase;
  storage: ValidationDatasetStorage;
  now?: () => Date;
};

type Preflight = { kind: "ready" } | { kind: "datasetNotFound" } | { kind: "versionExists" };
type CompleteOutcome =
  | { kind: "created"; version: ValidationDatasetVersion }
  | { kind: "datasetNotFound" }
  | { kind: "versionExists" };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function isoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function datasetFromRow(row: Record<string, unknown>): ValidationDataset {
  return {
    id: String(row.id),
    applicationId: String(row.applicationId),
    name: String(row.name),
    source: String(row.source),
    license: String(row.license),
    createdAt: isoString(row.createdAt),
    createdById: row.createdById == null ? null : String(row.createdById),
  };
}

function versionFromRow(row: Record<string, unknown>): ValidationDatasetVersion {
  return {
    id: String(row.id),
    datasetId: String(row.datasetId),
    version: String(row.version),
    partition: String(row.partition),
    sha256: String(row.sha256),
    sizeBytes: Number(row.sizeBytes),
    createdAt: isoString(row.createdAt),
    uploadedById: row.uploadedById == null ? null : String(row.uploadedById),
  };
}

function mapActionFailure(reason: "notFound" | "forbidden" | "archived" | "databaseFailed") {
  return reason;
}

export function buildValidationDatasetStorageKey(input: {
  applicationId: string;
  datasetId: string;
  versionId: string;
}): string {
  return `applications/${input.applicationId}/validation-datasets/${input.datasetId}/versions/${input.versionId}.zip`;
}

export function createValidationDatasetStore({ db, storage, now = () => new Date() }: StoreDependencies) {
  const reader = db as unknown as ReadDatabase;

  return {
    async createDataset(input: CreateValidationDatasetInput): Promise<ValidationDatasetStoreResult<ValidationDataset>> {
      const name = input.name.trim();
      const source = input.source.trim();
      const license = input.license.trim();
      if (!name || !source || !license) return { ok: false, reason: "databaseFailed" };

      try {
        const result = await executeApplicationAction(
          db,
          { applicationId: input.applicationId, userId: input.userId },
          async (tx: TransactionExecutor) => {
            const rows = await tx.insert(validationDataset).values({
              id: crypto.randomUUID(),
              applicationId: input.applicationId,
              name,
              source,
              license,
              createdAt: now(),
              createdById: input.userId,
            }).returning();
            const created = rows[0];
            if (!created) throw new Error("Validation dataset insert returned no record");
            return datasetFromRow(created);
          },
        );
        if (!result.ok) return { ok: false, reason: mapActionFailure(result.reason) };
        return { ok: true, value: result.value };
      } catch (error) {
        return {
          ok: false,
          reason: isUniqueViolation(error) ? "datasetExists" : "databaseFailed",
        };
      }
    },

    async list(applicationId: string): Promise<{ datasets: ValidationDatasetListItem[] }> {
      const datasets = await reader
        .select({
          id: validationDataset.id,
          applicationId: validationDataset.applicationId,
          name: validationDataset.name,
          source: validationDataset.source,
          license: validationDataset.license,
          createdAt: validationDataset.createdAt,
          createdById: validationDataset.createdById,
        })
        .from(validationDataset)
        .where(eq(validationDataset.applicationId, applicationId));

      const result = await Promise.all(
        datasets.map(async (row) => {
          const versions = await reader
            .select({
              id: validationDatasetVersion.id,
              datasetId: validationDatasetVersion.datasetId,
              version: validationDatasetVersion.version,
              partition: validationDatasetVersion.partition,
              sha256: validationDatasetVersion.sha256,
              sizeBytes: validationDatasetVersion.sizeBytes,
              createdAt: validationDatasetVersion.createdAt,
              uploadedById: validationDatasetVersion.uploadedById,
            })
            .from(validationDatasetVersion)
            .where(eq(validationDatasetVersion.datasetId, String(row.id)));
          return {
            ...datasetFromRow(row),
            versions: versions.map(versionFromRow),
          };
        }),
      );
      return { datasets: result };
    },

    async completeUpload(
      input: CompleteValidationDatasetUploadInput,
    ): Promise<ValidationDatasetStoreResult<ValidationDatasetVersion>> {
      if (!STRICT_SEMVER.test(input.version)) return { ok: false, reason: "invalidVersion" };
      if (!PARTITION.test(input.partition)) return { ok: false, reason: "invalidPartition" };
      if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_VALIDATION_DATASET_BYTES) {
        return { ok: false, reason: "size" };
      }

      let preflight: Awaited<ReturnType<typeof executeApplicationAction<Preflight>>>;
      try {
        preflight = await executeApplicationAction<Preflight>(
          db,
          { applicationId: input.applicationId, userId: input.userId },
          async (tx: TransactionExecutor) => {
            const datasetRows = (await tx
              .select({ id: validationDataset.id })
              .from(validationDataset)
              .where(
                and(
                  eq(validationDataset.id, input.datasetId),
                  eq(validationDataset.applicationId, input.applicationId),
                ),
              )
              .limit(1)
              .for("update")) as { id: string }[];
            if (!datasetRows[0]) return { kind: "datasetNotFound" } as const;

            const duplicateRows = (await tx
              .select({ id: validationDatasetVersion.id })
              .from(validationDatasetVersion)
              .where(
                and(
                  eq(validationDatasetVersion.datasetId, input.datasetId),
                  eq(validationDatasetVersion.version, input.version),
                  eq(validationDatasetVersion.partition, input.partition),
                ),
              )
              .limit(1)
              .for("update")) as { id: string }[];
            return duplicateRows[0] ? ({ kind: "versionExists" } as const) : ({ kind: "ready" } as const);
          },
        );
      } catch {
        return { ok: false, reason: "databaseFailed" };
      }

      if (!preflight.ok) return { ok: false, reason: mapActionFailure(preflight.reason) };
      if (preflight.value.kind === "datasetNotFound") return { ok: false, reason: "notFound" };
      if (preflight.value.kind === "versionExists") return { ok: false, reason: "versionExists" };

      let sha256: string;
      try {
        sha256 = await computeSha256Hex(input.bytes);
      } catch {
        return { ok: false, reason: "hash" };
      }

      const versionId = crypto.randomUUID();
      const storageKey = buildValidationDatasetStorageKey({
        applicationId: input.applicationId,
        datasetId: input.datasetId,
        versionId,
      });
      try {
        await storage.putArtifact(storageKey, input.bytes);
      } catch {
        return { ok: false, reason: "storageFailed" };
      }

      const compensate = async () => {
        try {
          await storage.removeArtifact(storageKey);
        } catch {
          // Best-effort cleanup; orphan reconciliation is an operational task.
        }
      };

      let outcome: Awaited<ReturnType<typeof executeApplicationAction<CompleteOutcome>>>;
      try {
        outcome = await executeApplicationAction<CompleteOutcome>(
          db,
          { applicationId: input.applicationId, userId: input.userId },
          async (tx: TransactionExecutor) => {
            const datasetRows = (await tx
              .select({ id: validationDataset.id })
              .from(validationDataset)
              .where(
                and(
                  eq(validationDataset.id, input.datasetId),
                  eq(validationDataset.applicationId, input.applicationId),
                ),
              )
              .limit(1)
              .for("update")) as { id: string }[];
            if (!datasetRows[0]) return { kind: "datasetNotFound" } as const;

            const insertedRows = await tx.insert(validationDatasetVersion).values({
              id: versionId,
              datasetId: input.datasetId,
              version: input.version,
              partition: input.partition,
              storageKey,
              sha256,
              sizeBytes: input.bytes.byteLength,
              createdAt: now(),
              uploadedById: input.userId,
            }).returning();
            const created = insertedRows[0];
            if (!created) throw new Error("Validation dataset version insert returned no record");
            return { kind: "created", version: versionFromRow(created) } as const;
          },
        );
      } catch (error) {
        await compensate();
        return { ok: false, reason: isUniqueViolation(error) ? "versionExists" : "databaseFailed" };
      }

      if (!outcome.ok) {
        await compensate();
        return { ok: false, reason: mapActionFailure(outcome.reason) };
      }
      if (outcome.value.kind !== "created") {
        await compensate();
        return {
          ok: false,
          reason: outcome.value.kind === "versionExists" ? "versionExists" : "notFound",
        };
      }
      return { ok: true, value: outcome.value.version };
    },

    async getManifestData(
      applicationId: string,
      datasetVersionId: string,
    ): Promise<ValidationDatasetStoreResult<{
      datasetVersionId: string;
      datasetId: string;
      applicationId: string;
      version: string;
      partition: string;
      source: string;
      license: string;
      sha256: string;
      sizeBytes: number;
      storageKey: string;
    }>> {
      try {
        const versions = await reader
          .select({
            id: validationDatasetVersion.id,
            datasetId: validationDatasetVersion.datasetId,
            version: validationDatasetVersion.version,
            partition: validationDatasetVersion.partition,
            storageKey: validationDatasetVersion.storageKey,
            sha256: validationDatasetVersion.sha256,
            sizeBytes: validationDatasetVersion.sizeBytes,
          })
          .from(validationDatasetVersion)
          .where(eq(validationDatasetVersion.id, datasetVersionId));
        const version = versions[0];
        if (!version) return { ok: false, reason: "notFound" };

        const datasets = await reader
          .select({
            id: validationDataset.id,
            applicationId: validationDataset.applicationId,
            source: validationDataset.source,
            license: validationDataset.license,
          })
          .from(validationDataset)
          .where(eq(validationDataset.id, String(version.datasetId)));
        const dataset = datasets[0];
        if (!dataset || dataset.applicationId !== applicationId) {
          return { ok: false, reason: "notFound" };
        }

        const applications = await reader
          .select({ id: application.id, status: application.status })
          .from(application)
          .where(eq(application.id, applicationId));
        if (applications[0]?.status !== "active") return { ok: false, reason: "notFound" };

        return {
          ok: true,
          value: {
            datasetVersionId: String(version.id),
            datasetId: String(dataset.id),
            applicationId: String(dataset.applicationId),
            version: String(version.version),
            partition: String(version.partition),
            source: String(dataset.source),
            license: String(dataset.license),
            sha256: String(version.sha256),
            sizeBytes: Number(version.sizeBytes),
            storageKey: String(version.storageKey),
          },
        };
      } catch {
        return { ok: false, reason: "databaseFailed" };
      }
    },
  };
}
