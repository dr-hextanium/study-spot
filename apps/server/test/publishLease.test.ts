import { expect, test } from "bun:test";
import { bundle_state, photo_blob, spot, spot_photo } from "@perch/db";
import { eq, sql } from "drizzle-orm";
import { photoPath, postgresPhotoStore, sha256Hex } from "../src/photos/store.ts";
import { createPublisher, type Publisher } from "../src/publish/publisher.ts";
import type { PublishFile, PublishTarget } from "../src/publish/target.ts";
import { fakePages, type Pages, target } from "./fakePages.ts";
import { DATA_BASE_URL, manualTimers, NOW, setup, type TestContext } from "./helpers.ts";

/** A target that waits at a gate before deploying, recording overlap across publishers. */
function gate(inner: PublishTarget, shared: { active: number; max: number; deploys: number }) {
  let open: () => void = () => {};
  let entered: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const t: PublishTarget = {
    async deploy(files: readonly PublishFile[]) {
      shared.active += 1;
      shared.max = Math.max(shared.max, shared.active);
      entered();
      await opened;
      try {
        shared.deploys += 1;
        return await inner.deploy(files);
      } finally {
        shared.active -= 1;
      }
    },
  };
  return { target: t, waiting, open: () => open() };
}

function publisherOn(ctx: TestContext, pages: Pages, t: PublishTarget): Publisher {
  return createPublisher({
    db: ctx.db,
    campusId: "sbu",
    target: t,
    photos: postgresPhotoStore(ctx.db, pages.site),
    dataSite: pages.site,
    dataBaseUrl: DATA_BASE_URL,
    clock: ctx.clock,
    timers: manualTimers(),
  });
}

async function approvedPhoto(ctx: TestContext, n: number): Promise<string> {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 0xff, 0xd9]);
  const sha = sha256Hex(bytes);
  await ctx.photos.put({ sha256: sha, bytes, contentType: "image/jpeg" });
  await ctx.db.insert(spot_photo).values({
    spot_id: ctx.ids.spotIds["sac-lounge"],
    blob_sha256: sha,
    taken_at: NOW,
    approved_at: NOW,
  });
  return sha;
}

async function leaseRow(ctx: TestContext) {
  const [row] = await ctx.db.select().from(bundle_state).where(eq(bundle_state.campus_id, "sbu"));
  return row;
}

test("two publishers on one database never deploy at the same time", async () => {
  const pages = fakePages();
  const ctx = await setup({ target: target(pages), dataSite: pages.site });
  const shared = { active: 0, max: 0, deploys: 0 };
  const a = gate(target(pages), shared);
  const b = gate(target(pages), shared);
  const pa = publisherOn(ctx, pages, a.target);
  const pb = publisherOn(ctx, pages, b.target);

  const runA = pa.runNow();
  await a.waiting;
  expect((await pb.status()).running).toBe(true);
  const busy = await pb.runNow();
  expect(busy.ok).toBe(false);
  if (!busy.ok) expect(busy.error).toBe("another publish is running");
  // A busy run is not a failure: it leaves no error behind.
  expect((await leaseRow(ctx))?.last_error).toBeNull();

  a.open();
  expect((await runA).ok).toBe(true);
  expect((await leaseRow(ctx))?.publishing_owner).toBeNull();
  b.open();
  expect((await pb.runNow()).ok).toBe(true);
  expect(shared.max).toBe(1);
  expect(shared.deploys).toBe(2);
  pa.close();
  pb.close();
});

test("a stale manifest cannot drop a cleared photo: the second publisher waits its turn", async () => {
  const pages = fakePages();
  const ctx = await setup({ target: target(pages), dataSite: pages.site });
  const sha = await approvedPhoto(ctx, 21);
  const shared = { active: 0, max: 0, deploys: 0 };
  const a = gate(target(pages), shared);
  const pa = publisherOn(ctx, pages, a.target);
  const pb = publisherOn(ctx, pages, target(pages));

  // A builds a manifest with the photo, then the spot is unpublished. B would build one
  // without it (not cleared yet, not in the bundle); A then clears the photo's bytes.
  const runA = pa.runNow();
  await a.waiting;
  await ctx.db
    .update(spot)
    .set({ status: "draft" })
    .where(eq(spot.id, ctx.ids.spotIds["sac-lounge"]));
  expect((await pb.runNow()).ok).toBe(false);
  a.open();
  const first = await runA;
  expect(first.ok && first.offloaded.includes(sha)).toBe(true);

  // B runs only now, and lists the cleared photo although its spot is unpublished.
  expect((await pb.runNow()).ok).toBe(true);
  expect(pages.lastManifest()[`/${photoPath(sha)}`]).toBeDefined();
  expect(pages.servedBytes(photoPath(sha))).not.toBeNull();
  pa.close();
  pb.close();
});

test("a crashed run's lease expires and the next run takes it over", async () => {
  const pages = fakePages();
  const ctx = await setup({ target: target(pages), dataSite: pages.site });
  await ctx.db
    .insert(bundle_state)
    .values({
      campus_id: "sbu",
      publishing_owner: "crashed",
      publishing_until: sql`now() + interval '5 minutes'`,
    })
    .onConflictDoUpdate({
      target: bundle_state.campus_id,
      set: { publishing_owner: "crashed", publishing_until: sql`now() + interval '5 minutes'` },
    });
  expect((await ctx.publisher.runNow()).ok).toBe(false);

  await ctx.db
    .update(bundle_state)
    .set({ publishing_until: sql`now() - interval '1 second'` })
    .where(eq(bundle_state.campus_id, "sbu"));
  expect((await ctx.publisher.runNow()).ok).toBe(true);
  expect((await leaseRow(ctx))?.publishing_owner).toBeNull();
});

test("a run that lost its lease mid-deploy clears no bytes", async () => {
  const pages = fakePages();
  const ctx = await setup({ target: target(pages), dataSite: pages.site });
  const sha = await approvedPhoto(ctx, 23);
  const a = gate(target(pages), { active: 0, max: 0, deploys: 0 });
  const pa = publisherOn(ctx, pages, a.target);
  const runA = pa.runNow();
  await a.waiting;
  await ctx.db
    .update(bundle_state)
    .set({ publishing_owner: "someone-else" })
    .where(eq(bundle_state.campus_id, "sbu"));
  a.open();
  const outcome = await runA;
  expect(outcome.ok && outcome.offloaded).toEqual([]);
  const [row] = await ctx.db.select().from(photo_blob).where(eq(photo_blob.sha256, sha));
  expect(row?.bytes).not.toBeNull();
  // The other owner's lease is left alone.
  expect((await leaseRow(ctx))?.publishing_owner).toBe("someone-else");
  pa.close();
});

test("a run whose lease is gone before its deploy does not deploy", async () => {
  const pages = fakePages();
  const ctx = await setup({ target: target(pages), dataSite: pages.site });
  let deploys = 0;
  const stealing: PublishTarget = {
    deploy: async (files) => {
      deploys += 1;
      return target(pages).deploy(files);
    },
  };
  const p = createPublisher({
    db: ctx.db,
    campusId: "sbu",
    target: stealing,
    photos: {
      put: async () => {},
      // The steal happens while the run reads photo data, before its deploy.
      get: async () => null,
    },
    dataSite: pages.site,
    dataBaseUrl: DATA_BASE_URL,
    clock: ctx.clock,
    timers: manualTimers(),
    beforeDeploy: async () => {
      await ctx.db
        .update(bundle_state)
        .set({ publishing_owner: "thief" })
        .where(eq(bundle_state.campus_id, "sbu"));
    },
  });
  const outcome = await p.runNow();
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.error).toContain("lease");
  expect(deploys).toBe(0);
  p.close();
});
