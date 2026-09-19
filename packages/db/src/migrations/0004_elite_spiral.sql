ALTER TABLE "sdk_credential" ADD COLUMN "last_used_at" timestamp;--> statement-breakpoint
ALTER TABLE "sdk_credential" ADD COLUMN "revoked_at" timestamp;