import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { building, term } from "./campus.ts";
import {
  amenity,
  attribute_group,
  calls_ok,
  cell_signal,
  confidence,
  eligibility,
  entry_method,
  food_policy,
  lighting,
  noise_policy,
  seat_type,
  spot_status,
  table_config,
  temperature,
  verification_source,
} from "./enums.ts";
import { surveyor } from "./survey.ts";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/**
 * v0-required fields beyond identity (directions, eligibility, seat_count,
 * outlet_coverage_pct, food_policy, group_work_ok) are nullable here so a
 * surveyor can save a draft section by section. Completeness is checked when
 * building the bundle.
 */
export const spot = pgTable(
  "spot",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    building_id: text()
      .notNull()
      .references(() => building.id),
    floor: text().notNull(),
    official_name: text().notNull(),
    common_name: text(),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    directions: text(),
    status: spot_status().notNull().default("draft"),
    version: integer().notNull().default(1),
    eligibility: eligibility(),
    eligibility_scope: text(),
    eligibility_verified: boolean().notNull().default(false),
    entry_method: entry_method(),
    reservable: boolean().notNull().default(false),
    reservation_system: text(),
    reservation_url: text(),
    seat_count: integer(),
    effective_capacity: integer(),
    max_group_size: integer(),
    spread_out_room: boolean(),
    outlet_coverage_pct: real(),
    usb_outlets: boolean(),
    wifi_mbps: real(),
    cell_signal: cell_signal(),
    noise_policy: noise_policy().notNull(),
    natural_light: boolean(),
    lighting: lighting(),
    temperature: temperature(),
    temperature_consistent: boolean(),
    windows_view: boolean(),
    calls_ok: calls_ok(),
    group_work_ok: boolean(),
    whiteboard: boolean(),
    food_policy: food_policy(),
    step_free: boolean(),
    elevator: boolean(),
    accessible_seating: boolean(),
    open_past_midnight: boolean(),
    staffed_late: boolean(),
    lit_route_to_residences: boolean(),
    outdoor: boolean().notNull().default(false),
    seasonal: boolean().notNull().default(false),
    created_at: createdAt(),
    updated_at: createdAt(),
  },
  (t) => [
    check("spot_outlet_pct_range", sql`${t.outlet_coverage_pct} between 0 and 1`),
    check("spot_seat_count_positive", sql`${t.seat_count} > 0`),
  ],
);

export const spot_seat_type = pgTable(
  "spot_seat_type",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    type: seat_type().notNull(),
    count: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spot_id, t.type] }),
    check("spot_seat_type_count_nonnegative", sql`${t.count} >= 0`),
  ],
);

export const spot_table_config = pgTable(
  "spot_table_config",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    config: table_config().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.config] })],
);

export const spot_room = pgTable(
  "spot_room",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    name: text().notNull(),
    capacity: integer(),
    reservable: boolean().notNull().default(false),
  },
  // A null capacity passes: SQL checks treat unknown as satisfied.
  (t) => [check("spot_room_capacity_nonnegative", sql`${t.capacity} >= 0`)],
);

/** "24:00" is allowed for closes and last_entry (end of day), never for opens. */
const OPENS_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$";
const TIME_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$";

/** Times are "HH:MM" campus local. closes < opens means the spot closes after midnight. */
export const spot_hours = pgTable(
  "spot_hours",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    term_id: text()
      .notNull()
      .references(() => term.id),
    day_of_week: smallint().notNull(),
    opens: text().notNull(),
    closes: text().notNull(),
    last_entry: text(),
    is_exam: boolean().notNull().default(false),
  },
  (t) => [
    check("spot_hours_dow_range", sql`${t.day_of_week} between 0 and 6`),
    check("spot_hours_opens_format", sql`${t.opens} ~ ${sql.raw(`'${OPENS_PATTERN}'`)}`),
    check("spot_hours_closes_format", sql`${t.closes} ~ ${sql.raw(`'${TIME_PATTERN}'`)}`),
    check("spot_hours_last_entry_format", sql`${t.last_entry} ~ ${sql.raw(`'${TIME_PATTERN}'`)}`),
    uniqueIndex("spot_hours_slot_unique").on(
      t.spot_id,
      t.term_id,
      t.day_of_week,
      t.is_exam,
      t.opens,
    ),
  ],
);

export const spot_amenity = pgTable(
  "spot_amenity",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    amenity: amenity().notNull(),
    walk_minutes: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spot_id, t.amenity] }),
    check("spot_amenity_walk_minutes_nonnegative", sql`${t.walk_minutes} >= 0`),
  ],
);

/** is_cover marks the postcard front photo; at most one per spot. */
export const spot_photo = pgTable(
  "spot_photo",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    url: text().notNull(),
    r2_key: text().notNull(),
    taken_at: timestamp({ withTimezone: true }).notNull(),
    is_cover: boolean().notNull().default(false),
    uploaded_by: uuid().references(() => surveyor.id),
    approved_by: uuid().references(() => surveyor.id),
    approved_at: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("spot_photo_one_cover").on(t.spot_id).where(sql`${t.is_cover}`)],
);

export const spot_verification = pgTable(
  "spot_verification",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    attribute_group: attribute_group().notNull(),
    last_verified_at: timestamp({ withTimezone: true }).notNull(),
    source: verification_source().notNull(),
    confidence: confidence().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.attribute_group] })],
);

export const spot_linked_building = pgTable(
  "spot_linked_building",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    building_id: text()
      .notNull()
      .references(() => building.id),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.building_id] })],
);
