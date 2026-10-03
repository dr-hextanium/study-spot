import { createDb } from "../src/client.ts";
import { seed } from "../src/seed/seed.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const ids = await seed(createDb(url));
console.log(`seeded ${Object.keys(ids.spotIds).length} sample spots`);
process.exit(0);
