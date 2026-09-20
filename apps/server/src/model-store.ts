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

      return {
        id: created.id,
        applicationId: created.applicationId,
        name: created.name,
        runtime: "tensorflow_lite" as const,
        createdAt:
          created.createdAt instanceof Date
            ? created.createdAt.toISOString()
            : String(created.createdAt),
        updatedAt:
          created.updatedAt instanceof Date
            ? created.updatedAt.toISOString()
            : String(created.updatedAt),
      };
    },
  );

  if (!result.ok) return result;
  return { ok: true, model: result.value };
}
