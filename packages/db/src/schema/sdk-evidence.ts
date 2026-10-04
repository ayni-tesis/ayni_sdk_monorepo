import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { application } from "./application";
import { workflow } from "./workflow";
import { workflowVersion } from "./workflow-version";

/**
 * Evidence for datasets that the SDK uploads (US-070). `POST /sdk/evidence`
 * inserts the row with its metadata as `awaitingUpload`; it becomes `received`
 * only once the server checked the uploaded image and copied it to
 * `storage_key`. The evidence ID is unique within its application, so a retry
 * finds the same row. The model version is a snapshot, without a foreign key,
 * so deleting a model version keeps the evidence it produced.
 */
export const sdkEvidence = pgTable(
  "sdk_evidence",
  {
    applicationId: text("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    evidenceId: text("evidence_id").notNull(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    workflowVersionId: text("workflow_version_id")
      .notNull()
      .references(() => workflowVersion.id, { onDelete: "cascade" }),
    captureNodeId: text("capture_node_id").notNull(),
    modelId: text("model_id").notNull(),
    modelVersionId: text("model_version_id").notNull(),
    modelVersion: text("model_version").notNull(),
    modelSha256: text("model_sha256").notNull(),
    taskType: text("task_type").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    capturedAt: timestamp("captured_at").notNull(),
    imageMediaType: text("image_media_type").notNull(),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    imageByteSize: bigint("image_byte_size", { mode: "number" }).notNull(),
    imageSha256: text("image_sha256").notNull(),
    maxImageSize: integer("max_image_size").notNull(),
    imageQuality: integer("image_quality").notNull(),
    storageKey: text("storage_key").notNull(),
    contentSha256: text("content_sha256").notNull(),
    status: text("status").default("awaitingUpload").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    receivedAt: timestamp("received_at"),
  },
  (table) => [
    primaryKey({ columns: [table.applicationId, table.evidenceId] }),
    index("sdk_evidence_application_received_idx").on(table.applicationId, table.receivedAt),
    index("sdk_evidence_workflow_version_idx").on(table.workflowVersionId),
    check("sdk_evidence_status_check", sql`${table.status} in ('awaitingUpload', 'received')`),
    check(
      "sdk_evidence_received_at_check",
      sql`(${table.status} = 'received') = (${table.receivedAt} is not null)`,
    ),
    check(
      "sdk_evidence_task_type_check",
      sql`${table.taskType} in ('classification', 'detection')`,
    ),
    check("sdk_evidence_image_sha256_check", sql`${table.imageSha256} ~ '^[0-9a-f]{64}$'`),
    check("sdk_evidence_image_byte_size_check", sql`${table.imageByteSize} > 0`),
  ],
);
