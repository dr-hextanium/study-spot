import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { seed } from "@perch/db/seed";
import { createTestDb } from "@perch/db/testing";
import { z } from "zod";
import { buildApp } from "../src/app.ts";
import { bootstrapAdminInvite } from "../src/auth/invites.ts";
import type { Clock } from "../src/clock.ts";
import { postgresPhotoStore } from "../src/photos/store.ts";
import { dbKnownSpots } from "../src/ping/knownSpots.ts";
import { fsDataSite } from "../src/publish/dataSite.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import { createPublisher } from "../src/publish/publisher.ts";

/**
 * The real server for apps/web's Playwright run: buildApp on a seeded PGlite
 * database, publishing to a temp directory. Its clock starts at E2E_NOW and
 * ticks, so seed terms stay current whatever the date. Writes the admin invite
 * links and the publish directory to E2E_STATE for the tests. Also serves the
 * publish directory as the static data site on E2E_DATA_PORT, the way the CDN
 * will, and publishes once at boot when E2E_PUBLISH_ON_BOOT=1 so student screens
 * have a bundle to read.
 */
const Env = z.object({
  E2E_PORT: z.coerce.number().int().positive().default(8787),
  E2E_WEB_ORIGIN: z.url().default("http://localhost:4173"),
  E2E_STATE: z.string().min(1),
  E2E_NOW: z.iso.datetime().default("2026-10-13T16:00:00.000Z"),
  E2E_INVITES: z.coerce.number().int().positive().default(40),
  E2E_DATA_PORT: z.coerce.number().int().positive().default(8788),
  E2E_PUBLISH_ON_BOOT: z.enum(["0", "1"]).default("0"),
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
const knownSpots = dbKnownSpots(db, "sbu", clock);
const publisher = createPublisher({
  db,
  campusId: "sbu",
  target: fsTarget(publishDir),
  photos,
  dataSite,
  dataBaseUrl: `http://data.localhost:${env.E2E_DATA_PORT}`,
  clock,
  log: (message, error) => console.error(message, error),
  knownSpots,
});

const TYPES: Readonly<Record<string, string>> = {
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".txt": "text/plain",
};
const serveData = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const path = new URL(req.url ?? "/", "http://data.local").pathname;
  // Date comes from the e2e clock, not the host, so clock-skew handling is testable.
  res.sendDate = false;
  const headers: Record<string, string> = {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "Date",
    date: clock.now().toUTCString(),
  };
  if (path.includes("..") || path === "/") {
    res.writeHead(404, headers).end();
    return;
  }
  try {
    const body = await readFile(join(publishDir, path));
    headers["content-type"] = TYPES[extname(path)] ?? "application/octet-stream";
    headers["cache-control"] =
      path === "/bundle-latest.json" ? "no-cache" : "public, max-age=31536000, immutable";
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404, headers).end();
  }
};
const dataServers = ["127.0.0.1", "::1"].map((host) => {
  const server = createServer((req, res) => void serveData(req, res));
  server.on("error", (e: NodeJS.ErrnoException) => {
    console.error(`data server on ${host}:`, e.message);
    // A port held by another process would serve the wrong data silently.
    if (e.code === "EADDRINUSE") process.exit(1);
  });
  server.listen(env.E2E_DATA_PORT, host);
  return server;
});
if (env.E2E_PUBLISH_ON_BOOT === "1") {
  const out = await publisher.runNow();
  if (!out.ok) console.error("boot publish failed:", out.error);
}

const app = await buildApp({
  db,
  clock,
  config: { webOrigin: env.E2E_WEB_ORIGIN, campusId: "sbu", commit: null },
  publisher,
  photos,
  knownSpots,
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
  await Promise.all(dataServers.map((s) => new Promise<void>((done) => s.close(() => done()))));
  await app.close();
  rmSync(publishDir, { recursive: true, force: true });
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
await app.listen({ port: env.E2E_PORT, host: "127.0.0.1" });
console.log(
  `e2e api on http://127.0.0.1:${env.E2E_PORT}, data on http://data.localhost:${env.E2E_DATA_PORT}, publishing to ${publishDir}`,
);
