SET lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "spot_photo" DROP CONSTRAINT "spot_photo_spot_id_spot_id_fk";
--> statement-breakpoint
ALTER TABLE "spot_photo" ADD CONSTRAINT "spot_photo_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE restrict ON UPDATE no action NOT VALID;
--> statement-breakpoint
ALTER TABLE "spot_photo" VALIDATE CONSTRAINT "spot_photo_spot_id_spot_id_fk";
--> statement-breakpoint
RESET lock_timeout;
