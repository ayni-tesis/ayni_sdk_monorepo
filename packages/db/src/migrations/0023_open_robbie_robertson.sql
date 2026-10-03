CREATE TABLE "sdk_trace" (
	"application_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"content_sha256" text NOT NULL,
	"trace" jsonb NOT NULL,
	"source" text DEFAULT 'clientReported' NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "sdk_trace_application_id_trace_id_pk" PRIMARY KEY("application_id","trace_id")
);
--> statement-breakpoint
ALTER TABLE "sdk_trace" ADD CONSTRAINT "sdk_trace_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sdk_trace_expires_at_idx" ON "sdk_trace" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sdk_trace_application_received_idx" ON "sdk_trace" USING btree ("application_id","received_at");