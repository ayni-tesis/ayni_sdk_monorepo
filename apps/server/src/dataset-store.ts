import type {
  Dataset,
  DatasetAvailableEvidenceResponse,
  DatasetDetailResponse,
  DatasetEvidence,
  DatasetItem,
  DatasetLabelRequest,
  DatasetLabelResponse,
  DatasetListItem,
  DatasetListResponse,
  DatasetReviewRequest,
  DatasetReviewResponse,
  DatasetTaskType,
} from "@ayni/api/datasets";
import { dataset, datasetItem, sdkEvidence, user } from "@ayni/db/schema/index";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  type ApplicationDatabase,
  executeApplicationAction,
  type TransactionExecutor,
} from "./application-actions";
import { logger } from "./lib/logger";
import { getDownloadUrl } from "./lib/storage";
import { toIsoString } from "./model-store";

export type CreateDatasetInput = {
  applicationId: string;
  userId: string;
  name: string;
  taskType: DatasetTaskType;
};

export type DatasetStoreResult =
  | { ok: true; value: Dataset }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" | "databaseFailed" };

type DatasetRow = {
  id: string;
  applicationId: string;
  name: string;
  taskType: DatasetTaskType;
  createdAt: Date | string;
  evidenceCount: number;
  approvedCount: number;
};

type DatasetItemRow = {
  id: string;
  evidenceId: string;
  modelId: string;
  modelVersion: string;
  taskType: DatasetTaskType;
  originalResult: Record<string, unknown>;
  capturedAt: Date | string;
  addedAt: Date | string;
  storageKey: string;
  imageWidth: number;
  imageHeight: number;
  reviewStatus: DatasetItem["reviewStatus"];
  reviewerName: string | null;
  reviewedAt: Date | string | null;
  reviewReason: string | null;
  reviewedLabel: string | null;
};

type DatasetEvidenceRow = {
  evidenceId: string;
  modelId: string;
  modelVersion: string;
  taskType: DatasetTaskType;
  result: Record<string, unknown>;
  capturedAt: Date | string;
};

type DatasetEvidenceForAddRow = DatasetEvidenceRow & {
  status: string;
  storageKey: string;
  imageWidth: number;
  imageHeight: number;
};

type DatasetQuery = Promise<Record<string, unknown>[]> & {
  leftJoin: (table: unknown, condition: unknown) => DatasetQuery;
  innerJoin: (table: unknown, condition: unknown) => DatasetQuery;
  where: (condition: unknown) => DatasetQuery;
  orderBy: (...columns: unknown[]) => DatasetQuery;
  limit: (count: number) => DatasetQuery;
  offset: (count: number) => Promise<Record<string, unknown>[]>;
  for: (lock: "update") => Promise<Record<string, unknown>[]>;
};

type DatasetReadExecutor = {
  select: (fields: Record<string, unknown>) => { from: (table: unknown) => DatasetQuery };
};

type DatasetWriteExecutor = DatasetReadExecutor & {
  delete: (table: unknown) => {
    where: (condition: unknown) => {
      returning: (fields?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    };
  };
  insert: (table: unknown) => {
    values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
      returning: (fields?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
    };
  };
  update: (table: unknown) => {
    set: (values: Record<string, unknown>) => {
      where: (condition: unknown) => {
        returning: (fields?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

const datasetFields = {
  id: dataset.id,
  applicationId: dataset.applicationId,
  name: dataset.name,
  taskType: dataset.taskType,
  createdAt: dataset.createdAt,
  evidenceCount: sql<number>`(select count(*)::int from ${datasetItem} where ${datasetItem.applicationId} = ${dataset.applicationId} and ${datasetItem.datasetId} = ${dataset.id})`,
  approvedCount: sql<number>`(select count(*)::int from ${datasetItem} where ${datasetItem.applicationId} = ${dataset.applicationId} and ${datasetItem.datasetId} = ${dataset.id} and ${datasetItem.reviewStatus} = 'approved')`,
};

const DATASET_EVIDENCE_PAGE_SIZE = 50;

function toDatasetListItem(row: DatasetRow): DatasetListItem {
  return {
    ...row,
    createdAt: toIsoString(row.createdAt),
    evidenceCount: row.evidenceCount,
    approvedCount: row.approvedCount,
  };
}

async function toDatasetItem(row: DatasetItemRow): Promise<DatasetItem> {
  const { storageKey, reviewedAt, ...item } = row;
  return {
    ...item,
    capturedAt: toIsoString(item.capturedAt),
    addedAt: toIsoString(item.addedAt),
    reviewedAt: reviewedAt === null ? null : toIsoString(reviewedAt),
    imageUrl: await getDownloadUrl(storageKey),
  };
}

function toDatasetEvidence(row: DatasetEvidenceRow): DatasetEvidence {
  return {
    evidenceId: row.evidenceId,
    modelId: row.modelId,
    modelVersion: row.modelVersion,
    taskType: row.taskType,
    result: row.result,
    capturedAt: toIsoString(row.capturedAt),
  };
}

export async function listDatasets(
  database: ApplicationDatabase,
  applicationId: string,
): Promise<DatasetListResponse> {
  return database.transaction(async (transaction) => {
    const tx = transaction as DatasetReadExecutor;
    const rows = (await tx
      .select(datasetFields)
      .from(dataset)
      .where(eq(dataset.applicationId, applicationId))
      .orderBy(asc(dataset.createdAt), asc(dataset.id))) as DatasetRow[];
    return { datasets: rows.map(toDatasetListItem) };
  });
}

export async function getDataset(
  database: ApplicationDatabase,
  applicationId: string,
  datasetId: string,
  offset = 0,
): Promise<DatasetDetailResponse | null> {
  return database.transaction(async (transaction) => {
    const tx = transaction as DatasetReadExecutor;
    const rows = (await tx
      .select(datasetFields)
      .from(dataset)
      .where(and(eq(dataset.applicationId, applicationId), eq(dataset.id, datasetId)))
      .limit(1)) as DatasetRow[];
    const row = rows[0];
    if (!row) return null;
    const items = (await tx
      .select({
        id: datasetItem.id,
        evidenceId: datasetItem.evidenceId,
        modelId: sdkEvidence.modelId,
        modelVersion: sdkEvidence.modelVersion,
        taskType: sdkEvidence.taskType,
        originalResult: datasetItem.originalResult,
        capturedAt: sdkEvidence.capturedAt,
        addedAt: datasetItem.addedAt,
        storageKey: sdkEvidence.storageKey,
        imageWidth: sdkEvidence.imageWidth,
        imageHeight: sdkEvidence.imageHeight,
        reviewStatus: datasetItem.reviewStatus,
        reviewerName: user.name,
        reviewedAt: datasetItem.reviewedAt,
        reviewReason: datasetItem.reviewReason,
        reviewedLabel: datasetItem.reviewedLabel,
      })
      .from(datasetItem)
      .innerJoin(
        sdkEvidence,
        and(
          eq(sdkEvidence.applicationId, datasetItem.applicationId),
          eq(sdkEvidence.evidenceId, datasetItem.evidenceId),
        ),
      )
      .leftJoin(user, eq(user.id, datasetItem.reviewedBy))
      .where(
        and(eq(datasetItem.applicationId, applicationId), eq(datasetItem.datasetId, datasetId)),
      )
      .orderBy(asc(datasetItem.addedAt), asc(datasetItem.id))
      .limit(DATASET_EVIDENCE_PAGE_SIZE + 1)
      .offset(offset)) as DatasetItemRow[];
    const hasMore = items.length > DATASET_EVIDENCE_PAGE_SIZE;
    const page = hasMore ? items.slice(0, DATASET_EVIDENCE_PAGE_SIZE) : items;
    return {
      dataset: toDatasetListItem(row),
      items: await Promise.all(page.map(toDatasetItem)),
      nextItemOffset: hasMore ? offset + page.length : null,
    };
  });
}

export async function listAvailableDatasetEvidence(
  database: ApplicationDatabase,
  applicationId: string,
  datasetId: string,
  offset = 0,
): Promise<DatasetAvailableEvidenceResponse | null> {
  return database.transaction(async (transaction) => {
    const tx = transaction as DatasetReadExecutor;
    const datasets = (await tx
      .select({ taskType: dataset.taskType })
      .from(dataset)
      .where(and(eq(dataset.applicationId, applicationId), eq(dataset.id, datasetId)))
      .limit(1)) as { taskType: DatasetTaskType }[];
    const found = datasets[0];
    if (!found) return null;

    const rows = (await tx
      .select({
        evidenceId: sdkEvidence.evidenceId,
        modelId: sdkEvidence.modelId,
        modelVersion: sdkEvidence.modelVersion,
        taskType: sdkEvidence.taskType,
        result: sdkEvidence.result,
        capturedAt: sdkEvidence.capturedAt,
      })
      .from(sdkEvidence)
      .leftJoin(
        datasetItem,
        and(
          eq(datasetItem.applicationId, applicationId),
          eq(datasetItem.datasetId, datasetId),
          eq(datasetItem.evidenceId, sdkEvidence.evidenceId),
        ),
      )
      .where(
        and(
          eq(sdkEvidence.applicationId, applicationId),
          eq(sdkEvidence.taskType, found.taskType),
          eq(sdkEvidence.status, "received"),
          isNull(datasetItem.evidenceId),
        ),
      )
      .orderBy(desc(sdkEvidence.capturedAt), desc(sdkEvidence.evidenceId))
      .limit(DATASET_EVIDENCE_PAGE_SIZE + 1)
      .offset(offset)) as DatasetEvidenceRow[];
    const hasMore = rows.length > DATASET_EVIDENCE_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, DATASET_EVIDENCE_PAGE_SIZE) : rows;
    return {
      evidence: page.map(toDatasetEvidence),
      nextOffset: hasMore ? offset + page.length : null,
    };
  });
}

export type AddDatasetEvidenceInput = {
  applicationId: string;
  datasetId: string;
  evidenceIds: string[];
  userId: string;
};

export type AddDatasetEvidenceResult =
  | { ok: true; value: DatasetItem[] }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "notFound"
        | "archived"
        | "incompatible"
        | "alreadyAdded"
        | "databaseFailed";
    };

type AddOutcome =
  | { kind: "notFound" }
  | { kind: "incompatible" }
  | { kind: "alreadyAdded" }
  | { kind: "added"; items: DatasetItem[] };

export async function addDatasetEvidence(
  database: ApplicationDatabase,
  input: AddDatasetEvidenceInput,
): Promise<AddDatasetEvidenceResult> {
  try {
    const result = await executeApplicationAction<AddOutcome>(
      database,
      { applicationId: input.applicationId, userId: input.userId },
      async (transaction) => {
        const tx = transaction as unknown as DatasetWriteExecutor;
        const datasets = (await tx
          .select({ id: dataset.id, taskType: dataset.taskType })
          .from(dataset)
          .where(
            and(eq(dataset.applicationId, input.applicationId), eq(dataset.id, input.datasetId)),
          )
          .limit(1)
          .for("update")) as { id: string; taskType: DatasetTaskType }[];
        const found = datasets[0];
        if (!found) return { kind: "notFound" };

        const uniqueIds = [...new Set(input.evidenceIds)];
        if (uniqueIds.length !== input.evidenceIds.length) return { kind: "alreadyAdded" };
        const rows = (await tx
          .select({
            evidenceId: sdkEvidence.evidenceId,
            modelId: sdkEvidence.modelId,
            modelVersion: sdkEvidence.modelVersion,
            taskType: sdkEvidence.taskType,
            result: sdkEvidence.result,
            capturedAt: sdkEvidence.capturedAt,
            status: sdkEvidence.status,
            storageKey: sdkEvidence.storageKey,
            imageWidth: sdkEvidence.imageWidth,
            imageHeight: sdkEvidence.imageHeight,
          })
          .from(sdkEvidence)
          .where(
            and(
              eq(sdkEvidence.applicationId, input.applicationId),
              inArray(sdkEvidence.evidenceId, uniqueIds),
            ),
          )) as DatasetEvidenceForAddRow[];
        if (rows.length !== uniqueIds.length || rows.some((row) => row.status !== "received")) {
          return { kind: "notFound" };
        }
        if (rows.some((row) => row.taskType !== found.taskType)) return { kind: "incompatible" };

        const attached = (await tx
          .select({ evidenceId: datasetItem.evidenceId })
          .from(datasetItem)
          .where(
            and(
              eq(datasetItem.applicationId, input.applicationId),
              eq(datasetItem.datasetId, input.datasetId),
              inArray(datasetItem.evidenceId, uniqueIds),
            ),
          )) as { evidenceId: string }[];
        if (attached.length) return { kind: "alreadyAdded" };

        const addedAt = new Date();
        const inserted = (await tx
          .insert(datasetItem)
          .values(
            rows.map((row) => ({
              id: crypto.randomUUID(),
              applicationId: input.applicationId,
              datasetId: input.datasetId,
              evidenceId: row.evidenceId,
              originalResult: row.result,
              addedAt,
            })),
          )
          .returning({
            id: datasetItem.id,
            evidenceId: datasetItem.evidenceId,
            originalResult: datasetItem.originalResult,
            addedAt: datasetItem.addedAt,
          })) as {
          id: string;
          evidenceId: string;
          originalResult: Record<string, unknown>;
          addedAt: Date | string;
        }[];
        if (inserted.length !== rows.length)
          throw new Error("Dataset evidence insert returned no record");

        const evidenceById = new Map(rows.map((row) => [row.evidenceId, row]));
        return {
          kind: "added",
          items: await Promise.all(
            inserted.map(async (item) => {
              const evidence = evidenceById.get(item.evidenceId);
              if (!evidence) throw new Error("Dataset evidence metadata was not found");
              return {
                ...item,
                modelId: evidence.modelId,
                modelVersion: evidence.modelVersion,
                taskType: evidence.taskType,
                capturedAt: toIsoString(evidence.capturedAt),
                addedAt: toIsoString(item.addedAt),
                imageUrl: await getDownloadUrl(evidence.storageKey),
                imageWidth: evidence.imageWidth,
                imageHeight: evidence.imageHeight,
                reviewStatus: "pending" as const,
                reviewerName: null,
                reviewedAt: null,
                reviewReason: null,
                reviewedLabel: null,
              };
            }),
          ),
        };
      },
    );
    if (!result.ok) return { ok: false, reason: result.reason };
    if (result.value.kind === "added") return { ok: true, value: result.value.items };
    return { ok: false, reason: result.value.kind };
  } catch {
    return { ok: false, reason: "databaseFailed" };
  }
}

export type RemoveDatasetEvidenceInput = {
  applicationId: string;
  datasetId: string;
  itemId: string;
  userId: string;
};

export type RemoveDatasetEvidenceResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" | "databaseFailed" };

export async function removeDatasetEvidence(
  database: ApplicationDatabase,
  input: RemoveDatasetEvidenceInput,
): Promise<RemoveDatasetEvidenceResult> {
  try {
    const result = await executeApplicationAction(
      database,
      { applicationId: input.applicationId, userId: input.userId },
      async (transaction) => {
        const tx = transaction as unknown as DatasetWriteExecutor;
        const deleted = await tx
          .delete(datasetItem)
          .where(
            and(
              eq(datasetItem.applicationId, input.applicationId),
              eq(datasetItem.datasetId, input.datasetId),
              eq(datasetItem.id, input.itemId),
            ),
          )
          .returning({ id: datasetItem.id });
        return deleted.length ? "removed" : "notFound";
      },
    );
    if (!result.ok) return { ok: false, reason: result.reason };
    return result.value === "removed" ? { ok: true } : { ok: false, reason: "notFound" };
  } catch (error) {
    logger.error(
      {
        err: error,
        applicationId: input.applicationId,
        datasetId: input.datasetId,
        itemId: input.itemId,
      },
      "Failed to remove dataset evidence",
    );
    return { ok: false, reason: "databaseFailed" };
  }
}

export type ReviewDatasetEvidenceInput = {
  applicationId: string;
  datasetId: string;
  itemId: string;
  userId: string;
} & DatasetReviewRequest;

export type ReviewDatasetEvidenceResult =
  | { ok: true; value: DatasetReviewResponse }
  | { ok: false; reason: "notFound" | "databaseFailed" };

export async function reviewDatasetEvidence(
  database: ApplicationDatabase,
  input: ReviewDatasetEvidenceInput,
): Promise<ReviewDatasetEvidenceResult> {
  try {
    const reviewedAt = new Date();
    const reason = input.status === "rejected" ? input.reason?.trim() || null : null;
    const result = await executeApplicationAction(
      database,
      {
        applicationId: input.applicationId,
        userId: input.userId,
        allowArchived: true,
        requireAdmin: false,
      },
      async (transaction) => {
        const tx = transaction as unknown as DatasetWriteExecutor;
        const updated = (await tx
          .update(datasetItem)
          .set({
            reviewStatus: input.status,
            reviewedBy: input.userId,
            reviewedAt,
            reviewReason: reason,
          })
          .where(
            and(
              eq(datasetItem.applicationId, input.applicationId),
              eq(datasetItem.datasetId, input.datasetId),
              eq(datasetItem.id, input.itemId),
            ),
          )
          .returning({ id: datasetItem.id, reviewedAt: datasetItem.reviewedAt })) as {
          id: string;
          reviewedAt: Date | string;
        }[];
        const saved = updated[0];
        if (!saved) return null;

        const reviewers = (await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, input.userId))
          .limit(1)) as { name: string }[];
        return {
          status: input.status,
          reviewerName: reviewers[0]?.name ?? null,
          reviewedAt: toIsoString(saved.reviewedAt),
          reason,
        };
      },
    );
    if (!result.ok) return { ok: false, reason: "notFound" };
    return result.value ? { ok: true, value: result.value } : { ok: false, reason: "notFound" };
  } catch (error) {
    logger.error(
      {
        err: error,
        applicationId: input.applicationId,
        datasetId: input.datasetId,
        itemId: input.itemId,
      },
      "Failed to review dataset evidence",
    );
    return { ok: false, reason: "databaseFailed" };
  }
}

export type SaveDatasetItemLabelInput = {
  applicationId: string;
  datasetId: string;
  itemId: string;
  userId: string;
} & DatasetLabelRequest;

export type SaveDatasetItemLabelResult =
  | { ok: true; value: DatasetLabelResponse }
  | { ok: false; reason: "notFound" | "notClassification" | "databaseFailed" };

/**
 * Saves the reviewed classification label of a dataset item (US-081) in its
 * own column, so `originalResult` keeps the model's prediction unchanged. Any
 * workspace member may correct it, as with the review status.
 */
export async function saveDatasetItemLabel(
  database: ApplicationDatabase,
  input: SaveDatasetItemLabelInput,
): Promise<SaveDatasetItemLabelResult> {
  try {
    const result = await executeApplicationAction(
      database,
      {
        applicationId: input.applicationId,
        userId: input.userId,
        allowArchived: true,
        requireAdmin: false,
      },
      async (transaction) => {
        const tx = transaction as unknown as DatasetWriteExecutor;
        const itemCondition = and(
          eq(datasetItem.applicationId, input.applicationId),
          eq(datasetItem.datasetId, input.datasetId),
          eq(datasetItem.id, input.itemId),
        );
        const items = (await tx
          .select({ id: datasetItem.id, taskType: dataset.taskType })
          .from(datasetItem)
          .innerJoin(
            dataset,
            and(
              eq(dataset.applicationId, datasetItem.applicationId),
              eq(dataset.id, datasetItem.datasetId),
            ),
          )
          .where(itemCondition)
          .limit(1)) as { id: string; taskType: DatasetTaskType }[];
        const item = items[0];
        if (!item) return "notFound" as const;
        if (item.taskType !== "classification") return "notClassification" as const;

        // The task type never changes, so no lock is needed: an item removed
        // meanwhile simply updates no row.
        const reviewedLabel = input.label.trim();
        const updated = await tx
          .update(datasetItem)
          .set({ reviewedLabel })
          .where(itemCondition)
          .returning({ id: datasetItem.id });
        return updated.length ? { reviewedLabel } : ("notFound" as const);
      },
    );
    if (!result.ok) return { ok: false, reason: "notFound" };
    return typeof result.value === "string"
      ? { ok: false, reason: result.value }
      : { ok: true, value: result.value };
  } catch (error) {
    logger.error(
      {
        err: error,
        applicationId: input.applicationId,
        datasetId: input.datasetId,
        itemId: input.itemId,
      },
      "Failed to save dataset item label",
    );
    return { ok: false, reason: "databaseFailed" };
  }
}

export async function createDataset(
  database: ApplicationDatabase,
  input: CreateDatasetInput,
): Promise<DatasetStoreResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "databaseFailed" };

  try {
    const result = await executeApplicationAction(
      database,
      { applicationId: input.applicationId, userId: input.userId },
      async (tx: TransactionExecutor, application) => {
        const rows = (await tx
          .insert(dataset)
          .values({
            id: crypto.randomUUID(),
            applicationId: application.id,
            name,
            taskType: input.taskType,
          })
          .returning()) as DatasetRow[];
        const created = rows[0];
        if (!created) throw new Error("Dataset insert returned no record");

        return {
          ...created,
          createdAt: toIsoString(created.createdAt),
        };
      },
    );
    return result.ok ? { ok: true, value: result.value } : result;
  } catch {
    return { ok: false, reason: "databaseFailed" };
  }
}
