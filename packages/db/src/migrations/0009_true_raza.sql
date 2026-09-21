CREATE TABLE "workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_status_check" CHECK ("workflow"."status" in ('draft'))
);
--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_application_id_idx" ON "workflow" USING btree ("application_id");