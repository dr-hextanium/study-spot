import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BundlePointer, parseBundle } from "@study-spot/core";
import { openDb, spot, spot_photo, surveyor } from "@study-spot/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { postgresPhotoStore, sha256Hex } from "../src/photos/store.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import { createPublisher } from "../src/publish/publisher.ts";
import { type Tx, type WriteOutcome, withWrite } from "../src/writes/withWrite.ts";

/**
 * Against a migrated, seeded Postgres through postgres.js:
 * 1. Two concurrent sends of one client write id must run the write once. PGlite
 *    serializes transactions, so only real Postgres exercises the receipt lock.
 * 2. A publish with one approved photo to a temp directory, checking the files,
 *    proves bytea and the publisher on the production driver.
 * Usage: node apps/server/scripts/smoke-publish.ts
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const { db, close } = openDb(url);
const dir = mkdtempSync(join(tmpdir(), "smoke-publish-"));
const base = "https://data.example.org";
try {
  const [sac] = await db.select().from(spot).where(eq(spot.slug, "sac-lounge"));
  if (!sac) throw new Error("seed spot sac-lounge missing; run db:seed first");

  const [who] = await db
    .insert(surveyor)
    .values({ display_name: "Smoke" })
    .returning({ id: surveyor.id });
  if (!who) throw new Error("surveyor insert returned nothing");
  let runs = 0;
  const slowWrite = async (tx: Tx): Promise<WriteOutcome<{ ok: true }>> => {
    runs += 1;
    await tx.update(spot).set({ common_name: "Smoke" }).where(eq(spot.id, sac.id));
    // Hold the transaction open so the second send arrives while the first is running.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { status: 200, body: { ok: true }, audit: null, dirty: false };
  };
  const info = {
    surveyorId: who.id,
    clientWriteId: randomUUID(),
    kind: "smoke.concurrent",
    schema: z.object({ ok: z.literal(true) }),
  };
  const writeDeps = { db, campusId: "sbu", publisher: { schedule: () => {} } };
  const [a, b] = await Promise.all([
    withWrite(writeDeps, info, slowWrite),
    withWrite(writeDeps, info, slowWrite),
  ]);
  if (runs !== 1 || a.replayed === b.replayed) {
    throw new Error(`concurrent same-id writes ran ${runs} times`);
  }
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x80, 0xff, 0xd9]);
  const sha = sha256Hex(bytes);
  const photos = postgresPhotoStore(db);
  await photos.put({ sha256: sha, bytes, contentType: "image/jpeg" });
  await db.insert(spot_photo).values({
    spot_id: sac.id,
    blob_sha256: sha,
    taken_at: new Date(),
    approved_at: new Date(),
  });

  const publisher = createPublisher({
    db,
    campusId: "sbu",
    target: fsTarget(dir),
    photos,
    dataBaseUrl: base,
    clock: { now: () => new Date("2026-10-13T18:00:00Z") },
  });
  const outcome = await publisher.runNow();
  publisher.close();
  if (!outcome.ok) throw new Error(outcome.error);

  const pointer = BundlePointer.parse(
    JSON.parse(readFileSync(join(dir, "bundle-latest.json"), "utf8")),
  );
  const parsed = parseBundle(JSON.parse(readFileSync(join(dir, pointer.url), "utf8")));
  if (!parsed.ok) throw new Error(parsed.detail);
  const published = parsed.bundle.spots.find((s) => s.id === sac.id);
  if (!published?.photos.some((p) => p.url === `${base}/photos/${sha}.jpg`)) {
    throw new Error("approved photo missing from the bundle");
  }
  const written = readFileSync(join(dir, `photos/${sha}.jpg`));
  if (!written.equals(Buffer.from(bytes))) throw new Error("photo bytes changed in transit");
  console.log(
    `write and publish smoke ok: 1 run for 2 sends, ${parsed.bundle.spots.length} spots, hash ${pointer.hash}`,
  );
} catch (error) {
  console.error("publish smoke failed:", error);
  process.exitCode = 1;
} finally {
  await close();
}
