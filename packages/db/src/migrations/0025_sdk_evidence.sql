CREATE TABLE "sdk_evidence" (
	"application_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"workflow_version_id" text NOT NULL,
	"capture_node_id" text NOT NULL,
	"model_id" text NOT NULL,
	"model_version_id" text NOT NULL,
	"model_version" text NOT NULL,
	"model_sha256" text NOT NULL,
	"task_type" text NOT NULL,
	"result" jsonb NOT NULL,
	"captured_at" timestamp NOT NULL,
	"image_media_type" text NOT NULL,
	"image_width" integer NOT NULL,
	"image_height" integer NOT NULL,
	"image_byte_size" bigint NOT NULL,
	"image_sha256" text NOT NULL,
	"max_image_size" integer NOT NULL,
	"image_quality" integer NOT NULL,
	"storage_key" text NOT NULL,
	"content_sha256" text NOT NULL,
	"status" text DEFAULT 'awaitingUpload' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"received_at" timestamp,
	CONSTRAINT "sdk_evidence_application_id_evidence_id_pk" PRIMARY KEY("application_id","evidence_id"),
	CONSTRAINT "sdk_evidence_status_check" CHECK ("sdk_evidence"."status" in ('awaitingUpload', 'received')),
	CONSTRAINT "sdk_evidence_received_at_check" CHECK (("sdk_evidence"."status" = 'received') = ("sdk_evidence"."received_at" is not null)),
	CONSTRAINT "sdk_evidence_task_type_check" CHECK ("sdk_evidence"."task_type" in ('classification', 'detection')),
	CONSTRAINT "sdk_evidence_image_sha256_check" CHECK ("sdk_evidence"."image_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sdk_evidence_image_byte_size_check" CHECK ("sdk_evidence"."image_byte_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "sdk_evidence" ADD CONSTRAINT "sdk_evidence_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdk_evidence" ADD CONSTRAINT "sdk_evidence_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdk_evidence" ADD CONSTRAINT "sdk_evidence_workflow_version_id_workflow_version_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sdk_evidence_application_received_idx" ON "sdk_evidence" USING btree ("application_id","received_at");--> statement-breakpoint
CREATE INDEX "sdk_evidence_workflow_version_idx" ON "sdk_evidence" USING btree ("workflow_version_id");