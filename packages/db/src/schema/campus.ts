import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  integer,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

export const campus = pgTable("campus", {
  id: text().primaryKey(),
  name: text().notNull(),
  tz: text().notNull(),
});

export const building = pgTable("building", {
  id: text().primaryKey(),
  campus_id: text()
    .notNull()
    .references(() => campus.id),
  name: text().notNull(),
  lat: doublePrecision().notNull(),
  lng: doublePrecision().notNull(),
});

export const term = pgTable("term", {
  id: text().primaryKey(),
  campus_id: text()
    .notNull()
    .references(() => campus.id),
  name: text().notNull(),
  starts: date().notNull(),
  ends: date().notNull(),
  exam_starts: date(),
  exam_ends: date(),
});

export const walk_matrix = pgTable(
  "walk_matrix",
  {
    from_building_id: text()
      .notNull()
      .references(() => building.id),
    to_building_id: text()
      .notNull()
      .references(() => building.id),
    minutes: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.from_building_id, t.to_building_id] }),
    check("walk_matrix_minutes_nonnegative", sql`${t.minutes} >= 0`),
  ],
);
