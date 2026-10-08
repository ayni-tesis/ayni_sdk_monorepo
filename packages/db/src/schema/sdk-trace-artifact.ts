import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sdkTrace } from "./sdk-trace";

/** Private binary source artifacts attached to an application's retained trace. */
export const sdkTraceArtifact = pgTable(
  "sdk_trace_artifact",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: text("application_id").notNull(),
    traceId: text("trace_id").notNull(),
    logicalName: text("logical_name").notNull(),
    producerTool: text("producer_tool"),
    producerVersion: text("producer_version"),
    format: text("format"),
    byteLength: bigint("byte_length", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").default("pending").notNull(),
    stagingStorageKey: text("staging_storage_key"),
    storageKey: text("storage_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    uploadExpiresAt: timestamp("upload_expires_at").notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId, table.traceId],
      foreignColumns: [sdkTrace.applicationId, sdkTrace.traceId],
      name: "sdk_trace_artifact_trace_fk",
    }).onDelete("cascade"),
    check(
      "sdk_trace_artifact_status_check",
      sql`${table.status} in ('pending', 'verifying', 'completed')`,
    ),
    check(
      "sdk_trace_artifact_completion_check",
      sql`(${table.status} in ('pending', 'verifying') and ${table.stagingStorageKey} is not null and ${table.storageKey} is null and ${table.completedAt} is null and ${table.format} is null) or (${table.status} = 'completed' and ${table.storageKey} is not null and ${table.completedAt} is not null and ${table.format} = 'perfetto_trace_proto')`,
    ),
    check(
      "sdk_trace_artifact_byte_length_check",
      sql`${table.byteLength} > 0 and ${table.byteLength} <= 5363340410`,
    ),
    check("sdk_trace_artifact_sha256_check", sql`${table.sha256} ~ '^[a-fA-F0-9]{64}$'`),
    index("sdk_trace_artifact_trace_idx").on(table.applicationId, table.traceId),
    index("sdk_trace_artifact_upload_expiry_idx").on(table.uploadExpiresAt),
  ],
);
