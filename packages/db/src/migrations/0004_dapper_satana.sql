CREATE TABLE "model" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"name" text NOT NULL,
	"runtime" text DEFAULT 'tensorflow_lite' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "model_runtime_check" CHECK ("model"."runtime" in ('tensorflow_lite'))
);
--> statement-breakpoint
ALTER TABLE "model" ADD CONSTRAINT "model_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_application_id_idx" ON "model" USING btree ("application_id");