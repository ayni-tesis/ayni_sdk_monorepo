import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";
import { user } from "./auth";

/** The administrator-maintained inventory of personal-data treatments for an application. */
export const applicationPrivacyTreatmentMap = pgTable("application_privacy_treatment_map", {
  applicationId: text("application_id")
    .primaryKey()
    .references(() => application.id, { onDelete: "cascade" }),
  treatments: jsonb("treatments").$type<Record<string, unknown>[]>().default([]).notNull(),
  latestPublishedVersion: integer("latest_published_version").default(0).notNull(),
  updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
