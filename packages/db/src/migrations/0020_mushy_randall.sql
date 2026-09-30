CREATE TABLE "user_terms_acceptance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_terms_acceptance" ADD CONSTRAINT "user_terms_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_terms_acceptance_user_version_unique" ON "user_terms_acceptance" USING btree ("user_id","version");