import { randomUUID } from "node:crypto";
import type { DatasetExport } from "@ayni/api/datasets";
import { EVIDENCE_IMAGE_MEDIA_TYPE } from "@ayni/api/sdk-evidence";
import { dataset, datasetExport, datasetItem, sdkEvidence } from "@ayni/db/schema/index";
import { and, asc, desc, eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { type ApplicationDatabase, executeApplicationAction } from "./application-actions";
import { r2EvidenceStorage } from "./evidence-storage";
import { logger } from "./lib/logger";
import { deleteFile, uploadFile } from "./lib/storage";
import { toIsoString } from "./model-store";

const MAX_CLASSIFICATION_EXPORT_IMAGE_BYTES = 128 * 1024 * 1024;

type DatasetExportQuery = Promise<Record<string, unknown>[]> & {
  innerJoin: (table: unknown, condition: unknown) => DatasetExportQuery;
  where: (condition: unknown) => DatasetExportQuery;
  orderBy: (...columns: unknown[]) => DatasetExportQuery;
  limit: (count: number) => DatasetExportQuery;
  for: (lock: "update") => Promise<Record<string, unknown>[]>;
};

type DatasetExportReadExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => DatasetExportQuery;
  };
};

type DatasetExportWriteExecutor = DatasetExportReadExecutor & {
  insert: (table: unknown) => {
    values: (values: Record<string, unknown>) => {
      returning: () => Promise<Record<string, unknown>[]>;
    };
  };
};

type DatasetExportRow = {
  id: string;
  datasetId: string;
  version: number;
  format: "classification_images_csv";
  status: "ready";
  generatedAt: Date | string;
  itemCount: number;
  storageKey: string;
};

type ExportItem = {
  id: string;
  reviewedLabel: string | null;
  imageMediaType: string;
  imageByteSize: number;
  storageKey: string;
};

const datasetExportFields = {
  id: datasetExport.id,
  datasetId: datasetExport.datasetId,
  version: datasetExport.version,
  format: datasetExport.format,
  status: datasetExport.status,
  generatedAt: datasetExport.generatedAt,
  itemCount: datasetExport.itemCount,
  storageKey: datasetExport.storageKey,
};

function toDatasetExport(row: DatasetExportRow): DatasetExport {
  return {
    id: row.id,
    datasetId: row.datasetId,
    version: row.version,
    format: row.format,
    status: row.status,
    generatedAt: toIsoString(row.generatedAt),
    itemCount: row.itemCount,
  };
}

export async function listDatasetExports(
  database: ApplicationDatabase,
  applicationId: string,
  datasetId: string,
): Promise<{ exports: DatasetExport[] } | null> {
  return database.transaction(async (transaction) => {
    const tx = transaction as DatasetExportReadExecutor;
    const datasets = (await tx
      .select({ id: dataset.id })
      .from(dataset)
      .where(and(eq(dataset.applicationId, applicationId), eq(dataset.id, datasetId)))
      .limit(1)) as { id: string }[];
    if (!datasets[0]) return null;

    const rows = (await tx
      .select(datasetExportFields)
      .from(datasetExport)
      .where(
        and(eq(datasetExport.applicationId, applicationId), eq(datasetExport.datasetId, datasetId)),
      )
      .orderBy(desc(datasetExport.version))) as DatasetExportRow[];
    return { exports: rows.map(toDatasetExport) };
  });
}

export type CreateDatasetExportInput = {
  applicationId: string;
  datasetId: string;
  userId: string;
};

export type CreateDatasetExportResult =
  | { ok: true; value: DatasetExport }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "archived"
        | "notFound"
        | "notClassification"
        | "noApprovedItems"
        | "missingLabel"
        | "unsafeLabel"
        | "tooLarge"
        | "failed";
    };

export async function createDatasetExport(
  database: ApplicationDatabase,
  input: CreateDatasetExportInput,
): Promise<CreateDatasetExportResult> {
  let storageKey: string | null = null;
  let artifactStored = false;

  try {
    const snapshot = await executeApplicationAction(
      database,
      { applicationId: input.applicationId, userId: input.userId },
      async (transaction) => {
        const tx = transaction as unknown as DatasetExportReadExecutor;
        const datasets = (await tx
          .select({ taskType: dataset.taskType })
          .from(dataset)
          .where(
            and(eq(dataset.applicationId, input.applicationId), eq(dataset.id, input.datasetId)),
          )
          .limit(1)) as { taskType: string }[];
        const foundDataset = datasets[0];
        if (!foundDataset) return { kind: "error", reason: "notFound" } as const;
        if (foundDataset.taskType !== "classification") {
          return { kind: "error", reason: "notClassification" } as const;
        }

        const items = (await tx
          .select({
            id: datasetItem.id,
            reviewedLabel: datasetItem.reviewedLabel,
            imageMediaType: sdkEvidence.imageMediaType,
            imageByteSize: sdkEvidence.imageByteSize,
            storageKey: sdkEvidence.storageKey,
          })
          .from(datasetItem)
          .innerJoin(
            sdkEvidence,
            and(
              eq(sdkEvidence.applicationId, datasetItem.applicationId),
              eq(sdkEvidence.evidenceId, datasetItem.evidenceId),
            ),
          )
          .where(
            and(
              eq(datasetItem.applicationId, input.applicationId),
              eq(datasetItem.datasetId, input.datasetId),
              eq(datasetItem.reviewStatus, "approved"),
              eq(sdkEvidence.status, "received"),
            ),
          )
          .orderBy(asc(datasetItem.addedAt), asc(datasetItem.id))) as ExportItem[];
        if (items.length === 0) return { kind: "error", reason: "noApprovedItems" } as const;
        if (items.some(({ reviewedLabel }) => !reviewedLabel?.trim())) {
          return { kind: "error", reason: "missingLabel" } as const;
        }
        if (items.some(({ reviewedLabel }) => /^[\s]*[=+@-]/u.test(reviewedLabel ?? ""))) {
          return { kind: "error", reason: "unsafeLabel" } as const;
        }
        let imageBytes = 0;
        for (const item of items) {
          imageBytes += item.imageByteSize;
          if (imageBytes > MAX_CLASSIFICATION_EXPORT_IMAGE_BYTES) {
            return { kind: "error", reason: "tooLarge" } as const;
          }
        }
        return { kind: "ready", items } as const;
      },
    );

    if (!snapshot.ok) return { ok: false, reason: snapshot.reason };
    if (snapshot.value.kind === "error") return { ok: false, reason: snapshot.value.reason };
    const exportItems = snapshot.value.items;

    const files: Record<string, Uint8Array> = Object.create(null);
    const csvRows = ["filename,label"];
    for (const item of exportItems) {
      if (item.imageMediaType !== EVIDENCE_IMAGE_MEDIA_TYPE) {
        throw new Error("Unsupported dataset evidence image media type");
      }
      const filename = `images/${item.id}.jpg`;
      files[filename] = await r2EvidenceStorage.read(item.storageKey);
      const reviewedLabel = item.reviewedLabel?.trim();
      if (!reviewedLabel) throw new Error("Approved dataset item has no reviewed label");
      const label = reviewedLabel.replaceAll('"', '""');
      csvRows.push(`"${filename}","${label}"`);
    }
    files["labels.csv"] = new TextEncoder().encode(`${csvRows.join("\r\n")}\r\n`);
    // ponytail: caps image input at 128 MiB; use streaming ZIP upload when larger exports are needed.
    const artifact = zipSync(files, { level: 0 });
    const exportId = randomUUID();
    const artifactKey = `applications/${input.applicationId}/datasets/${input.datasetId}/exports/${exportId}.zip`;
    storageKey = artifactKey;
    await uploadFile(artifactKey, artifact, {
      contentType: "application/zip",
      onlyIfNotExists: true,
    });
    artifactStored = true;

    const saved = await executeApplicationAction(
      database,
      { applicationId: input.applicationId, userId: input.userId },
      async (transaction) => {
        const tx = transaction as unknown as DatasetExportWriteExecutor;
        const datasets = (await tx
          .select({ taskType: dataset.taskType })
          .from(dataset)
          .where(
            and(eq(dataset.applicationId, input.applicationId), eq(dataset.id, input.datasetId)),
          )
          .limit(1)
          .for("update")) as { taskType: string }[];
        const foundDataset = datasets[0];
        if (!foundDataset) return { kind: "error", reason: "notFound" } as const;
        if (foundDataset.taskType !== "classification") {
          return { kind: "error", reason: "notClassification" } as const;
        }

        const latest = (await tx
          .select({ version: datasetExport.version })
          .from(datasetExport)
          .where(
            and(
              eq(datasetExport.applicationId, input.applicationId),
              eq(datasetExport.datasetId, input.datasetId),
            ),
          )
          .orderBy(desc(datasetExport.version))
          .limit(1)) as { version: number }[];
        const rows = (await tx
          .insert(datasetExport)
          .values({
            id: exportId,
            applicationId: input.applicationId,
            datasetId: input.datasetId,
            version: (latest[0]?.version ?? 0) + 1,
            format: "classification_images_csv",
            status: "ready",
            itemCount: exportItems.length,
            storageKey: artifactKey,
          })
          .returning()) as DatasetExportRow[];
        if (!rows[0]) throw new Error("Dataset export insert returned no record");
        return { kind: "ready", export: toDatasetExport(rows[0]) } as const;
      },
    );

    if (!saved.ok) {
      await deleteFile(artifactKey);
      return { ok: false, reason: saved.reason };
    }
    if (saved.value.kind === "error") {
      await deleteFile(artifactKey);
      return { ok: false, reason: saved.value.reason };
    }
    return { ok: true, value: saved.value.export };
  } catch (error) {
    if (artifactStored && storageKey) {
      await deleteFile(storageKey).catch((cleanupError) => {
        logger.error(
          { err: cleanupError, storageKey },
          "Failed to clean up incomplete dataset export",
        );
      });
    }
    logger.error(
      { err: error, applicationId: input.applicationId, datasetId: input.datasetId },
      "Failed to generate dataset export",
    );
    return { ok: false, reason: "failed" };
  }
}
