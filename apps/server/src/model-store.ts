import { model, modelVersion } from "@ayni/db/schema/index";
import { and, asc, eq, sql } from "drizzle-orm";
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
  versionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ModelRow = {
  id: string;
  applicationId: string;
  name: string;
  runtime: string;
  versionCount?: number | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function toModel(row: ModelRow): Model {
  return {
    id: row.id,
    applicationId: row.applicationId,
    name: row.name,
    runtime: "tensorflow_lite",
    versionCount: Number(row.versionCount ?? 0),
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

export type RenameModelInput = {
  applicationId: string;
  modelId: string;
  userId: string;
  name: string;
};

export type RenamedModel = Omit<Model, "versionCount">;

export type RenameModelResult =
  | { ok: true; model: RenamedModel }
  | { ok: false; reason: "forbidden" | "notFound" | "archived" | "modelNotFound" };

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

  if (result.ok === false) return result;
  return { ok: true, model: result.value };
}

type ModelUpdateExecutor = TransactionExecutor & {
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => { returning: () => Promise<Record<string, unknown>[]> };
    };
  };
};

/** Renames a model without touching its identity, runtime, or stored versions. */
export async function renameModel(
  database: ModelDatabase,
  { applicationId, modelId, userId, name }: RenameModelInput,
): Promise<RenameModelResult> {
  const result = await executeApplicationAction(
    database,
    { applicationId, userId },
    async (tx, authorizedApplication) => {
      const updater = tx as ModelUpdateExecutor;
      const rows = await updater
        .update(model)
        .set({ name })
        .where(and(eq(model.id, modelId), eq(model.applicationId, authorizedApplication.id)))
        .returning();
      return rows[0] as ModelRow | undefined;
    },
  );

  if (result.ok === false) return result;
  if (!result.value) return { ok: false, reason: "modelNotFound" };

  return {
    ok: true,
    model: {
      id: result.value.id,
      applicationId: result.value.applicationId,
      name: result.value.name,
      runtime: "tensorflow_lite",
      createdAt: toIsoString(result.value.createdAt),
      updatedAt: toIsoString(result.value.updatedAt),
    },
  };
}

type ListModelsExecutor = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        orderBy: (column: unknown) => Promise<Record<string, unknown>[]>;
      };
    };
  };
};

/**
 * Lists the models registered in an application (metadata only, never model
 * files) with the number of stored versions per model, oldest first.
 */
export async function listModels(database: ModelDatabase, applicationId: string): Promise<Model[]> {
  return database.transaction(async (transaction) => {
    const tx = transaction as ListModelsExecutor;

    const rows = (await tx
      .select({
        id: model.id,
        applicationId: model.applicationId,
        name: model.name,
        runtime: model.runtime,
        versionCount: sql<number>`(select count(*)::int from ${modelVersion} where ${modelVersion.modelId} = ${model.id})`,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      })
      .from(model)
      .where(eq(model.applicationId, applicationId))
      .orderBy(asc(model.createdAt))) as ModelRow[];

    return rows.map(toModel);
  });
}
