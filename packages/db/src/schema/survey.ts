import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { campus } from "./campus.ts";
import { surveyor_role } from "./enums.ts";
import { spot } from "./spot.ts";

const ts = () => timestamp({ withTimezone: true });

export const surveyor = pgTable("surveyor", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  display_name: text().notNull(),
  role: surveyor_role().notNull().default("surveyor"),
  invited_by: uuid().references((): AnyPgColumn => surveyor.id),
  active: boolean().notNull().default(true),
  created_at: ts().notNull().defaultNow(),
});

export const magic_link = pgTable("magic_link", {
  token_hash: text().primaryKey(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  expires_at: ts().notNull(),
  used_at: ts(),
});

export const auth_session = pgTable("auth_session", {
  id: text().primaryKey(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  created_at: ts().notNull().defaultNow(),
  expires_at: ts().notNull(),
});

export const audit_log = pgTable("audit_log", {
  id: uuid().primaryKey().defaultRandom(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  entity: text().notNull(),
  entity_id: text().notNull(),
  action: text().notNull(),
  before_json: jsonb(),
  after_json: jsonb(),
  at: ts().notNull().defaultNow(),
});

export const write_receipt = pgTable("write_receipt", {
  client_write_id: uuid().primaryKey(),
  surveyor_id: uuid()
    .notNull()
    .references(() => surveyor.id),
  received_at: ts().notNull().defaultNow(),
});

export const route = pgTable("route", {
  id: uuid().primaryKey().defaultRandom(),
  campus_id: text()
    .notNull()
    .references(() => campus.id),
  name: text().notNull(),
});

export const route_spot = pgTable(
  "route_spot",
  {
    route_id: uuid()
      .notNull()
      .references(() => route.id, { onDelete: "cascade" }),
    spot_id: uuid()
      .notNull()
      .references(() => spot.id),
    position: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.route_id, t.position] })],
);

export const route_slot = pgTable("route_slot", {
  id: uuid().primaryKey().defaultRandom(),
  route_id: uuid()
    .notNull()
    .references(() => route.id, { onDelete: "cascade" }),
  starts_at: ts().notNull(),
  claimed_by: uuid().references(() => surveyor.id),
  completed_at: ts(),
});
