import type {
  Dataset,
  DatasetListItem,
  DatasetListResponse,
  DatasetTaskType,
} from "@ayni/api/datasets";
import { dataset } from "@ayni/db/schema/index";
import { and, asc, eq } from "drizzle-orm";
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
};

type DatasetReadExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        orderBy: (...columns: unknown[]) => Promise<Record<string, unknown>[]>;
        limit: (count: number) => Promise<Record<string, unknown>[]>;
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
};

function toDatasetListItem(row: DatasetRow): DatasetListItem {
  return {
    ...row,
    createdAt: toIsoString(row.createdAt),
    // ponytail: counts stay zero until the evidence flow links records to datasets; aggregate then.
    evidenceCount: 0,
    approvedCount: 0,
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
): Promise<DatasetListItem | null> {
  return database.transaction(async (transaction) => {
    const tx = transaction as DatasetReadExecutor;
    const rows = (await tx
      .select(datasetFields)
      .from(dataset)
      .where(and(eq(dataset.applicationId, applicationId), eq(dataset.id, datasetId)))
      .limit(1)) as DatasetRow[];
    return rows[0] ? toDatasetListItem(rows[0]) : null;
  });
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
