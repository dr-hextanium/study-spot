import { bootstrap } from "../src/bootstrap/bootstrap.ts";
import { openDb } from "../src/client.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const { db, close } = openDb(url);
try {
  const report = await bootstrap(db);
  const line = (label: string, c: { inserted: number; updated: number; unchanged: number }) =>
    `${label}: ${c.inserted} inserted, ${c.updated} updated, ${c.unchanged} unchanged`;
  console.log(`campus: ${report.campus}`);
  console.log(line("terms", report.terms));
  console.log(line("buildings", report.buildings));
} finally {
  await close();
}
