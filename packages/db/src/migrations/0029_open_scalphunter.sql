CREATE UNIQUE INDEX "dataset_application_id_id_unique" ON "dataset" USING btree ("application_id","id");--> statement-breakpoint
CREATE TABLE "dataset_item" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"evidence_id" text NOT NULL,
	"original_result" jsonb NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_application_dataset_fkey" FOREIGN KEY ("application_id","dataset_id") REFERENCES "public"."dataset"("application_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_application_evidence_fkey" FOREIGN KEY ("application_id","evidence_id") REFERENCES "public"."sdk_evidence"("application_id","evidence_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_item_application_dataset_evidence_unique" ON "dataset_item" USING btree ("application_id","dataset_id","evidence_id");--> statement-breakpoint
CREATE INDEX "dataset_item_application_dataset_added_idx" ON "dataset_item" USING btree ("application_id","dataset_id","added_at");
