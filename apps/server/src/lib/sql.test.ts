import { model, modelVersion } from "@ayni/db/schema/index";
import { sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { qualifiedColumn } from "./sql";

describe("qualifiedColumn", () => {
  it("keeps the table of a column in the SQL fields of a single-table select", () => {
    const query = new QueryBuilder()
      .select({
        plain: sql`${model.id}`,
        qualified: qualifiedColumn(model, model.id),
        inner: qualifiedColumn(modelVersion, modelVersion.modelId),
      })
      .from(model)
      .toSQL().sql;

    expect(query).toBe('select "id", "model"."id", "model_version"."model_id" from "model"');
  });
});
