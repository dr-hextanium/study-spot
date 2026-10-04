import { customType } from "drizzle-orm/pg-core";

/** Postgres bytea as a Uint8Array (postgres.js returns a Buffer, PGlite a Uint8Array). */
export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});
