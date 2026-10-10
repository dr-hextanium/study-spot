ALTER TABLE "bundle_state" ADD COLUMN "publishing_owner" text;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "publishing_until" timestamp with time zone;