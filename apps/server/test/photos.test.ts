import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PHOTO_MAX_BYTES, SurveySpot } from "@perch/core";
import { building, bundle_state, campus, photo_blob, spot, spot_photo } from "@perch/db";
import { eq } from "drizzle-orm";
import { sha256Hex } from "../src/photos/store.ts";
import { fsDataSite } from "../src/publish/dataSite.ts";
import { fsTarget } from "../src/publish/fsTarget.ts";
import { body, NOW, type SignedIn, setup, signIn, type TestContext, writeId } from "./helpers.ts";

/** A byte string that passes the JPEG magic check; `seed` varies the content. */
function jpeg(size = 64, seed = 1): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size - 2; i++) bytes[i] = (i * seed) % 251;
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
}

/** Blobs stored since `seeded`: the seed's own sample photos have bytes too. */
async function addedBlobs(ctx: TestContext, seeded: ReadonlySet<string>) {
  return (await ctx.db.select().from(photo_blob)).filter((b) => !seeded.has(b.sha256));
}

async function seededBlobs(ctx: TestContext): Promise<Set<string>> {
  return new Set((await ctx.db.select().from(photo_blob)).map((b) => b.sha256));
}

function upload(
  ctx: TestContext,
  who: SignedIn,
  fields: Record<string, string>,
  file: Uint8Array | null = jpeg(),
) {
  const form = new FormData();
  // The file comes first on purpose: the server must not depend on part order.
  if (file !== null) form.append("file", new Blob([file], { type: "image/jpeg" }), "photo.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return ctx.app.inject({
    method: "POST",
    url: "/survey/photos",
    headers: who.headers,
    payload: form,
  });
}

function photoAction(ctx: TestContext, who: SignedIn, id: string, action: string) {
  return ctx.app.inject({
    method: "POST",
    url: `/survey/photos/${id}/${action}`,
    headers: who.headers,
    payload: { client_write_id: writeId() },
  });
}

async function uploaded(ctx: TestContext, who: SignedIn, seed: number): Promise<string> {
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const res = await upload(
    ctx,
    who,
    { spot_id: spotId, client_write_id: writeId() },
    jpeg(64, seed),
  );
  expect(res.statusCode).toBe(201);
  const spot = SurveySpot.parse(body(res));
  const sha = sha256Hex(jpeg(64, seed));
  const [row] = await ctx.db.select().from(spot_photo).where(eq(spot_photo.blob_sha256, sha));
  if (!row || !spot.photos.some((p) => p.id === row.id)) throw new Error("photo missing");
  return row.id;
}

test("an upload stores the blob once and adds an unapproved photo", async () => {
  const ctx = await setup();
  const seeded = await seededBlobs(ctx);
  const me = await signIn(ctx);
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const res = await upload(ctx, me, { spot_id: spotId, client_write_id: writeId() });
  expect(res.statusCode).toBe(201);
  const spot = SurveySpot.parse(body(res));
  expect(spot.photos).toHaveLength(1);
  expect(spot.photos[0]).toMatchObject({
    approved: false,
    is_cover: false,
    uploaded_by: me.id,
    url: null,
    taken_at: NOW.toISOString(),
  });

  // Same bytes again under a new write id: a second photo row, still one blob.
  await upload(ctx, me, { spot_id: spotId, client_write_id: writeId() });
  const blobs = await addedBlobs(ctx, seeded);
  expect(blobs.map((b) => b.sha256)).toEqual([sha256Hex(jpeg())]);
  expect(blobs[0]?.byte_size).toBe(64);
  expect(await ctx.db.select().from(spot_photo).where(eq(spot_photo.spot_id, spotId))).toHaveLength(
    2,
  );
});

test("replaying an upload adds no second photo", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const fields = { spot_id: spotId, client_write_id: writeId() };
  expect((await upload(ctx, me, fields)).statusCode).toBe(201);
  expect((await upload(ctx, me, fields)).statusCode).toBe(201);
  expect(await ctx.db.select().from(spot_photo).where(eq(spot_photo.spot_id, spotId))).toHaveLength(
    1,
  );
});

test("type and size limits: non-JPEG is 415, over the limit is 413, nothing stored", async () => {
  const ctx = await setup();
  const seeded = await seededBlobs(ctx);
  const me = await signIn(ctx);
  const fields = { spot_id: ctx.ids.spotIds["sac-lounge"], client_write_id: writeId() };
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const wrongType = await upload(ctx, me, fields, png);
  expect(wrongType.statusCode).toBe(415);
  expect(body(wrongType)).toMatchObject({ error: "photo_type" });

  const atLimit = await upload(
    ctx,
    me,
    { ...fields, client_write_id: writeId() },
    jpeg(PHOTO_MAX_BYTES),
  );
  expect(atLimit.statusCode).toBe(201);
  const over = await upload(
    ctx,
    me,
    { ...fields, client_write_id: writeId() },
    jpeg(PHOTO_MAX_BYTES + 1),
  );
  expect(over.statusCode).toBe(413);
  expect(body(over)).toMatchObject({ error: "photo_too_large" });
  expect(await addedBlobs(ctx, seeded)).toHaveLength(1);
});

test("an unknown spot or an offline local id stores no blob", async () => {
  const ctx = await setup();
  const seeded = await seededBlobs(ctx);
  const me = await signIn(ctx);
  const unknown = await upload(ctx, me, {
    spot_id: "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    client_write_id: writeId(),
  });
  expect(unknown.statusCode).toBe(404);
  const local = await upload(ctx, me, {
    spot_id: "local:8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    client_write_id: writeId(),
  });
  expect(local.statusCode).toBe(400);
  const noFile = await upload(
    ctx,
    me,
    { spot_id: ctx.ids.spotIds["sac-lounge"], client_write_id: writeId() },
    null,
  );
  expect(noFile.statusCode).toBe(400);
  expect(await addedBlobs(ctx, seeded)).toEqual([]);
});

test("taken_at from a phone clock in the future is clamped to the server clock", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const spotId = ctx.ids.spotIds["sac-lounge"];
  const future = await upload(ctx, me, {
    spot_id: spotId,
    client_write_id: writeId(),
    taken_at: "2026-10-14T18:00:00.000Z",
  });
  const past = await upload(
    ctx,
    me,
    { spot_id: spotId, client_write_id: writeId(), taken_at: "2026-10-12T09:30:00.000Z" },
    jpeg(64, 2),
  );
  expect(past.statusCode).toBe(201);
  const times = SurveySpot.parse(body(past))
    .photos.map((p) => p.taken_at)
    .sort();
  expect(future.statusCode).toBe(201);
  expect(times).toEqual(["2026-10-12T09:30:00.000Z", NOW.toISOString()]);
});

test("setting a cover moves it from the previous photo", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const a = await uploaded(ctx, me, 1);
  const b = await uploaded(ctx, me, 2);
  expect((await photoAction(ctx, me, a, "cover")).statusCode).toBe(200);
  const res = await photoAction(ctx, me, b, "cover");
  expect(res.statusCode).toBe(200);
  const covers = SurveySpot.parse(body(res)).photos.filter((p) => p.is_cover);
  expect(covers.map((p) => p.id)).toEqual([b]);
});

test("approval: not your own upload, another surveyor can, an admin always can", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const admin = await signIn(ctx, "admin", "Admin");
  const anas = await uploaded(ctx, ana, 1);
  expect((await photoAction(ctx, ana, anas, "approve")).statusCode).toBe(403);
  const byBo = await photoAction(ctx, bo, anas, "approve");
  expect(byBo.statusCode).toBe(200);
  expect(SurveySpot.parse(body(byBo)).photos.find((p) => p.id === anas)?.approved).toBe(true);

  const admins = await uploaded(ctx, admin, 2);
  expect((await photoAction(ctx, admin, admins, "approve")).statusCode).toBe(200);
  // sac-lounge is published, so approvals change the bundle.
  expect(ctx.publisher.scheduled).toBe(2);
});

test("reject is admin only and deletes the photo row", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const admin = await signIn(ctx, "admin", "Admin");
  const id = await uploaded(ctx, ana, 1);
  expect((await photoAction(ctx, ana, id, "reject")).statusCode).toBe(403);
  const res = await photoAction(ctx, admin, id, "reject");
  expect(res.statusCode).toBe(200);
  expect(SurveySpot.parse(body(res)).photos.some((p) => p.id === id)).toBe(false);
  expect(await ctx.db.select().from(spot_photo).where(eq(spot_photo.id, id))).toEqual([]);
  expect((await photoAction(ctx, admin, id, "reject")).statusCode).toBe(404);
});

test("rejecting a photo deletes its bytes when no other photo uses them", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin", "Admin");
  const id = await uploaded(ctx, admin, 6);
  expect((await photoAction(ctx, admin, id, "reject")).statusCode).toBe(200);
  const sha = sha256Hex(jpeg(64, 6));
  expect(await ctx.db.select().from(photo_blob).where(eq(photo_blob.sha256, sha))).toEqual([]);
});

test("rejecting a duplicate of a published photo keeps the shared photo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reject-shared-"));
  const deployed: string[][] = [];
  const inner = fsTarget(dir);
  const ctx = await setup({
    target: {
      deploy: (files) => {
        deployed.push(files.map((f) => f.path));
        return inner.deploy(files);
      },
    },
    dataSite: fsDataSite(dir),
  });
  const admin = await signIn(ctx, "admin", "Admin");
  const kept = await uploaded(ctx, admin, 8);
  expect((await photoAction(ctx, admin, kept, "approve")).statusCode).toBe(200);
  const sha = sha256Hex(jpeg(64, 8));
  const first = await ctx.publisher.runNow();
  expect(first.ok && first.offloaded.includes(sha)).toBe(true);

  // The same bytes again: a second photo row on the same blob, still pending.
  const res = await upload(
    ctx,
    admin,
    { spot_id: ctx.ids.spotIds["sac-lounge"], client_write_id: writeId() },
    jpeg(64, 8),
  );
  expect(res.statusCode).toBe(201);
  const dup = SurveySpot.parse(body(res)).photos.find((p) => p.id !== kept && !p.approved);
  if (!dup) throw new Error("duplicate photo missing");
  expect((await photoAction(ctx, admin, dup.id, "reject")).statusCode).toBe(200);

  expect(await ctx.db.select().from(photo_blob).where(eq(photo_blob.sha256, sha))).toHaveLength(1);
  const image = await ctx.app.inject({
    method: "GET",
    url: `/survey/photos/${kept}/image`,
    headers: admin.headers,
  });
  expect(Array.from(image.rawPayload)).toEqual(Array.from(jpeg(64, 8)));
  expect((await ctx.publisher.runNow()).ok).toBe(true);
  expect(deployed.at(-1)).toContain(`photos/${sha}.jpg`);
});

test("the image route serves exact bytes to signed-in surveyors only", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const id = await uploaded(ctx, me, 3);
  const res = await ctx.app.inject({
    method: "GET",
    url: `/survey/photos/${id}/image`,
    headers: me.headers,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toBe("image/jpeg");
  expect(Array.from(res.rawPayload)).toEqual(Array.from(jpeg(64, 3)));
  expect(
    (await ctx.app.inject({ method: "GET", url: `/survey/photos/${id}/image` })).statusCode,
  ).toBe(401);
});

test("an offloaded photo is served from the data site, and a bad copy is a 404", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin", "Admin");
  const id = await uploaded(ctx, admin, 4);
  expect((await photoAction(ctx, admin, id, "approve")).statusCode).toBe(200);
  const outcome = await ctx.publisher.runNow();
  const sha = sha256Hex(jpeg(64, 4));
  expect(outcome.ok && outcome.offloaded.includes(sha)).toBe(true);
  const [row] = await ctx.db.select().from(photo_blob).where(eq(photo_blob.sha256, sha));
  expect(row?.bytes).toBeNull();

  const image = () =>
    ctx.app.inject({ method: "GET", url: `/survey/photos/${id}/image`, headers: admin.headers });
  const res = await image();
  expect(res.statusCode).toBe(200);
  expect(Array.from(res.rawPayload)).toEqual(Array.from(jpeg(64, 4)));

  // A data-site copy whose sha256 does not match is never served.
  writeFileSync(join(ctx.publishDir, `photos/${sha}.jpg`), jpeg(64, 5));
  expect((await image()).statusCode).toBe(404);
});

test("a photo or spot in another campus is a 404 and stores nothing", async () => {
  const ctx = await setup();
  const seeded = await seededBlobs(ctx);
  const me = await signIn(ctx);
  const admin = await signIn(ctx, "admin", "Admin");
  await ctx.db.insert(campus).values({ id: "other", name: "Other", tz: "America/New_York" });
  await ctx.db
    .insert(building)
    .values({ id: "other-hall", campus_id: "other", name: "Other Hall", lat: 1, lng: 1 });
  await ctx.db.insert(bundle_state).values({ campus_id: "other", dirty: false, write_seq: 0 });
  const [foreign] = await ctx.db
    .insert(spot)
    .values({
      slug: "other-spot",
      building_id: "other-hall",
      floor: "1",
      official_name: "Other Spot",
      lat: 1,
      lng: 1,
    })
    .returning({ id: spot.id });
  if (!foreign) throw new Error("insert returned nothing");
  const [photo] = await ctx.db
    .insert(spot_photo)
    .values({ spot_id: foreign.id, taken_at: NOW, uploaded_by: me.id })
    .returning({ id: spot_photo.id });
  if (!photo) throw new Error("insert returned nothing");

  const up = await upload(ctx, me, { spot_id: foreign.id, client_write_id: writeId() });
  expect(up.statusCode).toBe(404);
  expect(await addedBlobs(ctx, seeded)).toEqual([]);
  for (const action of ["cover", "approve", "reject"]) {
    const res = await photoAction(ctx, admin, photo.id, action);
    expect(res.statusCode).toBe(404);
  }
  const img = await ctx.app.inject({
    method: "GET",
    url: `/survey/photos/${photo.id}/image`,
    headers: me.headers,
  });
  expect(img.statusCode).toBe(404);
  expect(ctx.publisher.scheduled).toBe(0);
});
