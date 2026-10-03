import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { application } from "./application";

/** Client-reported workflow traces accepted for one application's telemetry policy. */
export const sdkTrace = pgTable(
  "sdk_trace",
  {
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    traceId: text("trace_id").notNull(),
    contentSha256: text("content_sha256").notNull(),
    trace: jsonb("trace").$type<Record<string, unknown>>().notNull(),
    modelReferences: jsonb("model_references")
      .$type<Array<{ modelId: string; modelVersionId: string; version: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    source: text("source").default("clientReported").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.applicationId, table.traceId] }),
    index("sdk_trace_expires_at_idx").on(table.expiresAt),
    index("sdk_trace_application_received_idx").on(table.applicationId, table.receivedAt),
    index("sdk_trace_model_references_gin_idx").using("gin", table.modelReferences),
  ],
);
