import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { seed } from "@perch/db/seed";
import { createTestDb } from "@perch/db/testing";
import { z } from "zod";
import { buildApp } from "../src/app.ts";
import { bootstrapAdminInvite } from "../src/auth/invites.ts";
import type { Clock } from "../src/clock.ts";
import { postgresPhotoStore } from "../src/photos/store.ts";
import { fsDataSite } from "../src/publish/dataSite.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import { createPublisher } from "../src/publish/publisher.ts";

/**
 * The real server for apps/web's Playwright run: buildApp on a seeded PGlite
 * database, publishing to a temp directory. Its clock starts at E2E_NOW and
 * ticks, so seed terms stay current whatever the date. Writes the admin invite
 * links and the publish directory to E2E_STATE for the tests.
 */
const Env = z.object({
  E2E_PORT: z.coerce.number().int().positive().default(8787),
  E2E_WEB_ORIGIN: z.url().default("http://localhost:4173"),
  E2E_STATE: z.string().min(1),
  E2E_NOW: z.iso.datetime().default("2026-10-13T16:00:00.000Z"),
  E2E_INVITES: z.coerce.number().int().positive().default(40),
});
const env = Env.parse(process.env);

const startedAt = Date.now();
const clock: Clock = {
  now: () => new Date(Date.parse(env.E2E_NOW) + (Date.now() - startedAt)),
};
const db = await createTestDb();
await seed(db);
const publishDir = mkdtempSync(join(tmpdir(), "perch-e2e-publish-"));
const dataSite = fsDataSite(publishDir);
const photos = postgresPhotoStore(db, dataSite);
const publisher = createPublisher({
  db,
  campusId: "sbu",
  target: fsTarget(publishDir),
  photos,
  dataSite,
  dataBaseUrl: "http://data.localhost:8788",
  clock,
  log: (message, error) => console.error(message, error),
});
const app = await buildApp({
  db,
  clock,
  config: { webOrigin: env.E2E_WEB_ORIGIN, campusId: "sbu", commit: null },
  publisher,
  photos,
});
const invites: string[] = [];
for (let i = 1; i <= env.E2E_INVITES; i += 1) {
  const invite = await bootstrapAdminInvite(db, {
    displayName: `E2E Admin ${i}`,
    now: clock.now(),
    webOrigin: env.E2E_WEB_ORIGIN,
  });
  invites.push(invite.url);
}
mkdirSync(dirname(env.E2E_STATE), { recursive: true });
// Fresh invites each run, so the tests' "next unused invite" counter starts over.
rmSync(`${env.E2E_STATE}.used`, { force: true });
writeFileSync(env.E2E_STATE, JSON.stringify({ publishDir, invites, now: env.E2E_NOW }, null, 2));

const shutdown = async () => {
  publisher.close();
  await app.close();
  rmSync(publishDir, { recursive: true, force: true });
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
await app.listen({ port: env.E2E_PORT, host: "127.0.0.1" });
console.log(`e2e api on http://127.0.0.1:${env.E2E_PORT}, publishing to ${publishDir}`);
