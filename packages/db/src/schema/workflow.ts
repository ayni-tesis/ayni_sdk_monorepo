import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";

export const workflow = pgTable(
  "workflow",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", { enum: ["draft"] })
      .default("draft")
      .notNull(),
    draft: jsonb("draft")
      .$type<{ nodes: { id: string; type: "input.image"; outputs: { imagen: "image" } }[] }>()
      .default({ nodes: [] })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workflow_application_id_idx").on(table.applicationId),
    check("workflow_status_check", sql`${table.status} in ('draft')`),
  ],
);
