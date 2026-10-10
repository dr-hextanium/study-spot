import { expect, test } from "bun:test";
import { building, bundle_state, campus, photo_blob, spot, spot_photo } from "@perch/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { type PhotoStore, photoPath, postgresPhotoStore, sha256Hex } from "../src/photos/store.ts";
import type { DataSite } from "../src/publish/dataSite.ts";
import { CF_API, type FetchLike, pagesHash, pagesTarget } from "../src/publish/pagesTarget.ts";
import { createPublisher, type PublishOutcome } from "../src/publish/publisher.ts";
import { DATA_BASE_URL, manualTimers, NOW, setup, type TestContext } from "./helpers.ts";

const PROJECT = `${CF_API}/accounts/acc/pages/projects/perch-data`;
const Hashes = z.object({ hashes: z.array(z.string()) });
const Uploads = z.array(z.object({ key: z.string(), value: z.string() }));

/**
 * A stateful Cloudflare Pages project: an asset store that remembers uploads,
 * deployments that each replace the whole site with their manifest, and the
 * live site read back over "HTTP". The live site keeps its own copy of each
 * served file, so the asset store can forget a hash while the site still serves it.
 */
function fakePages() {
  const assets = new Map<string, Uint8Array>();
  let live = new Map<string, Uint8Array>();
  const deployments: Record<string, string>[] = [];
  const uploadedKeys: string[] = [];
  const ok = (result: unknown) =>
    new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 });
  const fetch: FetchLike = async (url, init) => {
    if (url === `${PROJECT}/upload-token`) return ok({ jwt: "jwt" });
    if (url === `${CF_API}/pages/assets/check-missing`) {
      const { hashes } = Hashes.parse(JSON.parse(String(init.body)));
      return ok(hashes.filter((h) => !assets.has(h)));
    }
    if (url === `${CF_API}/pages/assets/upload`) {
      for (const u of Uploads.parse(JSON.parse(String(init.body)))) {
        assets.set(u.key, new Uint8Array(Buffer.from(u.value, "base64")));
        uploadedKeys.push(u.key);
      }
      return ok(null);
    }
    if (url === `${CF_API}/pages/assets/upsert-hashes`) return ok(null);
    if (url === `${PROJECT}/deployments`) {
      const form = init.body;
      if (!(form instanceof FormData)) throw new Error("deployment body is not FormData");
      const manifest = z
        .record(z.string(), z.string())
        .parse(JSON.parse(String(form.get("manifest"))));
      const next = new Map<string, Uint8Array>();
      for (const [path, hash] of Object.entries(manifest)) {
        const bytes = assets.get(hash);
        if (!bytes) {
          return new Response(
            JSON.stringify({
              success: false,
              errors: [{ code: 8000000, message: `missing ${hash}` }],
              result: null,
            }),
            { status: 400 },
          );
        }
        next.set(path.slice(1), bytes);
      }
      live = next;
      deployments.push(manifest);
      return ok({ id: `dep-${deployments.length}` });
    }
    throw new Error(`unexpected ${url}`);
  };
  const reads = { count: 0 };
  const site: DataSite = {
    async get(path) {
      reads.count += 1;
      return live.get(path) ?? null;
    },
  };
  return {
    fetch,
    site,
    reads,
    deployments,
    uploadedKeys,
    lastManifest: () => deployments.at(-1) ?? {},
    servedBytes: (path: string) => live.get(path) ?? null,
    forgetAsset: (hash: string) => assets.delete(hash),
    dropFromSite: (path: string) => live.delete(path),
    corrupt: (path: string) => live.set(path, new Uint8Array([1, 2, 3])),
  };
}

type Pages = ReturnType<typeof fakePages>;

function target(pages: Pages) {
  return pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: pages.fetch,
  });
}

/** A JPEG-looking byte string; `n` varies the content. */
function jpeg(n: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, n + 1, n + 2, 0xff, 0xd9]);
}

async function addPhoto(
  ctx: TestContext,
  bytes: Uint8Array,
  opts: { spot?: string; approved?: boolean } = {},
): Promise<string> {
  const sha = sha256Hex(bytes);
  await ctx.photos.put({ sha256: sha, bytes, contentType: "image/jpeg" });
  await ctx.db.insert(spot_photo).values({
    spot_id: opts.spot ?? ctx.ids.spotIds["sac-lounge"],
    blob_sha256: sha,
    taken_at: NOW,
    approved_at: opts.approved === false ? null : NOW,
  });
  return sha;
}

async function blob(ctx: TestContext, sha: string) {
  const [row] = await ctx.db.select().from(photo_blob).where(eq(photo_blob.sha256, sha));
  if (!row) throw new Error(`no blob ${sha}`);
  return row;
}

function ok(outcome: PublishOutcome) {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
}

/** Every approved photo of this campus that a published spot shows, as data-site paths. */
async function approvedPublishedPaths(ctx: TestContext): Promise<string[]> {
  const rows = await ctx.db
    .select({ sha: spot_photo.blob_sha256 })
    .from(spot_photo)
    .innerJoin(spot, eq(spot.id, spot_photo.spot_id))
    .where(isNotNull(spot_photo.approved_at));
  return [...new Set(rows.flatMap((r) => (r.sha === null ? [] : [photoPath(r.sha)])))].sort();
}

/** A new process: a fresh Pages target (empty hash cache) and publisher on the same database. */
function coldPublisher(ctx: TestContext, pages: Pages, photos?: PhotoStore) {
  return createPublisher({
    db: ctx.db,
    campusId: "sbu",
    target: target(pages),
    photos: photos ?? postgresPhotoStore(ctx.db, pages.site),
    dataSite: pages.site,
    dataBaseUrl: DATA_BASE_URL,
    clock: ctx.clock,
    timers: manualTimers(),
  });
}

async function withPages() {
  const pages = fakePages();
  const ctx = await setup({ target: target(pages), dataSite: pages.site });
  return { ctx, pages };
}

test("a confirmed photo loses its Postgres bytes and keeps its hash; a pending one keeps bytes", async () => {
  const { ctx, pages } = await withPages();
  const approved = await addPhoto(ctx, jpeg(1));
  const pending = await addPhoto(ctx, jpeg(2), { approved: false });

  const first = ok(await ctx.publisher.runNow());
  expect(first.offloaded).toContain(approved);
  expect(first.offloaded).not.toContain(pending);

  const cleared = await blob(ctx, approved);
  expect(cleared.bytes).toBeNull();
  expect(cleared.offloaded_at?.toISOString()).toBe(NOW.toISOString());
  expect(cleared.pages_hash).toBe(pagesHash(jpeg(1), photoPath(approved)));
  expect(Array.from(pages.servedBytes(photoPath(approved)) ?? [])).toEqual(Array.from(jpeg(1)));
  expect((await blob(ctx, pending)).bytes).not.toBeNull();
});

test("a cold-start publish after clearing keeps every approved photo without reading bytes", async () => {
  const { ctx, pages } = await withPages();
  const shas = [await addPhoto(ctx, jpeg(1)), await addPhoto(ctx, jpeg(5))];
  const first = ok(await ctx.publisher.runNow());
  for (const sha of shas) expect(first.offloaded).toContain(sha);
  const published = await approvedPublishedPaths(ctx);
  const photoPaths = (m: Record<string, string>) =>
    Object.keys(m)
      .filter((p) => p.startsWith("/photos/"))
      .map((p) => p.slice(1))
      .sort();
  expect(photoPaths(pages.lastManifest())).toEqual(published);

  // Every published photo's bytes are now gone from Postgres.
  const left = await ctx.db
    .select({ sha: photo_blob.sha256 })
    .from(photo_blob)
    .where(withBytes(published));
  expect(left).toEqual([]);

  // A new process: no hash cache, and a store that fails if anything reads bytes.
  const reads = { count: 0 };
  const counting: PhotoStore = {
    put: async () => {},
    get: async () => {
      reads.count += 1;
      return null;
    },
  };
  const before = pages.uploadedKeys.length;
  pages.reads.count = 0;
  const cold = coldPublisher(ctx, pages, counting);
  ok(await cold.runNow());
  cold.close();

  expect(reads.count).toBe(0);
  expect(pages.reads.count).toBe(0);
  expect(photoPaths(pages.lastManifest())).toEqual(published);
  // Only the new bundle and the pointer were uploaded, no photo.
  const photoHashes = new Set(
    Object.entries(pages.lastManifest())
      .filter(([p]) => p.startsWith("/photos/"))
      .map(([, h]) => h),
  );
  expect(pages.uploadedKeys.slice(before).filter((k) => photoHashes.has(k))).toEqual([]);
  for (const path of published) {
    const served = pages.servedBytes(path);
    expect(served === null ? null : `photos/${sha256Hex(served)}.jpg`).toBe(path);
  }
});

/** Blob rows among these photo paths that still hold bytes. */
function withBytes(paths: readonly string[]) {
  const shas = paths.map((p) => p.slice("photos/".length, -".jpg".length));
  return and(inArray(photo_blob.sha256, shas), isNotNull(photo_blob.bytes));
}

test("an unpublished spot's cleared photo stays in later deploys", async () => {
  const { ctx, pages } = await withPages();
  const sha = await addPhoto(ctx, jpeg(7));
  expect(ok(await ctx.publisher.runNow()).offloaded).toContain(sha);
  await ctx.db
    .update(spot)
    .set({ status: "draft" })
    .where(eq(spot.id, ctx.ids.spotIds["sac-lounge"]));

  const cold = coldPublisher(ctx, pages);
  ok(await cold.runNow());
  cold.close();
  expect(pages.lastManifest()[`/${photoPath(sha)}`]).toBe(pagesHash(jpeg(7), photoPath(sha)));
  expect(Array.from(pages.servedBytes(photoPath(sha)) ?? [])).toEqual(Array.from(jpeg(7)));
});

test("a cleared photo Cloudflare no longer has is uploaded again from the live site", async () => {
  const { ctx, pages } = await withPages();
  const sha = await addPhoto(ctx, jpeg(9));
  ok(await ctx.publisher.runNow());
  const hash = pagesHash(jpeg(9), photoPath(sha));
  pages.forgetAsset(hash);

  const cold = coldPublisher(ctx, pages);
  const second = ok(await cold.runNow());
  cold.close();
  expect(second.uploaded).toContain(photoPath(sha));
  expect(pages.lastManifest()[`/${photoPath(sha)}`]).toBe(hash);
  expect(Array.from(pages.servedBytes(photoPath(sha)) ?? [])).toEqual(Array.from(jpeg(9)));
});

test("a cleared photo with no copy anywhere fails the publish and the live site is kept", async () => {
  const { ctx, pages } = await withPages();
  const sha = await addPhoto(ctx, jpeg(11));
  ok(await ctx.publisher.runNow());
  const deployments = pages.deployments.length;
  pages.forgetAsset(pagesHash(jpeg(11), photoPath(sha)));
  pages.corrupt(photoPath(sha));

  const cold = coldPublisher(ctx, pages);
  const second = await cold.runNow();
  cold.close();
  expect(second.ok).toBe(false);
  if (!second.ok) expect(second.error).toContain(sha);
  expect(pages.deployments.length).toBe(deployments);
  const [state] = await ctx.db.select().from(bundle_state).where(eq(bundle_state.campus_id, "sbu"));
  expect(state?.last_error).toContain(sha);
});

test("a photo the data site does not serve exactly keeps its bytes", async () => {
  const pages = fakePages();
  const wrong: DataSite = { get: async () => new Uint8Array([0xff, 0xd8, 0xff, 0]) };
  const missing: DataSite = { get: async () => null };
  for (const site of [wrong, missing]) {
    const ctx = await setup({ target: target(pages), dataSite: site });
    const sha = await addPhoto(ctx, jpeg(13));
    expect(ok(await ctx.publisher.runNow()).offloaded).toEqual([]);
    expect((await blob(ctx, sha)).bytes).not.toBeNull();
  }
});

test("a photo also used by another campus keeps its bytes", async () => {
  const { ctx } = await withPages();
  await ctx.db.insert(campus).values({ id: "other", name: "Other", tz: "America/New_York" });
  await ctx.db
    .insert(building)
    .values({ id: "other-hall", campus_id: "other", name: "Other Hall", lat: 1, lng: 1 });
  const [other] = await ctx.db
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
  if (!other) throw new Error("spot insert returned nothing");
  const sha = await addPhoto(ctx, jpeg(15));
  await addPhoto(ctx, jpeg(15), { spot: other.id });

  expect(ok(await ctx.publisher.runNow()).offloaded).not.toContain(sha);
  expect((await blob(ctx, sha)).bytes).not.toBeNull();
});
