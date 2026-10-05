import { checkDbHost } from "../src/deploy/dbHost.ts";

/**
 * Usage: DATABASE_URL=... EXPECTED_DB_HOST=... node apps/server/scripts/assert-db-host.ts [--direct]
 * --direct also rejects Neon's pooled (-pooler) host.
 */
const requireDirect = process.argv.slice(2).includes("--direct");
const url = process.env.DATABASE_URL ?? "";
const expected = process.env.EXPECTED_DB_HOST ?? "";
if (url === "" || expected === "") {
  console.error("DATABASE_URL and EXPECTED_DB_HOST must both be set");
  process.exit(1);
}
const result = checkDbHost(url, expected, { requireDirect });
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
console.log(`database host ok: ${result.host}`);
