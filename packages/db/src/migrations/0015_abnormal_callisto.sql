CREATE TABLE "application_telemetry_policy" (
	"application_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_telemetry_policy_retention_days_check" CHECK ("application_telemetry_policy"."retention_days" in (7, 30, 90))
);
--> statement-breakpoint
ALTER TABLE "application_telemetry_policy" ADD CONSTRAINT "application_telemetry_policy_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_telemetry_policy" ADD CONSTRAINT "application_telemetry_policy_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;