import type { Dataset, DatasetTaskType } from "@ayni/api/datasets";
import { dataset } from "@ayni/db/schema/index";
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
