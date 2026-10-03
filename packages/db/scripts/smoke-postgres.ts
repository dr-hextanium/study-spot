import { parseBundle } from "@study-spot/core";
import { buildBundle } from "../src/bundle/buildBundle.ts";
import { openDb } from "../src/client.ts";

/** Builds the bundle over a real Postgres via postgres.js. Expects a migrated, seeded database. */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const { db, close } = openDb(url);
try {
  const { bundle, warnings } = await buildBundle(db, "sbu", new Date("2026-10-13T18:00:00Z"));
  const parsed = parseBundle(JSON.parse(JSON.stringify(bundle)));
  if (parsed.ok) {
    console.log(`postgres smoke ok: ${bundle.spots.length} spots, ${warnings.length} warnings`);
  } else {
    console.error(`postgres smoke: invalid bundle: ${parsed.detail}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error("postgres smoke failed:", error);
  process.exitCode = 1;
} finally {
  await close();
}
