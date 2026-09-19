CREATE TABLE "sdk_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sdk_credential" ADD CONSTRAINT "sdk_credential_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sdk_credential_secret_hash_idx" ON "sdk_credential" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "sdk_credential_application_id_idx" ON "sdk_credential" USING btree ("application_id");