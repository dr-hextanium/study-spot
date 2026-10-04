import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { campus } from "./campus.ts";
import { spot } from "./spot.ts";

const ts = () => timestamp({ withTimezone: true });

/**
 * Publish state per campus. write_seq increases on every data write so a publish
 * only clears dirty when no write landed while it ran.
 */
export const bundle_state = pgTable("bundle_state", {
  campus_id: text()
    .primaryKey()
    .references(() => campus.id),
  dirty: boolean().notNull().default(false),
  write_seq: integer().notNull().default(0),
  last_published_at: ts(),
  last_hash: text(),
  last_deploy_hook_at: ts(),
  last_attempt_at: ts(),
  last_warnings: jsonb(),
  last_error: text(),
});

/** Anonymous pick event: spot, day, hour only. No device or IP. Rolled up nightly then deleted. */
export const pick_ping = pgTable(
  "pick_ping",
  {
    id: uuid().primaryKey().defaultRandom(),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    day: date().notNull(),
    hour_bucket: smallint().notNull(),
  },
  (t) => [check("pick_ping_hour_bucket_range", sql`${t.hour_bucket} between 0 and 23`)],
);

export const pick_daily = pgTable(
  "pick_daily",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    day: date().notNull(),
    count: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spot_id, t.day] }),
    check("pick_daily_count_nonnegative", sql`${t.count} >= 0`),
  ],
);
