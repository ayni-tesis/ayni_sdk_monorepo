import { sql } from "drizzle-orm";
import {
  check,
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
    reviewStatus: text("review_status", { enum: ["pending", "approved", "rejected"] })
      .default("pending")
      .notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    reviewReason: text("review_reason"),
    /**
     * The classification label a person assigned (US-081): the ground truth that
     * validation and exports read instead of the model's prediction, which stays
     * untouched in `originalResult`. Null until someone assigns it.
     */
    reviewedLabel: text("reviewed_label"),
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
    check(
      "dataset_item_review_status_check",
      sql`${table.reviewStatus} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      "dataset_item_reviewed_at_check",
      sql`(${table.reviewStatus} = 'pending') = (${table.reviewedAt} is null)`,
    ),
    check(
      "dataset_item_review_reason_check",
      sql`(${table.reviewStatus} = 'rejected') or (${table.reviewReason} is null)`,
    ),
    check(
      "dataset_item_reviewed_label_check",
      sql`${table.reviewedLabel} is null or char_length(btrim(${table.reviewedLabel})) between 1 and 160`,
    ),
  ],
);
