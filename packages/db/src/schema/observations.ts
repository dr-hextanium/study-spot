import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  day_type,
  forecast_profile,
  fullness,
  noise_bucket,
  noise_sample_source,
  time_block,
} from "./enums.ts";
import { spot } from "./spot.ts";
import { surveyor } from "./survey.ts";

const ts = () => timestamp({ withTimezone: true });

export const headcount = pgTable("headcount", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id),
  observed_at: ts().notNull(),
  count: integer().notNull(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
});

export const noise_sample = pgTable("noise_sample", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id),
  observed_at: ts().notNull(),
  bucket: noise_bucket().notNull(),
  source: noise_sample_source().notNull(),
});

/** Fitted occupancy ratio per slot. Written by the forecast fitter (scoring plan). */
export const forecast = pgTable(
  "forecast",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    profile: forecast_profile().notNull(),
    day_of_week: smallint().notNull(),
    hour: smallint().notNull(),
    ratio: real().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spot_id, t.profile, t.day_of_week, t.hour] }),
    check("forecast_dow_range", sql`${t.day_of_week} between 0 and 6`),
    check("forecast_hour_range", sql`${t.hour} between 0 and 23`),
    check("forecast_ratio_range", sql`${t.ratio} between 0 and 1`),
  ],
);

/** Surveyor busyness estimate per day type and time block. Latest row per cell wins. */
export const spot_estimate = pgTable("spot_estimate", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id, { onDelete: "cascade" }),
  day_type: day_type().notNull(),
  block: time_block().notNull(),
  bucket: fullness().notNull(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  created_at: ts().notNull().defaultNow(),
});
