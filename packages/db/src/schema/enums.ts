import {
  AMENITY,
  ATTRIBUTE_GROUP,
  CALLS_OK,
  CELL_SIGNAL,
  CONFIDENCE,
  DAY_TYPE,
  ELIGIBILITY,
  ENTRY_METHOD,
  FOOD_POLICY,
  FORECAST_PROFILE,
  FULLNESS,
  LIGHTING,
  NOISE_BUCKET,
  NOISE_POLICY,
  NOISE_SAMPLE_SOURCE,
  REVIEW_STATE,
  SEAT_TYPE,
  SPOT_STATUS,
  SURVEYOR_ROLE,
  TABLE_CONFIG,
  TEMPERATURE,
  TIME_BLOCK,
  VERIFICATION_SOURCE,
} from "@perch/core";
import { pgEnum } from "drizzle-orm/pg-core";

export const eligibility = pgEnum("eligibility", ELIGIBILITY);
export const entry_method = pgEnum("entry_method", ENTRY_METHOD);
export const seat_type = pgEnum("seat_type", SEAT_TYPE);
export const table_config = pgEnum("table_config", TABLE_CONFIG);
export const cell_signal = pgEnum("cell_signal", CELL_SIGNAL);
export const noise_policy = pgEnum("noise_policy", NOISE_POLICY);
export const noise_bucket = pgEnum("noise_bucket", NOISE_BUCKET);
export const lighting = pgEnum("lighting", LIGHTING);
export const temperature = pgEnum("temperature", TEMPERATURE);
export const calls_ok = pgEnum("calls_ok", CALLS_OK);
export const food_policy = pgEnum("food_policy", FOOD_POLICY);
export const amenity = pgEnum("amenity", AMENITY);
export const attribute_group = pgEnum("attribute_group", ATTRIBUTE_GROUP);
export const verification_source = pgEnum("verification_source", VERIFICATION_SOURCE);
export const confidence = pgEnum("confidence", CONFIDENCE);
export const fullness = pgEnum("fullness", FULLNESS);
export const day_type = pgEnum("day_type", DAY_TYPE);
export const time_block = pgEnum("time_block", TIME_BLOCK);
export const forecast_profile = pgEnum("forecast_profile", FORECAST_PROFILE);
export const surveyor_role = pgEnum("surveyor_role", SURVEYOR_ROLE);
export const spot_status = pgEnum("spot_status", SPOT_STATUS);
export const noise_sample_source = pgEnum("noise_sample_source", NOISE_SAMPLE_SOURCE);
export const review_state = pgEnum("review_state", REVIEW_STATE);
