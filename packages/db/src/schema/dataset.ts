import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";

export const dataset = pgTable(
  "dataset",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    taskType: text("task_type", { enum: ["classification", "detection"] }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("dataset_application_id_idx").on(table.applicationId),
    check("dataset_task_type_check", sql`${table.taskType} in ('classification', 'detection')`),
  ],
);
