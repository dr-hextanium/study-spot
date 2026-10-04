CREATE TYPE "public"."review_state" AS ENUM('unreviewed', 'reviewed');--> statement-breakpoint
CREATE TABLE "photo_blob" (
	"sha256" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"role" "surveyor_role" NOT NULL,
	"surveyor_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "spot" ALTER COLUMN "noise_policy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spot_photo" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surveyor" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "write_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "last_warnings" jsonb;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "spot" ADD COLUMN "review_state" "review_state" DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "spot" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "spot" ADD COLUMN "last_edited_by" uuid;--> statement-breakpoint
ALTER TABLE "spot_photo" ADD COLUMN "blob_sha256" text;--> statement-breakpoint
ALTER TABLE "write_receipt" ADD COLUMN "response_json" jsonb;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_surveyor_id_surveyor_id_fk" FOREIGN KEY ("surveyor_id") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_surveyor_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot" ADD CONSTRAINT "spot_reviewed_by_surveyor_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot" ADD CONSTRAINT "spot_last_edited_by_surveyor_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_photo" ADD CONSTRAINT "spot_photo_blob_sha256_photo_blob_sha256_fk" FOREIGN KEY ("blob_sha256") REFERENCES "public"."photo_blob"("sha256") ON DELETE no action ON UPDATE no action;