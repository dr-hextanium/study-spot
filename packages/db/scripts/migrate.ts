import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});
await sql.end();
console.log("migrations applied");
