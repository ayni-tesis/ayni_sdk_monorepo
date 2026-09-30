import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";

/** Append-only, pseudonymous receipts for optional Ayni-owned processing. */
export const sdkConsentReceipt = pgTable(
  "sdk_consent_receipt",
  {
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    receiptId: text("receipt_id").notNull(),
    subjectId: text("subject_id").notNull(),
    purpose: text("purpose").notNull(),
    decision: text("decision").notNull(),
    noticeVersion: text("notice_version").notNull(),
    decidedAt: timestamp("decided_at").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.applicationId, table.receiptId] }),
    index("sdk_consent_receipt_subject_purpose_idx").on(
      table.applicationId,
      table.subjectId,
      table.purpose,
      table.receivedAt,
    ),
    check(
      "sdk_consent_receipt_purpose_check",
      sql`${table.purpose} in ('ayniModelImprovement', 'ayniSdkImprovement')`,
    ),
    check("sdk_consent_receipt_decision_check", sql`${table.decision} in ('accepted', 'declined')`),
  ],
);
