import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { application } from "./application";
import { user } from "./auth";

/** Immutable structured snapshot published from an application's treatment map. */
export const applicationPrivacyNoticeVersion = pgTable(
  "application_privacy_notice_version",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    treatments: jsonb("treatments").$type<Record<string, unknown>[]>().notNull(),
    publishedById: text("published_by_id").references(() => user.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at").defaultNow().notNull(),
  },
  (table) => [
    unique("application_privacy_notice_version_app_version_unique").on(
      table.applicationId,
      table.version,
    ),
    check("application_privacy_notice_version_positive_check", sql`${table.version} > 0`),
  ],
);
