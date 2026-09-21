import { model } from "@ayni/db/schema/index";
import {
  type ApplicationDatabase,
  executeApplicationAction,
  type TransactionExecutor,
} from "./application-actions";

export type { TransactionExecutor };
export type ModelDatabase = ApplicationDatabase;

export type Model = {
  id: string;
  applicationId: string;
  name: string;
  runtime: "tensorflow_lite";
  createdAt: string;
  updatedAt: string;
};

export type ModelRow = {
  id: string;
  applicationId: string;
  name: string;
  runtime: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function toModel(row: ModelRow): Model {
  return {
    id: row.id,
    applicationId: row.applicationId,
    name: row.name,
    runtime: "tensorflow_lite",
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

export type CreateModelResult =
  | { ok: true; model: Model }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" };

export type CreateModelInput = {
  applicationId: string;
  userId: string;
  name: string;
  runtime: "tensorflow_lite";
};

export async function createModel(
  database: ModelDatabase,
  { applicationId, userId, name, runtime }: CreateModelInput,
): Promise<CreateModelResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, application) => {
      const modelRows = (await tx
        .insert(model)
        .values({
          id: crypto.randomUUID(),
          applicationId: application.id,
          name,
          runtime,
        })
        .returning()) as {
        id: string;
        applicationId: string;
        name: string;
        runtime: string;
        createdAt: Date | string;
        updatedAt: Date | string;
      }[];
      const created = modelRows[0];

      if (!created) throw new Error("Model creation returned no record");

      return toModel(created);
    },
  );

  if (!result.ok) return result;
  return { ok: true, model: result.value };
}
