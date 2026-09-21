import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { model } from "./model";

export const modelVersion = pgTable(
  "model_version",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => model.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("model_version_model_id_version_idx").on(table.modelId, table.version),
    uniqueIndex("model_version_storage_key_idx").on(table.storageKey),
    index("model_version_model_id_idx").on(table.modelId),
    check(
      "model_version_version_check",
      sql`${table.version} ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'`,
    ),
    check("model_version_sha256_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("model_version_size_bytes_check", sql`${table.sizeBytes} >= 12`),
  ],
);
