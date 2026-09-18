import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

export const invitationLink = pgTable(
  "invitation_link",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
    status: text("status", { enum: ["pending", "accepted"] })
      .default("pending")
      .notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("invitation_link_token_idx").on(table.token),
    index("invitation_link_organization_id_idx").on(table.organizationId),
    check("invitation_link_status_check", sql`${table.status} in ('pending', 'accepted')`),
    check("invitation_link_role_check", sql`${table.role} in ('admin', 'member')`),
  ],
);
