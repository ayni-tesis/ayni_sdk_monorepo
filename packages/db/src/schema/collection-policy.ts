import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";
import { user } from "./auth";

/**
 * The evidence collection policy of one application (US-063). An application
 * without a row has collection disabled. A row can only enable collection
 * together with an explicit consent configuration.
 */
export const applicationCollectionPolicy = pgTable(
  "application_collection_policy",
  {
    applicationId: text("application_id")
      .primaryKey()
      .references(() => application.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    consentRequired: boolean("consent_required").default(false).notNull(),
    network: text("network").default("wifi").notNull(),
    maxImageSize: integer("max_image_size").default(1024).notNull(),
    imageQuality: integer("image_quality").default(80).notNull(),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "application_collection_policy_consent_check",
      sql`not ${table.enabled} or ${table.consentRequired}`,
    ),
    check(
      "application_collection_policy_network_check",
      sql`${table.network} in ('wifi', 'wifiAndCellular')`,
    ),
    check(
      "application_collection_policy_max_image_size_check",
      sql`${table.maxImageSize} between 128 and 4096`,
    ),
    check(
      "application_collection_policy_image_quality_check",
      sql`${table.imageQuality} between 10 and 100`,
    ),
  ],
);
