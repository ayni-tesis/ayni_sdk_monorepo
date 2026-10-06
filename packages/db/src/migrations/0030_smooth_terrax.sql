ALTER TABLE "dataset_item" ADD COLUMN "review_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_item" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "dataset_item" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "dataset_item" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_review_status_check" CHECK ("dataset_item"."review_status" in ('pending', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_reviewed_at_check" CHECK (("dataset_item"."review_status" = 'pending') = ("dataset_item"."reviewed_at" is null));--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_review_reason_check" CHECK (("dataset_item"."review_status" = 'rejected') or ("dataset_item"."review_reason" is null));