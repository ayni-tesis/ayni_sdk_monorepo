CREATE TABLE "application_privacy_rights_request" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"notice_version" integer NOT NULL,
	"treatment_id" text NOT NULL,
	"purpose" text NOT NULL,
	"responsible_entity" text NOT NULL,
	"rights_channel" text NOT NULL,
	"type" text NOT NULL,
	"contact_email" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"response" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_id" text,
	CONSTRAINT "application_privacy_rights_request_type_check" CHECK ("application_privacy_rights_request"."type" in ('access', 'rectification', 'cancellation', 'opposition', 'portability')),
	CONSTRAINT "application_privacy_rights_request_status_check" CHECK ("application_privacy_rights_request"."status" in ('received', 'inReview', 'answered', 'notApplicable')),
	CONSTRAINT "application_privacy_rights_request_resolution_check" CHECK (("application_privacy_rights_request"."status" != 'answered' or "application_privacy_rights_request"."response" <> '') and ("application_privacy_rights_request"."status" != 'notApplicable' or "application_privacy_rights_request"."reason" <> ''))
);
--> statement-breakpoint
CREATE TABLE "application_privacy_rights_request_event" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text,
	"previous_status" text,
	"next_status" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_privacy_rights_request_event_action_check" CHECK ("application_privacy_rights_request_event"."action" in ('created', 'viewed', 'statusChanged'))
);
--> statement-breakpoint
ALTER TABLE "application_privacy_rights_request" ADD CONSTRAINT "application_privacy_rights_request_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_privacy_rights_request" ADD CONSTRAINT "application_privacy_rights_request_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_privacy_rights_request_event" ADD CONSTRAINT "application_privacy_rights_request_event_request_id_application_privacy_rights_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."application_privacy_rights_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_privacy_rights_request_event" ADD CONSTRAINT "application_privacy_rights_request_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_privacy_rights_request_app_created_idx" ON "application_privacy_rights_request" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "application_privacy_rights_request_event_request_idx" ON "application_privacy_rights_request_event" USING btree ("request_id","occurred_at");