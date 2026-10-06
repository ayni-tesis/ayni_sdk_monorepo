import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { dataset } from "./dataset";
import { sdkEvidence } from "./sdk-evidence";

export const datasetItem = pgTable(
  "dataset_item",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id").notNull(),
    datasetId: text("dataset_id").notNull(),
    evidenceId: text("evidence_id").notNull(),
    originalResult: jsonb("original_result").$type<Record<string, unknown>>().notNull(),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId, table.datasetId],
      foreignColumns: [dataset.applicationId, dataset.id],
      name: "dataset_item_application_dataset_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.applicationId, table.evidenceId],
      foreignColumns: [sdkEvidence.applicationId, sdkEvidence.evidenceId],
      name: "dataset_item_application_evidence_fkey",
    }).onDelete("cascade"),
    uniqueIndex("dataset_item_application_dataset_evidence_unique").on(
      table.applicationId,
      table.datasetId,
      table.evidenceId,
    ),
    index("dataset_item_application_dataset_added_idx").on(
      table.applicationId,
      table.datasetId,
      table.addedAt,
    ),
  ],
);
