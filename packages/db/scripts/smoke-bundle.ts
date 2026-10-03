import { parseBundle } from "@study-spot/core";
import { buildBundle } from "../src/bundle/buildBundle.ts";
import { seed } from "../src/seed/seed.ts";
import { createTestDb } from "../src/testing.ts";

const db = await createTestDb();
await seed(db);
const { bundle, warnings } = await buildBundle(db, "sbu", new Date("2026-10-13T18:00:00Z"));
const parsed = parseBundle(JSON.parse(JSON.stringify(bundle)));
if (!parsed.ok) {
  console.error(`smoke: invalid bundle: ${parsed.detail}`);
  process.exit(1);
}
const runtime = process.versions.bun ? "bun" : "node";
console.log(`smoke ok on ${runtime}: ${bundle.spots.length} spots, ${warnings.length} warnings`);
process.exit(0);
