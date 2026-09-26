CREATE TABLE "application_collection_policy" (
	"application_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"consent_required" boolean DEFAULT false NOT NULL,
	"network" text DEFAULT 'wifi' NOT NULL,
	"max_image_size" integer DEFAULT 1024 NOT NULL,
	"image_quality" integer DEFAULT 80 NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_collection_policy_consent_check" CHECK (not "application_collection_policy"."enabled" or "application_collection_policy"."consent_required"),
	CONSTRAINT "application_collection_policy_network_check" CHECK ("application_collection_policy"."network" in ('wifi', 'wifiAndCellular')),
	CONSTRAINT "application_collection_policy_max_image_size_check" CHECK ("application_collection_policy"."max_image_size" between 128 and 4096),
	CONSTRAINT "application_collection_policy_image_quality_check" CHECK ("application_collection_policy"."image_quality" between 10 and 100)
);
--> statement-breakpoint
ALTER TABLE "application_collection_policy" ADD CONSTRAINT "application_collection_policy_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_collection_policy" ADD CONSTRAINT "application_collection_policy_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;