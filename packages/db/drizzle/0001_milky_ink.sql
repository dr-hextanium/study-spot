ALTER TABLE "spot_hours" DROP CONSTRAINT "spot_hours_opens_format";--> statement-breakpoint
CREATE UNIQUE INDEX "spot_hours_slot_unique" ON "spot_hours" USING btree ("spot_id","term_id","day_of_week","is_exam","opens");--> statement-breakpoint
ALTER TABLE "walk_matrix" ADD CONSTRAINT "walk_matrix_minutes_nonnegative" CHECK ("walk_matrix"."minutes" >= 0);--> statement-breakpoint
ALTER TABLE "headcount" ADD CONSTRAINT "headcount_count_nonnegative" CHECK ("headcount"."count" >= 0);--> statement-breakpoint
ALTER TABLE "pick_daily" ADD CONSTRAINT "pick_daily_count_nonnegative" CHECK ("pick_daily"."count" >= 0);--> statement-breakpoint
ALTER TABLE "pick_ping" ADD CONSTRAINT "pick_ping_hour_bucket_range" CHECK ("pick_ping"."hour_bucket" between 0 and 23);--> statement-breakpoint
ALTER TABLE "spot_amenity" ADD CONSTRAINT "spot_amenity_walk_minutes_nonnegative" CHECK ("spot_amenity"."walk_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "spot_hours" ADD CONSTRAINT "spot_hours_last_entry_format" CHECK ("spot_hours"."last_entry" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$');--> statement-breakpoint
ALTER TABLE "spot_hours" ADD CONSTRAINT "spot_hours_opens_format" CHECK ("spot_hours"."opens" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "spot_room" ADD CONSTRAINT "spot_room_capacity_nonnegative" CHECK ("spot_room"."capacity" >= 0);--> statement-breakpoint
ALTER TABLE "spot_seat_type" ADD CONSTRAINT "spot_seat_type_count_nonnegative" CHECK ("spot_seat_type"."count" >= 0);