import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";

export const model = pgTable(
  "model",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    runtime: text("runtime", { enum: ["tensorflow_lite"] }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("model_application_id_idx").on(table.applicationId),
    check("model_runtime_check", sql`${table.runtime} in ('tensorflow_lite')`),
  ],
);
