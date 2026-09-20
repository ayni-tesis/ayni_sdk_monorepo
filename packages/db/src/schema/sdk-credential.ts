import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { application } from "./application";

export const sdkCredential = pgTable(
  "sdk_credential",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull(),
    prefix: text("prefix"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    uniqueIndex("sdk_credential_secret_hash_idx").on(table.secretHash),
    index("sdk_credential_application_id_idx").on(table.applicationId),
  ],
);
