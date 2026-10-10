import { openDb } from "@perch/db";
import { buildApp } from "./app.ts";
import { systemClock } from "./clock.ts";
import { parseEnv } from "./env.ts";
import { postgresPhotoStore } from "./photos/store.ts";
import { dbKnownSpots } from "./ping/knownSpots.ts";
import { fsDataSite, httpDataSite } from "./publish/dataSite.ts";
import { fsTarget } from "./publish/fsTarget.ts";
import { pagesTarget } from "./publish/pagesTarget.ts";
import { createPublisher } from "./publish/publisher.ts";

const parsed = parseEnv(process.env);
if (!parsed.ok) {
  console.error(`invalid environment:\n${parsed.error}`);
  process.exit(1);
}
const env = parsed.env;

// postgres.js connects lazily, so the server starts even while the database sleeps.
const { db, close } = openDb(env.DATABASE_URL);
// Where published files are read back: to confirm a photo before its bytes leave
// Postgres, and to serve a photo whose bytes did.
const dataSite =
  env.PUBLISH_TARGET === "pages" ? httpDataSite(env.DATA_BASE_URL) : fsDataSite(env.FS_PUBLISH_DIR);
const photos = postgresPhotoStore(db, dataSite);
const target =
  env.PUBLISH_TARGET === "pages"
    ? pagesTarget({
        accountId: env.CF_ACCOUNT_ID,
        apiToken: env.CF_API_TOKEN,
        project: env.CF_DATA_PROJECT,
      })
    : fsTarget(env.FS_PUBLISH_DIR);
// Shared, so a publish makes new spots count for pick pings right away.
const knownSpots = dbKnownSpots(db, env.CAMPUS_ID, systemClock);
const publisher = createPublisher({
  db,
  campusId: env.CAMPUS_ID,
  target,
  photos,
  dataSite,
  dataBaseUrl: env.DATA_BASE_URL,
  clock: systemClock,
  log: (message, error) => console.error(message, error),
  knownSpots,
});
const app = await buildApp({
  db,
  clock: systemClock,
  config: {
    webOrigin: env.WEB_ORIGIN,
    campusId: env.CAMPUS_ID,
    commit: env.RENDER_GIT_COMMIT ?? null,
    trustProxyHops: env.TRUST_PROXY_HOPS,
  },
  publisher,
  photos,
  knownSpots,
  logger: true,
});

async function shutdown(): Promise<void> {
  publisher.close();
  await app.close();
  await close();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

await app.listen({ port: env.PORT, host: "0.0.0.0" });
void publisher.start();
