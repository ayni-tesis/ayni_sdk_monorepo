CREATE TABLE "validation_dataset" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"license" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_id" text,
	CONSTRAINT "validation_dataset_name_check" CHECK (length(trim("validation_dataset"."name")) > 0),
	CONSTRAINT "validation_dataset_source_check" CHECK (length(trim("validation_dataset"."source")) > 0),
	CONSTRAINT "validation_dataset_license_check" CHECK (length(trim("validation_dataset"."license")) > 0)
);
--> statement-breakpoint
CREATE TABLE "validation_dataset_version" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"version" text NOT NULL,
	"partition" text NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"uploaded_by_id" text,
	CONSTRAINT "validation_dataset_version_version_check" CHECK ("validation_dataset_version"."version" ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'),
	CONSTRAINT "validation_dataset_version_partition_check" CHECK ("validation_dataset_version"."partition" ~ '^[A-Za-z0-9._-]{1,64}$'),
	CONSTRAINT "validation_dataset_version_sha256_check" CHECK ("validation_dataset_version"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "validation_dataset_version_size_bytes_check" CHECK ("validation_dataset_version"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "validation_dataset" ADD CONSTRAINT "validation_dataset_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_dataset" ADD CONSTRAINT "validation_dataset_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_dataset_version" ADD CONSTRAINT "validation_dataset_version_dataset_id_validation_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."validation_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_dataset_version" ADD CONSTRAINT "validation_dataset_version_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "validation_dataset_application_id_idx" ON "validation_dataset" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_dataset_version_dataset_version_partition_idx" ON "validation_dataset_version" USING btree ("dataset_id","version","partition");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_dataset_version_storage_key_idx" ON "validation_dataset_version" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "validation_dataset_version_dataset_id_idx" ON "validation_dataset_version" USING btree ("dataset_id");