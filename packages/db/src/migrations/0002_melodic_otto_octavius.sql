CREATE TABLE "invitation_link" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL,
	CONSTRAINT "invitation_link_status_check" CHECK ("invitation_link"."status" in ('pending', 'accepted')),
	CONSTRAINT "invitation_link_role_check" CHECK ("invitation_link"."role" in ('admin', 'member'))
);
--> statement-breakpoint
ALTER TABLE "invitation_link" ADD CONSTRAINT "invitation_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_link" ADD CONSTRAINT "invitation_link_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_link_token_idx" ON "invitation_link" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitation_link_organization_id_idx" ON "invitation_link" USING btree ("organization_id");