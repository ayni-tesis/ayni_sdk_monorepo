import type {
  Dataset,
  DatasetAvailableEvidenceResponse,
  DatasetDetailResponse,
  DatasetEvidence,
  DatasetItem,
  DatasetListItem,
  DatasetListResponse,
  DatasetTaskType,
} from "@ayni/api/datasets";
import { dataset, datasetItem, sdkEvidence } from "@ayni/db/schema/index";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  type ApplicationDatabase,
  executeApplicationAction,
  type TransactionExecutor,
} from "./application-actions";
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
};

type DatasetEvidenceRow = {
  evidenceId: string;
  modelId: string;
  modelVersion: string;
  taskType: DatasetTaskType;
  result: Record<string, unknown>;
  capturedAt: Date | string;
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
  insert: (table: unknown) => {
    values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
      returning: (fields?: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
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
};

const DATASET_EVIDENCE_PAGE_SIZE = 50;

function toDatasetListItem(row: DatasetRow): DatasetListItem {
  return {
    ...row,
    createdAt: toIsoString(row.createdAt),
    evidenceCount: row.evidenceCount,
    // ponytail: review totals remain zero until the review workflow adds item states.
    approvedCount: 0,
  };
}

function toDatasetItem(row: DatasetItemRow): DatasetItem {
  return {
    ...row,
    capturedAt: toIsoString(row.capturedAt),
    addedAt: toIsoString(row.addedAt),
  };
}

function toDatasetEvidence(row: DatasetEvidenceRow): DatasetEvidence {
  return { ...row, capturedAt: toIsoString(row.capturedAt) };
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
        and(eq(datasetItem.applicationId, applicationId), eq(datasetItem.datasetId, datasetId)),
      )
      .orderBy(asc(datasetItem.addedAt), asc(datasetItem.id))
      .limit(DATASET_EVIDENCE_PAGE_SIZE + 1)
      .offset(offset)) as DatasetItemRow[];
    const hasMore = items.length > DATASET_EVIDENCE_PAGE_SIZE;
    const page = hasMore ? items.slice(0, DATASET_EVIDENCE_PAGE_SIZE) : items;
    return {
      dataset: toDatasetListItem(row),
      items: page.map(toDatasetItem),
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
          })
          .from(sdkEvidence)
          .where(
            and(
              eq(sdkEvidence.applicationId, input.applicationId),
              inArray(sdkEvidence.evidenceId, uniqueIds),
            ),
          )) as (DatasetEvidenceRow & { status: string })[];
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
          })) as Omit<DatasetItemRow, "modelId" | "modelVersion" | "taskType" | "capturedAt">[];
        if (inserted.length !== rows.length)
          throw new Error("Dataset evidence insert returned no record");

        const evidenceById = new Map(rows.map((row) => [row.evidenceId, row]));
        return {
          kind: "added",
          items: inserted.map((item) => {
            const evidence = evidenceById.get(item.evidenceId);
            if (!evidence) throw new Error("Dataset evidence metadata was not found");
            return {
              ...item,
              modelId: evidence.modelId,
              modelVersion: evidence.modelVersion,
              taskType: evidence.taskType,
              capturedAt: toIsoString(evidence.capturedAt),
              addedAt: toIsoString(item.addedAt),
            };
          }),
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
