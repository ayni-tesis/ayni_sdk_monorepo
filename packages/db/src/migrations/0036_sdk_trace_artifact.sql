CREATE TABLE "sdk_trace_artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"logical_name" text NOT NULL,
	"producer_tool" text,
	"producer_version" text,
	"format" text,
	"byte_length" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"staging_storage_key" text,
	"storage_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"upload_expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "sdk_trace_artifact_status_check" CHECK ("sdk_trace_artifact"."status" in ('pending', 'verifying', 'completed')),
	CONSTRAINT "sdk_trace_artifact_completion_check" CHECK (("sdk_trace_artifact"."status" in ('pending', 'verifying') and "sdk_trace_artifact"."staging_storage_key" is not null and "sdk_trace_artifact"."storage_key" is null and "sdk_trace_artifact"."completed_at" is null and "sdk_trace_artifact"."format" is null) or ("sdk_trace_artifact"."status" = 'completed' and "sdk_trace_artifact"."storage_key" is not null and "sdk_trace_artifact"."completed_at" is not null and "sdk_trace_artifact"."format" = 'perfetto_trace_proto')),
	CONSTRAINT "sdk_trace_artifact_byte_length_check" CHECK ("sdk_trace_artifact"."byte_length" > 0 and "sdk_trace_artifact"."byte_length" <= 5363340410),
	CONSTRAINT "sdk_trace_artifact_sha256_check" CHECK ("sdk_trace_artifact"."sha256" ~ '^[a-fA-F0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "sdk_trace_artifact" ADD CONSTRAINT "sdk_trace_artifact_trace_fk" FOREIGN KEY ("application_id","trace_id") REFERENCES "public"."sdk_trace"("application_id","trace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sdk_trace_artifact_trace_idx" ON "sdk_trace_artifact" USING btree ("application_id","trace_id");--> statement-breakpoint
CREATE INDEX "sdk_trace_artifact_upload_expiry_idx" ON "sdk_trace_artifact" USING btree ("upload_expires_at");