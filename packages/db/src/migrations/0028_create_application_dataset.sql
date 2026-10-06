CREATE TABLE "dataset" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"name" text NOT NULL,
	"task_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_task_type_check" CHECK ("dataset"."task_type" in ('classification', 'detection'))
);
--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dataset_application_id_idx" ON "dataset" USING btree ("application_id");