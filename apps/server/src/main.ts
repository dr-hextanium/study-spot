import { openDb } from "@study-spot/db";
import { buildApp } from "./app.ts";
import { systemClock } from "./clock.ts";
import { parseEnv } from "./env.ts";

const parsed = parseEnv(process.env);
if (!parsed.ok) {
  console.error(`invalid environment:\n${parsed.error}`);
  process.exit(1);
}
const env = parsed.env;

// postgres.js connects lazily, so the server starts even while the database sleeps.
const { db, close } = openDb(env.DATABASE_URL);
const app = await buildApp({
  db,
  clock: systemClock,
  config: { webOrigin: env.WEB_ORIGIN, campusId: env.CAMPUS_ID },
  // Replaced by the real Publisher in Task 8.
  publisher: { schedule: () => {} },
  logger: true,
});

async function shutdown(): Promise<void> {
  await app.close();
  await close();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

await app.listen({ port: env.PORT, host: "0.0.0.0" });
