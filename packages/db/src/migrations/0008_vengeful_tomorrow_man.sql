CREATE TABLE "model_version" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"version" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"uploaded_by_id" text,
	CONSTRAINT "model_version_version_check" CHECK ("model_version"."version" ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'),
	CONSTRAINT "model_version_sha256_check" CHECK ("model_version"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "model_version_size_bytes_check" CHECK ("model_version"."size_bytes" >= 12)
);
--> statement-breakpoint
ALTER TABLE "model_version" ADD CONSTRAINT "model_version_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_version" ADD CONSTRAINT "model_version_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_version_model_id_version_idx" ON "model_version" USING btree ("model_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "model_version_storage_key_idx" ON "model_version" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "model_version_model_id_idx" ON "model_version" USING btree ("model_id");