ALTER TABLE "photo_blob" ALTER COLUMN "bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_blob" ADD COLUMN "pages_hash" text;--> statement-breakpoint
ALTER TABLE "photo_blob" ADD COLUMN "offloaded_at" timestamp with time zone;