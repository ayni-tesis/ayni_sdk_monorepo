import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";
import { user } from "./auth";

/**
 * The telemetry policy of one application (US-100). An application without a
 * row has telemetry disabled. The table has no column for images or raw inputs
 * on purpose: telemetry never authorizes collecting them.
 */
export const applicationTelemetryPolicy = pgTable(
  "application_telemetry_policy",
  {
    applicationId: text("application_id")
      .primaryKey()
      .references(() => application.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    retentionDays: integer("retention_days").default(30).notNull(),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "application_telemetry_policy_retention_days_check",
      sql`${table.retentionDays} in (7, 30, 90)`,
    ),
  ],
);
