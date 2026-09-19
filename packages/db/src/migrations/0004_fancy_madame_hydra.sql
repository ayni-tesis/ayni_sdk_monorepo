ALTER TABLE "sdk_credential" ADD COLUMN "prefix" text;--> statement-breakpoint
ALTER TABLE "sdk_credential" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "sdk_credential" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
ALTER TABLE "sdk_credential" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "sdk_credential" ADD CONSTRAINT "sdk_credential_status_check" CHECK ("sdk_credential"."status" in ('active', 'revoked')) NOT VALID;