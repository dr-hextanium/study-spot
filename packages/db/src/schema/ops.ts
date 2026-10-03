import {
  boolean,
  date,
  integer,
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

export const bundle_state = pgTable("bundle_state", {
  campus_id: text()
    .primaryKey()
    .references(() => campus.id),
  dirty: boolean().notNull().default(false),
  last_published_at: ts(),
  last_hash: text(),
  last_deploy_hook_at: ts(),
});

/** Anonymous pick event: spot, day, hour only. No device or IP. Rolled up nightly then deleted. */
export const pick_ping = pgTable("pick_ping", {
  id: uuid().primaryKey().defaultRandom(),
  spot_id: uuid()
    .notNull()
    .references(() => spot.id, { onDelete: "cascade" }),
  day: date().notNull(),
  hour_bucket: smallint().notNull(),
});

export const pick_daily = pgTable(
  "pick_daily",
  {
    spot_id: uuid()
      .notNull()
      .references(() => spot.id, { onDelete: "cascade" }),
    day: date().notNull(),
    count: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spot_id, t.day] })],
);
