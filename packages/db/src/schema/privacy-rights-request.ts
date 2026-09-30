import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";
import { user } from "./auth";

export const applicationPrivacyRightsRequest = pgTable(
  "application_privacy_rights_request",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    noticeVersion: integer("notice_version").notNull(),
    treatmentId: text("treatment_id").notNull(),
    purpose: text("purpose").notNull(),
    responsibleEntity: text("responsible_entity").notNull(),
    rightsChannel: text("rights_channel").notNull(),
    type: text("type").notNull(),
    contactEmail: text("contact_email").notNull(),
    details: text("details").default("").notNull(),
    status: text("status").default("received").notNull(),
    response: text("response").default("").notNull(),
    reason: text("reason").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("application_privacy_rights_request_app_created_idx").on(
      table.applicationId,
      table.createdAt,
    ),
    check(
      "application_privacy_rights_request_type_check",
      sql`${table.type} in ('access', 'rectification', 'cancellation', 'opposition', 'portability')`,
    ),
    check(
      "application_privacy_rights_request_status_check",
      sql`${table.status} in ('received', 'inReview', 'answered', 'notApplicable')`,
    ),
    check(
      "application_privacy_rights_request_resolution_check",
      sql`(${table.status} != 'answered' or ${table.response} <> '') and (${table.status} != 'notApplicable' or ${table.reason} <> '')`,
    ),
  ],
);

export const applicationPrivacyRightsRequestEvent = pgTable(
  "application_privacy_rights_request_event",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => applicationPrivacyRightsRequest.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    previousStatus: text("previous_status"),
    nextStatus: text("next_status"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("application_privacy_rights_request_event_request_idx").on(
      table.requestId,
      table.occurredAt,
    ),
    check(
      "application_privacy_rights_request_event_action_check",
      sql`${table.action} in ('created', 'viewed', 'statusChanged')`,
    ),
  ],
);
