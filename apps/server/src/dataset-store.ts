import type {
  Dataset,
  DatasetAnnotation,
  DatasetAnnotationsRequest,
  DatasetAnnotationsResponse,
  DatasetAvailableEvidenceResponse,
  DatasetDetailResponse,
  DatasetEvidence,
  DatasetFilterOptions,
  DatasetItem,
  DatasetItemFilters,
  DatasetLabelRequest,
  DatasetLabelResponse,
  DatasetListItem,
  DatasetListResponse,
  DatasetReviewRequest,
  DatasetReviewResponse,
  DatasetTaskType,
} from "@ayni/api/datasets";
import { dataset, datasetItem, model, sdkEvidence, user, workflow } from "@ayni/db/schema/index";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  type ApplicationDatabase,
  executeApplicationAction,
  type TransactionExecutor,
} from "./application-actions";
import { logger } from "./lib/logger";
import { qualifiedColumn } from "./lib/sql";
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
  reviewedAnnotations: DatasetAnnotation[] | null;
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
  groupBy: (...columns: unknown[]) => DatasetQuery;
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

// Both queries that select these fields read `dataset` alone, so the subqueries
// name every column's table (see `qualifiedColumn`).
const itemsOfDataset = sql`${qualifiedColumn(datasetItem, datasetItem.applicationId)} = ${qualifiedColumn(dataset, dataset.applicationId)} and ${qualifiedColumn(datasetItem, datasetItem.datasetId)} = ${qualifiedColumn(dataset, dataset.id)}`;

const datasetFields = {
  id: dataset.id,
  applicationId: dataset.applicationId,
  name: dataset.name,
  taskType: dataset.taskType,
  createdAt: dataset.createdAt,
  evidenceCount: sql<number>`(select count(*)::int from ${datasetItem} where ${itemsOfDataset})`,
  approvedCount: sql<number>`(select count(*)::int from ${datasetItem} where ${itemsOfDataset} and ${qualifiedColumn(datasetItem, datasetItem.reviewStatus)} = 'approved')`,
};

const DATASET_EVIDENCE_PAGE_SIZE = 50;

const datasetItemFields = {
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
  reviewedAnnotations: datasetItem.reviewedAnnotations,
};

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

/**
 * The jsonpath to an item's prediction confidences (US-083): the predicted
 * label's for classification, every detection's for detection, of which the
 * filter compares the highest. A detection without boxes has none, so it
 * matches no confidence filter.
 */
const PREDICTION_CONFIDENCE_PATHS: Record<DatasetTaskType, string> = {
  classification: '$.confidence ? (@.type() == "number")',
  detection: '$.detections[*].confidence ? (@.type() == "number")',
};

function predictionConfidence(taskType: DatasetTaskType) {
  return sql`(select max(confidence::double precision) from jsonb_path_query(${datasetItem.originalResult}, ${PREDICTION_CONFIDENCE_PATHS[taskType]}::jsonpath) as confidence)`;
}

/** The conditions of the dataset evidence filters, whose dates are whole UTC days. */
function datasetItemFilterCondition(taskType: DatasetTaskType, filters: DatasetItemFilters) {
  const capturedFrom = filters.capturedFrom
    ? new Date(`${filters.capturedFrom}T00:00:00.000Z`)
    : undefined;
  const capturedBefore = filters.capturedTo
    ? new Date(`${filters.capturedTo}T00:00:00.000Z`)
    : undefined;
  capturedBefore?.setUTCDate(capturedBefore.getUTCDate() + 1);
  return and(
    filters.status ? eq(datasetItem.reviewStatus, filters.status) : undefined,
    filters.workflowId ? eq(sdkEvidence.workflowId, filters.workflowId) : undefined,
    filters.modelId ? eq(sdkEvidence.modelId, filters.modelId) : undefined,
    capturedFrom ? gte(sdkEvidence.capturedAt, capturedFrom) : undefined,
    capturedBefore ? lt(sdkEvidence.capturedAt, capturedBefore) : undefined,
    filters.minConfidence === undefined
      ? undefined
      : sql`${predictionConfidence(taskType)} >= ${filters.minConfidence}`,
    filters.maxConfidence === undefined
      ? undefined
      : sql`${predictionConfidence(taskType)} <= ${filters.maxConfidence}`,
  );
}

const itemEvidenceJoin = and(
  eq(sdkEvidence.applicationId, datasetItem.applicationId),
  eq(sdkEvidence.evidenceId, datasetItem.evidenceId),
);

/** The workflows and models of every item in the dataset, unfiltered, for the filter choices. */
async function getDatasetFilterOptions(
  tx: DatasetReadExecutor,
  datasetScope: ReturnType<typeof and>,
): Promise<DatasetFilterOptions> {
  const workflows = (await tx
    .select({ id: sdkEvidence.workflowId, name: workflow.name })
    .from(datasetItem)
    .innerJoin(sdkEvidence, itemEvidenceJoin)
    .innerJoin(workflow, eq(workflow.id, sdkEvidence.workflowId))
    .where(datasetScope)
    .groupBy(sdkEvidence.workflowId, workflow.name)
    .orderBy(asc(workflow.name), asc(sdkEvidence.workflowId))) as { id: string; name: string }[];
  // The model ID is a snapshot without a foreign key, so a deleted model keeps its ID as name.
  const modelName = sql<string>`coalesce(${model.name}, ${sdkEvidence.modelId})`;
  const models = (await tx
    .select({ id: sdkEvidence.modelId, name: modelName })
    .from(datasetItem)
    .innerJoin(sdkEvidence, itemEvidenceJoin)
    .leftJoin(
      model,
      and(eq(model.applicationId, sdkEvidence.applicationId), eq(model.id, sdkEvidence.modelId)),
    )
    .where(datasetScope)
    .groupBy(sdkEvidence.modelId, model.name)
    .orderBy(asc(modelName), asc(sdkEvidence.modelId))) as { id: string; name: string }[];
  return { workflows, models };
}

/**
 * A page of the dataset's items. The filters (US-083) apply only to this
 * dataset's items and before paginating, so `offset` and `nextItemOffset`
 * count filtered items; the dataset counts stay those of the whole dataset.
 */
export async function getDataset(
  database: ApplicationDatabase,
  applicationId: string,
  datasetId: string,
  offset = 0,
  filters: DatasetItemFilters = {},
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
    const datasetScope = and(
      eq(datasetItem.applicationId, applicationId),
      eq(datasetItem.datasetId, datasetId),
    );
    const items = (await tx
      .select(datasetItemFields)
      .from(datasetItem)
      .innerJoin(sdkEvidence, itemEvidenceJoin)
      .leftJoin(user, eq(user.id, datasetItem.reviewedBy))
      .where(and(datasetScope, datasetItemFilterCondition(row.taskType, filters)))
      .orderBy(asc(datasetItem.addedAt), asc(datasetItem.id))
      .limit(DATASET_EVIDENCE_PAGE_SIZE + 1)
      .offset(offset)) as DatasetItemRow[];
    const hasMore = items.length > DATASET_EVIDENCE_PAGE_SIZE;
    const page = hasMore ? items.slice(0, DATASET_EVIDENCE_PAGE_SIZE) : items;
    return {
      dataset: toDatasetListItem(row),
      items: await Promise.all(page.map(toDatasetItem)),
      nextItemOffset: hasMore ? offset + page.length : null,
      filterOptions: await getDatasetFilterOptions(tx, datasetScope),
    };
  });
}

export async function getDatasetItem(
  database: ApplicationDatabase,
  applicationId: string,
  datasetId: string,
  itemId: string,
): Promise<DatasetItem | null> {
  return database.transaction(async (transaction) => {
    const tx = transaction as DatasetReadExecutor;
    const rows = (await tx
      .select(datasetItemFields)
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
        and(
          eq(datasetItem.applicationId, applicationId),
          eq(datasetItem.datasetId, datasetId),
          eq(datasetItem.id, itemId),
        ),
      )
      .limit(1)) as DatasetItemRow[];
    return rows[0] ? toDatasetItem(rows[0]) : null;
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
                reviewedAnnotations: null,
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

type DatasetItemLocator = {
  applicationId: string;
  datasetId: string;
  itemId: string;
  userId: string;
};

export type SaveDatasetItemLabelInput = DatasetItemLocator & DatasetLabelRequest;

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
  const result = await saveReviewedGroundTruth(
    database,
    input,
    "classification",
    { reviewedLabel: input.label.trim() },
    "Failed to save dataset item label",
  );
  if (result.ok) return result;
  return {
    ok: false,
    reason: result.reason === "wrongTaskType" ? "notClassification" : result.reason,
  };
}

export type SaveDatasetItemAnnotationsInput = DatasetItemLocator & DatasetAnnotationsRequest;

export type SaveDatasetItemAnnotationsResult =
  | { ok: true; value: DatasetAnnotationsResponse }
  | { ok: false; reason: "notFound" | "notDetection" | "databaseFailed" };

/**
 * Replaces the reviewed detection boxes of a dataset item (US-082) in their
 * own column, so `originalResult` keeps the model's prediction unchanged. The
 * request schema already kept every box inside the image (coordinates from 0
 * to 1 of its width and height). Any workspace member may correct them.
 */
export async function saveDatasetItemAnnotations(
  database: ApplicationDatabase,
  input: SaveDatasetItemAnnotationsInput,
): Promise<SaveDatasetItemAnnotationsResult> {
  const result = await saveReviewedGroundTruth(
    database,
    input,
    "detection",
    { reviewedAnnotations: input.annotations },
    "Failed to save dataset item annotations",
  );
  if (result.ok) return result;
  return {
    ok: false,
    reason: result.reason === "wrongTaskType" ? "notDetection" : result.reason,
  };
}

/**
 * Writes a person's ground truth on a dataset item whose dataset has the given
 * task type, leaving the rest of the item, its prediction included, untouched.
 */
async function saveReviewedGroundTruth<
  Values extends Pick<
    Partial<typeof datasetItem.$inferInsert>,
    "reviewedLabel" | "reviewedAnnotations"
  >,
>(
  database: ApplicationDatabase,
  input: DatasetItemLocator,
  taskType: DatasetTaskType,
  values: Values,
  failureMessage: string,
): Promise<
  | { ok: true; value: Values }
  | { ok: false; reason: "notFound" | "wrongTaskType" | "databaseFailed" }
> {
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
        if (item.taskType !== taskType) return "wrongTaskType" as const;

        // The task type never changes, so no lock is needed: an item removed
        // meanwhile simply updates no row.
        const updated = await tx
          .update(datasetItem)
          .set(values)
          .where(itemCondition)
          .returning({ id: datasetItem.id });
        return updated.length ? values : ("notFound" as const);
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
      failureMessage,
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
