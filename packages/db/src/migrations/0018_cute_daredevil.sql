CREATE TABLE "application_privacy_notice_version" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"version" integer NOT NULL,
	"treatments" jsonb NOT NULL,
	"published_by_id" text,
	"published_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_privacy_notice_version_app_version_unique" UNIQUE("application_id","version"),
	CONSTRAINT "application_privacy_notice_version_positive_check" CHECK ("application_privacy_notice_version"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "application_privacy_treatment_map" ADD COLUMN "latest_published_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "application_privacy_notice_version" ADD CONSTRAINT "application_privacy_notice_version_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_privacy_notice_version" ADD CONSTRAINT "application_privacy_notice_version_published_by_id_user_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;