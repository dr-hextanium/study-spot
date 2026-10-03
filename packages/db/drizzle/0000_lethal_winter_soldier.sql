CREATE TYPE "public"."amenity" AS ENUM('bathroom', 'water', 'coffee_food', 'printer', 'microwave', 'late_food');--> statement-breakpoint
CREATE TYPE "public"."attribute_group" AS ENUM('identity', 'access', 'hours', 'seating', 'power', 'environment', 'use_fit', 'amenities', 'accessibility', 'late_night');--> statement-breakpoint
CREATE TYPE "public"."calls_ok" AS ENUM('not_allowed', 'allowed_impractical', 'allowed');--> statement-breakpoint
CREATE TYPE "public"."cell_signal" AS ENUM('poor', 'ok', 'good');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('measured', 'estimated', 'reported');--> statement-breakpoint
CREATE TYPE "public"."day_type" AS ENUM('weekday', 'weekend');--> statement-breakpoint
CREATE TYPE "public"."eligibility" AS ENUM('all_students', 'residents_building', 'residents_quad', 'grad_only', 'department', 'public');--> statement-breakpoint
CREATE TYPE "public"."entry_method" AS ENUM('open', 'card_swipe', 'staffed_desk');--> statement-breakpoint
CREATE TYPE "public"."food_policy" AS ENUM('none', 'covered_drinks', 'food_ok');--> statement-breakpoint
CREATE TYPE "public"."forecast_profile" AS ENUM('regular', 'exam');--> statement-breakpoint
CREATE TYPE "public"."fullness" AS ENUM('empty', 'some', 'filling', 'nearly_full', 'full');--> statement-breakpoint
CREATE TYPE "public"."lighting" AS ENUM('dim', 'moderate', 'bright');--> statement-breakpoint
CREATE TYPE "public"."noise_bucket" AS ENUM('silent', 'quiet', 'conversational', 'loud');--> statement-breakpoint
CREATE TYPE "public"."noise_policy" AS ENUM('silent', 'quiet', 'conversational', 'group_friendly');--> statement-breakpoint
CREATE TYPE "public"."noise_sample_source" AS ENUM('survey', 'user');--> statement-breakpoint
CREATE TYPE "public"."seat_type" AS ENUM('table_chair', 'carrel', 'soft', 'booth', 'standing');--> statement-breakpoint
CREATE TYPE "public"."spot_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."surveyor_role" AS ENUM('surveyor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."table_config" AS ENUM('large_shared', 'small_2_4', 'individual');--> statement-breakpoint
CREATE TYPE "public"."temperature" AS ENUM('cold', 'neutral', 'warm');--> statement-breakpoint
CREATE TYPE "public"."time_block" AS ENUM('morning', 'afternoon', 'evening', 'night');--> statement-breakpoint
CREATE TYPE "public"."verification_source" AS ENUM('survey', 'official', 'user');--> statement-breakpoint
CREATE TABLE "building" (
	"id" text PRIMARY KEY NOT NULL,
	"campus_id" text NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campus" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tz" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "term" (
	"id" text PRIMARY KEY NOT NULL,
	"campus_id" text NOT NULL,
	"name" text NOT NULL,
	"starts" date NOT NULL,
	"ends" date NOT NULL,
	"exam_starts" date,
	"exam_ends" date
);
--> statement-breakpoint
CREATE TABLE "walk_matrix" (
	"from_building_id" text NOT NULL,
	"to_building_id" text NOT NULL,
	"minutes" integer NOT NULL,
	CONSTRAINT "walk_matrix_from_building_id_to_building_id_pk" PRIMARY KEY("from_building_id","to_building_id")
);
--> statement-breakpoint
CREATE TABLE "forecast" (
	"spot_id" uuid NOT NULL,
	"profile" "forecast_profile" NOT NULL,
	"day_of_week" smallint NOT NULL,
	"hour" smallint NOT NULL,
	"ratio" real NOT NULL,
	CONSTRAINT "forecast_spot_id_profile_day_of_week_hour_pk" PRIMARY KEY("spot_id","profile","day_of_week","hour"),
	CONSTRAINT "forecast_dow_range" CHECK ("forecast"."day_of_week" between 0 and 6),
	CONSTRAINT "forecast_hour_range" CHECK ("forecast"."hour" between 0 and 23),
	CONSTRAINT "forecast_ratio_range" CHECK ("forecast"."ratio" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "headcount" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"surveyor_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noise_sample" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"bucket" "noise_bucket" NOT NULL,
	"source" "noise_sample_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spot_estimate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"day_type" "day_type" NOT NULL,
	"block" time_block NOT NULL,
	"bucket" "fullness" NOT NULL,
	"surveyor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundle_state" (
	"campus_id" text PRIMARY KEY NOT NULL,
	"dirty" boolean DEFAULT false NOT NULL,
	"last_published_at" timestamp with time zone,
	"last_hash" text,
	"last_deploy_hook_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pick_daily" (
	"spot_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "pick_daily_spot_id_day_pk" PRIMARY KEY("spot_id","day")
);
--> statement-breakpoint
CREATE TABLE "pick_ping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"day" date NOT NULL,
	"hour_bucket" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"building_id" text NOT NULL,
	"floor" text NOT NULL,
	"official_name" text NOT NULL,
	"common_name" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"directions" text,
	"status" "spot_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"eligibility" "eligibility",
	"eligibility_scope" text,
	"eligibility_verified" boolean DEFAULT false NOT NULL,
	"entry_method" "entry_method",
	"reservable" boolean DEFAULT false NOT NULL,
	"reservation_system" text,
	"reservation_url" text,
	"seat_count" integer,
	"effective_capacity" integer,
	"max_group_size" integer,
	"spread_out_room" boolean,
	"outlet_coverage_pct" real,
	"usb_outlets" boolean,
	"wifi_mbps" real,
	"cell_signal" "cell_signal",
	"noise_policy" "noise_policy" NOT NULL,
	"natural_light" boolean,
	"lighting" "lighting",
	"temperature" "temperature",
	"temperature_consistent" boolean,
	"windows_view" boolean,
	"calls_ok" "calls_ok",
	"group_work_ok" boolean,
	"whiteboard" boolean,
	"food_policy" "food_policy",
	"step_free" boolean,
	"elevator" boolean,
	"accessible_seating" boolean,
	"open_past_midnight" boolean,
	"staffed_late" boolean,
	"lit_route_to_residences" boolean,
	"outdoor" boolean DEFAULT false NOT NULL,
	"seasonal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spot_slug_unique" UNIQUE("slug"),
	CONSTRAINT "spot_outlet_pct_range" CHECK ("spot"."outlet_coverage_pct" between 0 and 1),
	CONSTRAINT "spot_seat_count_positive" CHECK ("spot"."seat_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "spot_amenity" (
	"spot_id" uuid NOT NULL,
	"amenity" "amenity" NOT NULL,
	"walk_minutes" integer NOT NULL,
	CONSTRAINT "spot_amenity_spot_id_amenity_pk" PRIMARY KEY("spot_id","amenity")
);
--> statement-breakpoint
CREATE TABLE "spot_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"term_id" text NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens" text NOT NULL,
	"closes" text NOT NULL,
	"last_entry" text,
	"is_exam" boolean DEFAULT false NOT NULL,
	CONSTRAINT "spot_hours_dow_range" CHECK ("spot_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "spot_hours_opens_format" CHECK ("spot_hours"."opens" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$'),
	CONSTRAINT "spot_hours_closes_format" CHECK ("spot_hours"."closes" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$')
);
--> statement-breakpoint
CREATE TABLE "spot_linked_building" (
	"spot_id" uuid NOT NULL,
	"building_id" text NOT NULL,
	CONSTRAINT "spot_linked_building_spot_id_building_id_pk" PRIMARY KEY("spot_id","building_id")
);
--> statement-breakpoint
CREATE TABLE "spot_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"url" text NOT NULL,
	"r2_key" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "spot_room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"reservable" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spot_seat_type" (
	"spot_id" uuid NOT NULL,
	"type" "seat_type" NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "spot_seat_type_spot_id_type_pk" PRIMARY KEY("spot_id","type")
);
--> statement-breakpoint
CREATE TABLE "spot_table_config" (
	"spot_id" uuid NOT NULL,
	"config" "table_config" NOT NULL,
	CONSTRAINT "spot_table_config_spot_id_config_pk" PRIMARY KEY("spot_id","config")
);
--> statement-breakpoint
CREATE TABLE "spot_verification" (
	"spot_id" uuid NOT NULL,
	"attribute_group" "attribute_group" NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"source" "verification_source" NOT NULL,
	"confidence" "confidence" NOT NULL,
	CONSTRAINT "spot_verification_spot_id_attribute_group_pk" PRIMARY KEY("spot_id","attribute_group")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"surveyor_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"surveyor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"surveyor_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "route" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campus_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_slot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"claimed_by" uuid,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "route_spot" (
	"route_id" uuid NOT NULL,
	"spot_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "route_spot_route_id_position_pk" PRIMARY KEY("route_id","position")
);
--> statement-breakpoint
CREATE TABLE "surveyor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "surveyor_role" DEFAULT 'surveyor' NOT NULL,
	"invited_by" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveyor_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "write_receipt" (
	"client_write_id" uuid PRIMARY KEY NOT NULL,
	"surveyor_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "building" ADD CONSTRAINT "building_campus_id_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "term" ADD CONSTRAINT "term_campus_id_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_matrix" ADD CONSTRAINT "walk_matrix_from_building_id_building_id_fk" FOREIGN KEY ("from_building_id") REFERENCES "public"."building"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_matrix" ADD CONSTRAINT "walk_matrix_to_building_id_building_id_fk" FOREIGN KEY ("to_building_id") REFERENCES "public"."building"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast" ADD CONSTRAINT "forecast_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount" ADD CONSTRAINT "headcount_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount" ADD CONSTRAINT "headcount_surveyor_id_surveyor_id_fk" FOREIGN KEY ("surveyor_id") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noise_sample" ADD CONSTRAINT "noise_sample_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_estimate" ADD CONSTRAINT "spot_estimate_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_estimate" ADD CONSTRAINT "spot_estimate_surveyor_id_surveyor_id_fk" FOREIGN KEY ("surveyor_id") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_state" ADD CONSTRAINT "bundle_state_campus_id_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_daily" ADD CONSTRAINT "pick_daily_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pick_ping" ADD CONSTRAINT "pick_ping_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot" ADD CONSTRAINT "spot_building_id_building_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."building"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_amenity" ADD CONSTRAINT "spot_amenity_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_hours" ADD CONSTRAINT "spot_hours_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_hours" ADD CONSTRAINT "spot_hours_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_linked_building" ADD CONSTRAINT "spot_linked_building_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_linked_building" ADD CONSTRAINT "spot_linked_building_building_id_building_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."building"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_photo" ADD CONSTRAINT "spot_photo_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_photo" ADD CONSTRAINT "spot_photo_uploaded_by_surveyor_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_photo" ADD CONSTRAINT "spot_photo_approved_by_surveyor_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_room" ADD CONSTRAINT "spot_room_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_seat_type" ADD CONSTRAINT "spot_seat_type_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_table_config" ADD CONSTRAINT "spot_table_config_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_verification" ADD CONSTRAINT "spot_verification_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_surveyor_id_surveyor_id_fk" FOREIGN KEY ("surveyor_id") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_surveyor_id_surveyor_id_fk" FOREIGN KEY ("surveyor_id") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link" ADD CONSTRAINT "magic_link_surveyor_id_surveyor_id_fk" FOREIGN KEY ("surveyor_id") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route" ADD CONSTRAINT "route_campus_id_campus_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_slot" ADD CONSTRAINT "route_slot_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_slot" ADD CONSTRAINT "route_slot_claimed_by_surveyor_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_spot" ADD CONSTRAINT "route_spot_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_spot" ADD CONSTRAINT "route_spot_spot_id_spot_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveyor" ADD CONSTRAINT "surveyor_invited_by_surveyor_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "write_receipt" ADD CONSTRAINT "write_receipt_surveyor_id_surveyor_id_fk" FOREIGN KEY ("surveyor_id") REFERENCES "public"."surveyor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spot_photo_one_cover" ON "spot_photo" USING btree ("spot_id") WHERE "spot_photo"."is_cover";