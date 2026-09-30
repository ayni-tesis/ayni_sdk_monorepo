CREATE TABLE "application_privacy_treatment_map" (
	"application_id" text PRIMARY KEY NOT NULL,
	"treatments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_privacy_treatment_map" ADD CONSTRAINT "application_privacy_treatment_map_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_privacy_treatment_map" ADD CONSTRAINT "application_privacy_treatment_map_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;