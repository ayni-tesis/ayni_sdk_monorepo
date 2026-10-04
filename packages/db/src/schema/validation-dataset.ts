import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { application } from "./application";
import { user } from "./auth";

export const validationDataset = pgTable(
  "validation_dataset",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source").notNull(),
    license: text("license").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("validation_dataset_application_id_idx").on(table.applicationId),
    uniqueIndex("validation_dataset_application_name_unique").on(table.applicationId, table.name),
    check("validation_dataset_name_check", sql`length(trim(${table.name})) > 0`),
    check("validation_dataset_source_check", sql`length(trim(${table.source})) > 0`),
    check("validation_dataset_license_check", sql`length(trim(${table.license})) > 0`),
  ],
);

export const validationDatasetVersion = pgTable(
  "validation_dataset_version",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => validationDataset.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    partition: text("partition").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("validation_dataset_version_dataset_version_partition_idx").on(
      table.datasetId,
      table.version,
      table.partition,
    ),
    uniqueIndex("validation_dataset_version_storage_key_idx").on(table.storageKey),
    index("validation_dataset_version_dataset_id_idx").on(table.datasetId),
    check(
      "validation_dataset_version_version_check",
      sql`${table.version} ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'`,
    ),
    check(
      "validation_dataset_version_partition_check",
      sql`${table.partition} ~ '^[A-Za-z0-9._-]{1,64}$'`,
    ),
    check("validation_dataset_version_sha256_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("validation_dataset_version_size_bytes_check", sql`${table.sizeBytes} > 0`),
  ],
);
