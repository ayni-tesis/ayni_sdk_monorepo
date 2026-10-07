CREATE TABLE "dataset_export" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"version" integer NOT NULL,
	"format" text NOT NULL,
	"status" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"item_count" integer NOT NULL,
	"storage_key" text NOT NULL,
	CONSTRAINT "dataset_export_version_check" CHECK ("dataset_export"."version" > 0),
	CONSTRAINT "dataset_export_format_check" CHECK ("dataset_export"."format" = 'classification_images_csv'),
	CONSTRAINT "dataset_export_status_check" CHECK ("dataset_export"."status" = 'ready'),
	CONSTRAINT "dataset_export_item_count_check" CHECK ("dataset_export"."item_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "dataset_export" ADD CONSTRAINT "dataset_export_application_dataset_fkey" FOREIGN KEY ("application_id","dataset_id") REFERENCES "public"."dataset"("application_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_export_application_dataset_version_unique" ON "dataset_export" USING btree ("application_id","dataset_id","version");