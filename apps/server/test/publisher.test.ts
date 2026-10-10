import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BundlePointer, PublishStatus, parseBundle, SurveySpot } from "@perch/core";
import { building, bundle_state, campus, spot, spot_photo } from "@perch/db";
import { eq } from "drizzle-orm";
import { sha256Hex } from "../src/photos/store.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import type { PublishFile, PublishTarget } from "../src/publish/target.ts";
import {
  body,
  DATA_BASE_URL,
  NOW,
  type SignedIn,
  setup,
  signIn,
  type TestContext,
  writeId,
} from "./helpers.ts";

function readJson(dir: string, path: string): unknown {
  return JSON.parse(readFileSync(join(dir, path), "utf8"));
}

async function state(ctx: TestContext) {
  const [row] = await ctx.db.select().from(bundle_state).where(eq(bundle_state.campus_id, "sbu"));
  return row;
}

/** Waits until no publish is running. */
async function idle(ctx: TestContext): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (!(await ctx.publisher.status()).running) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("publish never finished");
}

/** A target that blocks every deploy until release() and records overlap. */
function gatedTarget(inner: PublishTarget) {
  let active = 0;
  let maxActive = 0;
  let deploys = 0;
  let open: () => void = () => {};
  let gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const target: PublishTarget = {
    async deploy(files: readonly PublishFile[]) {
      deploys += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
      return inner.deploy(files);
    },
  };
  return {
    target,
    /** Resolves once `n` deploys have started (and are waiting at the gate). */
    async started(n: number): Promise<void> {
      for (let i = 0; i < 400 && deploys < n; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (deploys < n) throw new Error(`only ${deploys} deploys started`);
    },
    release() {
      open();
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    stats: () => ({ deploys, maxActive }),
  };
}

async function markDirty(ctx: TestContext, who: SignedIn): Promise<void> {
  // Re-verifying a published spot is a dirty write.
  const res = await ctx.app.inject({
    method: "POST",
    url: `/survey/spots/${ctx.ids.spotIds["sac-lounge"]}/verify`,
    headers: who.headers,
    payload: { client_write_id: writeId(), base_version: 1, groups: ["power"] },
  });
  expect(res.statusCode).toBe(200);
}

test("a publish writes photos, the hashed bundle, and the pointer, then clears dirty", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  expect((await state(ctx))?.dirty).toBe(true);

  const outcome = await ctx.publisher.runNow();
  if (!outcome.ok) throw new Error(outcome.error);
  const pointer = BundlePointer.parse(readJson(ctx.publishDir, "bundle-latest.json"));
  expect(pointer.url).toBe(`bundle.${outcome.hash}.json`);
  const bundleBytes = readFileSync(join(ctx.publishDir, pointer.url));
  expect(sha256Hex(bundleBytes).slice(0, 16)).toBe(pointer.hash);
  const parsed = parseBundle(JSON.parse(bundleBytes.toString("utf8")));
  expect(parsed.ok).toBe(true);
  expect(readFileSync(join(ctx.publishDir, "_headers"), "utf8")).toContain(
    "Access-Control-Allow-Origin: *",
  );

  const after = await state(ctx);
  expect(after).toMatchObject({ dirty: false, last_hash: outcome.hash, last_error: null });
  expect(after?.last_published_at?.toISOString()).toBe(NOW.toISOString());
  expect(after?.last_warnings).toEqual([]);
});

test("approved photos get absolute data-site URLs and are published; others are not", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const admin = await signIn(ctx, "admin", "Admin");
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const upload = async (seed: number) => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, seed, 0xff, 0xd9]);
    const form = new FormData();
    form.append("spot_id", spotId);
    form.append("client_write_id", writeId());
    form.append("file", new Blob([bytes], { type: "image/jpeg" }), "p.jpg");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/survey/photos",
      headers: ana.headers,
      payload: form,
    });
    expect(res.statusCode).toBe(201);
    const sha = sha256Hex(bytes);
    const [row] = await ctx.db.select().from(spot_photo).where(eq(spot_photo.blob_sha256, sha));
    if (!row) throw new Error("photo row missing");
    return { id: row.id, sha, bytes };
  };
  const approved = await upload(1);
  const pending = await upload(2);
  await ctx.app.inject({
    method: "POST",
    url: `/survey/photos/${approved.id}/approve`,
    headers: admin.headers,
    payload: { client_write_id: writeId() },
  });

  const outcome = await ctx.publisher.runNow();
  if (!outcome.ok) throw new Error(outcome.error);
  const url = `${DATA_BASE_URL}/photos/${approved.sha}.jpg`;
  const pointer = BundlePointer.parse(readJson(ctx.publishDir, "bundle-latest.json"));
  const parsed = parseBundle(readJson(ctx.publishDir, pointer.url));
  if (!parsed.ok) throw new Error(parsed.detail);
  const sac = parsed.bundle.spots.find((s) => s.id === spotId);
  expect(sac?.photos.map((p) => p.url)).toEqual([url]);
  expect(Array.from(readFileSync(join(ctx.publishDir, `photos/${approved.sha}.jpg`)))).toEqual(
    Array.from(approved.bytes),
  );
  expect(existsSync(join(ctx.publishDir, `photos/${pending.sha}.jpg`))).toBe(false);

  const detail = await ctx.app.inject({
    method: "GET",
    url: `/survey/spots/${spotId}`,
    headers: ana.headers,
  });
  const photo = SurveySpot.parse(body(detail)).photos.find((p) => p.id === approved.id);
  expect(photo?.url).toBe(url);
});

test("a failed publish keeps dirty and records the error; the next one recovers", async () => {
  let fail = true;
  const failing: PublishTarget = {
    async deploy() {
      if (fail) throw new Error("pages is down");
      return { uploaded: [], skipped: [] };
    },
  };
  const ctx = await setup({ target: failing });
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  const outcome = await ctx.publisher.runNow();
  expect(outcome).toEqual({ ok: false, error: "pages is down" });
  expect(await state(ctx)).toMatchObject({ dirty: true, last_error: "pages is down" });

  fail = false;
  expect((await ctx.publisher.runNow()).ok).toBe(true);
  expect(await state(ctx)).toMatchObject({ dirty: false, last_error: null });
});

test("writes are debounced into one publish", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  await ctx.app.inject({
    method: "POST",
    url: `/survey/spots/${ctx.ids.spotIds["kelly-rcc"]}/verify`,
    headers: me.headers,
    payload: { client_write_id: writeId(), base_version: 1, groups: ["power"] },
  });
  expect(ctx.publisher.scheduled).toBe(2);
  expect(ctx.timers.pending()).toBe(1);
  ctx.timers.fire();
  await idle(ctx);
  expect(existsSync(join(ctx.publishDir, "bundle-latest.json"))).toBe(true);
  expect((await state(ctx))?.dirty).toBe(false);
});

test("a publish requested while one runs never overlaps and collapses into one rerun", async () => {
  const ctx0 = await setup();
  const gated = gatedTarget(fsTarget(ctx0.publishDir));
  const ctx = await setup({ target: gated.target });
  const first = ctx.publisher.runNow();
  const second = ctx.publisher.runNow();
  const third = ctx.publisher.runNow();
  expect(second).toBe(third);
  await gated.started(1);
  expect((await ctx.publisher.status()).running).toBe(true);
  gated.release();
  await first;
  await gated.started(2);
  gated.release();
  await second;
  expect(gated.stats()).toEqual({ deploys: 2, maxActive: 1 });
});

test("a write that lands mid-publish keeps dirty and schedules another publish", async () => {
  const ctx0 = await setup();
  const gated = gatedTarget(fsTarget(ctx0.publishDir));
  const ctx = await setup({ target: gated.target });
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  const run = ctx.publisher.runNow();
  // The run has read write_seq and is blocked in deploy.
  await gated.started(1);
  await ctx.app.inject({
    method: "POST",
    url: `/survey/spots/${ctx.ids.spotIds["kelly-rcc"]}/verify`,
    headers: me.headers,
    payload: { client_write_id: writeId(), base_version: 1, groups: ["hours"] },
  });
  gated.release();
  const first = await run;
  if (!first.ok) throw new Error(first.error);
  expect((await state(ctx))?.dirty).toBe(true);

  // The follow-up publish was scheduled; firing it picks up the late write.
  expect(ctx.timers.pending()).toBe(1);
  ctx.timers.fire();
  await gated.started(2);
  gated.release();
  await idle(ctx);
  const after = await state(ctx);
  expect(after?.dirty).toBe(false);
  expect(after?.last_hash).not.toBe(first.hash);
});

test("start publishes only when a previous process left the bundle dirty", async () => {
  const clean = await setup();
  await clean.publisher.start();
  expect(existsSync(join(clean.publishDir, "bundle-latest.json"))).toBe(false);

  const dirty = await setup();
  await dirty.db.insert(bundle_state).values({ campus_id: "sbu", dirty: true, write_seq: 3 });
  await dirty.publisher.start();
  expect(existsSync(join(dirty.publishDir, "bundle-latest.json"))).toBe(true);
  expect((await state(dirty))?.dirty).toBe(false);
});

test("admin publish endpoints: status, publish now, admin only", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const admin = await signIn(ctx, "admin", "Admin");
  expect(
    (await ctx.app.inject({ method: "GET", url: "/admin/publish", headers: me.headers }))
      .statusCode,
  ).toBe(403);
  const before = PublishStatus.parse(
    body(await ctx.app.inject({ method: "GET", url: "/admin/publish", headers: admin.headers })),
  );
  expect(before).toEqual({
    dirty: false,
    running: false,
    last_published_at: null,
    last_hash: null,
    last_attempt_at: null,
    warnings: [],
    last_error: null,
    waiting_until: null,
  });
  const res = await ctx.app.inject({
    method: "POST",
    url: "/admin/publish",
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  const after = PublishStatus.parse(body(res));
  expect(after.last_hash).toMatch(/^[a-f0-9]{16}$/);
  expect(after.last_published_at).toBe(NOW.toISOString());
});

test("an unapproved cover photo never reaches the bundle or the uploaded files", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x07, 0xff, 0xd9]);
  const form = new FormData();
  form.append("spot_id", spotId);
  form.append("client_write_id", writeId());
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), "p.jpg");
  const up = await ctx.app.inject({
    method: "POST",
    url: "/survey/photos",
    headers: ana.headers,
    payload: form,
  });
  expect(up.statusCode).toBe(201);
  const sha = sha256Hex(bytes);
  const [row] = await ctx.db.select().from(spot_photo).where(eq(spot_photo.blob_sha256, sha));
  if (!row) throw new Error("photo row missing");
  const cover = await ctx.app.inject({
    method: "POST",
    url: `/survey/photos/${row.id}/cover`,
    headers: ana.headers,
    payload: { client_write_id: writeId() },
  });
  expect(cover.statusCode).toBe(200);
  const [after] = await ctx.db.select().from(spot_photo).where(eq(spot_photo.id, row.id));
  expect(after?.is_cover).toBe(true);
  expect(after?.approved_at).toBeNull();

  const seedCovers = (await ctx.db.select().from(spot_photo))
    .filter((p) => p.approved_at !== null && p.is_cover)
    .map((p) => `photos/${p.blob_sha256}.jpg`);
  expect(seedCovers).toHaveLength(1);

  const outcome = await ctx.publisher.runNow();
  if (!outcome.ok) throw new Error(outcome.error);
  // Only the seed's approved cover is uploaded; this unapproved one is not.
  expect(outcome.uploaded.filter((f) => f.startsWith("photos/"))).toEqual(seedCovers);
  expect(existsSync(join(ctx.publishDir, `photos/${sha}.jpg`))).toBe(false);
  const pointer = BundlePointer.parse(readJson(ctx.publishDir, "bundle-latest.json"));
  const raw = readFileSync(join(ctx.publishDir, pointer.url), "utf8");
  expect(raw).not.toContain(sha);
  const parsed = parseBundle(JSON.parse(raw));
  if (!parsed.ok) throw new Error(parsed.detail);
  expect(parsed.bundle.spots.find((s) => s.id === spotId)?.photos).toEqual([]);
});

test("the photo url rewrite touches only the publishing campus", async () => {
  const ctx = await setup();
  const mine = new Uint8Array([0xff, 0xd8, 0xff, 0x11, 0xff, 0xd9]);
  const theirs = new Uint8Array([0xff, 0xd8, 0xff, 0x22, 0xff, 0xd9]);
  const store = ctx.photos;
  for (const bytes of [mine, theirs]) {
    await store.put({ sha256: sha256Hex(bytes), bytes, contentType: "image/jpeg" });
  }
  await ctx.db.insert(campus).values({ id: "other", name: "Other", tz: "America/New_York" });
  await ctx.db
    .insert(building)
    .values({ id: "other-hall", campus_id: "other", name: "Other Hall", lat: 1, lng: 1 });
  const [otherSpot] = await ctx.db
    .insert(spot)
    .values({
      slug: "other-lounge",
      building_id: "other-hall",
      floor: "1",
      official_name: "Other Lounge",
      lat: 1,
      lng: 1,
      status: "published",
    })
    .returning({ id: spot.id });
  if (!otherSpot) throw new Error("spot insert returned nothing");
  const otherUrl = `https://other.example/photos/${sha256Hex(theirs)}.jpg`;
  await ctx.db.insert(spot_photo).values({
    spot_id: otherSpot.id,
    blob_sha256: sha256Hex(theirs),
    url: otherUrl,
    taken_at: NOW,
    approved_at: NOW,
  });
  await ctx.db.insert(spot_photo).values({
    spot_id: ctx.ids.spotIds["sac-lounge"],
    blob_sha256: sha256Hex(mine),
    taken_at: NOW,
    approved_at: NOW,
  });

  const outcome = await ctx.publisher.runNow();
  if (!outcome.ok) throw new Error(outcome.error);
  const [other] = await ctx.db
    .select()
    .from(spot_photo)
    .where(eq(spot_photo.spot_id, otherSpot.id));
  expect(other?.url).toBe(otherUrl);
  const [own] = await ctx.db
    .select()
    .from(spot_photo)
    .where(eq(spot_photo.blob_sha256, sha256Hex(mine)));
  expect(own?.url).toBe(`${DATA_BASE_URL}/photos/${sha256Hex(mine)}.jpg`);
  expect(outcome.uploaded).toContain(`photos/${sha256Hex(mine)}.jpg`);
  expect(outcome.uploaded).not.toContain(`photos/${sha256Hex(theirs)}.jpg`);
});

/** Moves the test clock and the manual timers together, letting async runs settle. */
async function tick(ctx: TestContext, ms: number): Promise<void> {
  ctx.clock.advance(ms);
  ctx.timers.advance(ms);
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function flakyTarget(inner: PublishTarget, failures: number) {
  let calls = 0;
  const target: PublishTarget = {
    async deploy(files: readonly PublishFile[]) {
      calls += 1;
      if (calls <= failures) throw new Error("pages is down");
      return inner.deploy(files);
    },
  };
  return {
    target,
    calls: () => calls,
    fail(n: number) {
      failures = calls + n;
    },
  };
}

test("a failed publish is retried after 60 s with no new writes", async () => {
  const flaky = flakyTarget(fsTarget((await setup()).publishDir), 1);
  const ctx = await setup({ target: flaky.target });
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  expect((await ctx.publisher.runNow()).ok).toBe(false);
  expect(ctx.timers.delays()).toEqual([60_000]);
  await tick(ctx, 59_000);
  expect(flaky.calls()).toBe(1);
  await tick(ctx, 1_000);
  await idle(ctx);
  expect(flaky.calls()).toBe(2);
  expect(await state(ctx)).toMatchObject({ dirty: false, last_error: null });
  expect(ctx.timers.pending()).toBe(0);
});

test("repeated failures back off 60, 120, 300, 300 and reset after a success", async () => {
  const flaky = flakyTarget(fsTarget((await setup()).publishDir), 5);
  const ctx = await setup({ target: flaky.target });
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  const seen: number[][] = [];
  expect((await ctx.publisher.runNow()).ok).toBe(false);
  seen.push(ctx.timers.delays());
  for (const wait of [60_000, 120_000, 300_000]) {
    await tick(ctx, wait);
    await idle(ctx);
    seen.push(ctx.timers.delays());
  }
  expect(seen).toEqual([[60_000], [120_000], [300_000], [300_000]]);
  await tick(ctx, 300_000);
  await idle(ctx);
  expect(flaky.calls()).toBe(5);
  expect(ctx.timers.delays()).toEqual([300_000]);
  await tick(ctx, 300_000);
  await idle(ctx);
  expect(flaky.calls()).toBe(6);
  expect(ctx.timers.pending()).toBe(0);
  expect((await state(ctx))?.dirty).toBe(false);

  // After a success the backoff starts over.
  await ctx.db.update(bundle_state).set({ dirty: true });
  flaky.fail(1);
  expect((await ctx.publisher.runNow()).ok).toBe(false);
  expect(ctx.timers.delays()).toEqual([60_000]);
});

test("steady writes cannot postpone a publish past 60 s from the first write", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  await markDirty(ctx, me);
  const pointer = join(ctx.publishDir, "bundle-latest.json");
  expect(existsSync(pointer)).toBe(false);
  for (let t = 0; t < 60_000; t += 20_000) {
    await tick(ctx, 20_000);
    ctx.publisher.schedule();
  }
  await tick(ctx, 1);
  await idle(ctx);
  expect(existsSync(pointer)).toBe(true);
});
