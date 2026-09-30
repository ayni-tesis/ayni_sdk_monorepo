CREATE TABLE "sdk_consent_receipt" (
	"application_id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"purpose" text NOT NULL,
	"decision" text NOT NULL,
	"notice_version" text NOT NULL,
	"decided_at" timestamp NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sdk_consent_receipt_application_id_receipt_id_pk" PRIMARY KEY("application_id","receipt_id"),
	CONSTRAINT "sdk_consent_receipt_purpose_check" CHECK ("sdk_consent_receipt"."purpose" in ('ayniModelImprovement', 'ayniSdkImprovement')),
	CONSTRAINT "sdk_consent_receipt_decision_check" CHECK ("sdk_consent_receipt"."decision" in ('accepted', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "sdk_consent_receipt" ADD CONSTRAINT "sdk_consent_receipt_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sdk_consent_receipt_subject_purpose_idx" ON "sdk_consent_receipt" USING btree ("application_id","subject_id","purpose","received_at");