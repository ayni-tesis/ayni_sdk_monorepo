import { model } from "@ayni/db/schema/index";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { listModels, type ModelDatabase } from "./model-store";

describe("listModels", () => {
  it("counts the versions of each model, not of every version", async () => {
    let fields: Record<string, unknown> | undefined;
    const tx = {
      select(selection: Record<string, unknown>) {
        fields = selection;
        const query = Object.assign(Promise.resolve([]), {
          from: (): unknown => query,
          where: (): unknown => query,
          orderBy: (): unknown => query,
        });
        return query;
      },
    };
    await listModels(
      {
        transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
      } as unknown as ModelDatabase,
      "app-1",
    );
    if (!fields) throw new Error("The models were not selected");

    // Selecting from `model` alone, as Postgres receives it.
    const query = new QueryBuilder()
      .select(fields as Parameters<QueryBuilder["select"]>[0])
      .from(model)
      .toSQL().sql;

    expect(query).toContain(
      '(select count(*)::int from "model_version" where "model_version"."model_id" = "model"."id")',
    );
  });
});
