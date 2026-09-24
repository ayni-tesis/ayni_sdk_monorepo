import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { workflow } from "./workflow";

/**
 * An immutable, published snapshot of a workflow's validated DAG. Rows are
 * only ever inserted; nothing updates a published version.
 */
export const workflowVersion = pgTable(
  "workflow_version",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    definition: jsonb("definition").$type<{ nodes: unknown[]; connections: unknown[] }>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    publishedById: text("published_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("workflow_version_workflow_id_version_idx").on(table.workflowId, table.version),
    index("workflow_version_workflow_id_idx").on(table.workflowId),
    check(
      "workflow_version_version_check",
      sql`${table.version} ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'`,
    ),
  ],
);
