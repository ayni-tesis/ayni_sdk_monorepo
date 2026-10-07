import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { dataset } from "./dataset";

export const datasetExport = pgTable(
  "dataset_export",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id").notNull(),
    datasetId: text("dataset_id").notNull(),
    version: integer("version").notNull(),
    format: text("format", { enum: ["classification_images_csv"] }).notNull(),
    status: text("status", { enum: ["ready"] }).notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    itemCount: integer("item_count").notNull(),
    storageKey: text("storage_key").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId, table.datasetId],
      foreignColumns: [dataset.applicationId, dataset.id],
      name: "dataset_export_application_dataset_fkey",
    }).onDelete("cascade"),
    uniqueIndex("dataset_export_application_dataset_version_unique").on(
      table.applicationId,
      table.datasetId,
      table.version,
    ),
    check("dataset_export_version_check", sql`${table.version} > 0`),
    check("dataset_export_format_check", sql`${table.format} = 'classification_images_csv'`),
    check("dataset_export_status_check", sql`${table.status} = 'ready'`),
    check("dataset_export_item_count_check", sql`${table.itemCount} > 0`),
  ],
);
