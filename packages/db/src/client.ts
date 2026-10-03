import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export type Schema = typeof schema;

/** Any Drizzle Postgres database over our schema (postgres.js in production, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export function createDb(url: string): Db {
  return drizzle(postgres(url), { schema });
}

export const spotSelectSchema = createSelectSchema(schema.spot);
export const spotInsertSchema = createInsertSchema(schema.spot);
