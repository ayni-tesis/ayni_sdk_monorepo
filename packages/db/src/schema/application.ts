import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization } from "./auth";

export const application = pgTable(
  "application",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("application_organization_id_idx").on(table.organizationId)],
);
