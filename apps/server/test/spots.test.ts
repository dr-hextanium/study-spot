import { expect, test } from "bun:test";
import { type SectionWrite, SpotList, SurveySpot, VersionConflict } from "@perch/core";
import {
  audit_log,
  buildBundle,
  building,
  bundle_state,
  campus,
  photo_blob,
  spot,
  spot_hours,
  spot_photo,
  spot_verification,
  write_receipt,
} from "@perch/db";
import { and, eq, sql } from "drizzle-orm";
import { HttpError } from "../src/http.ts";
import { currentTerm } from "../src/spots/load.ts";
import { reviewSpot } from "../src/spots/write.ts";
import { COMPLETING_SECTIONS, identity } from "./fixtures.ts";
import { body, NOW, type SignedIn, setup, signIn, type TestContext, writeId } from "./helpers.ts";

const HOUR = 60 * 60 * 1000;

function create(ctx: TestContext, who: SignedIn, id = writeId(), overrides = {}) {
  return ctx.app.inject({
    method: "POST",
    url: "/survey/spots",
    headers: who.headers,
    payload: { client_write_id: id, identity: identity(overrides) },
  });
}

function put(
  ctx: TestContext,
  who: SignedIn,
  spotId: string,
  baseVersion: number,
  write: SectionWrite,
  id = writeId(),
) {
  return ctx.app.inject({
    method: "PUT",
    url: `/survey/spots/${spotId}/${write.section}`,
    headers: who.headers,
    payload: { client_write_id: id, base_version: baseVersion, data: write.data },
  });
}

function post(ctx: TestContext, who: SignedIn, path: string, payload: object) {
  return ctx.app.inject({ method: "POST", url: path, headers: who.headers, payload });
}

async function newDraft(ctx: TestContext, who: SignedIn): Promise<SurveySpot> {
  const res = await create(ctx, who);
  expect(res.statusCode).toBe(201);
  return SurveySpot.parse(body(res));
}

/** Applies COMPLETING_SECTIONS in order and returns the final spot. */
async function complete(ctx: TestContext, who: SignedIn, draft: SurveySpot): Promise<SurveySpot> {
  let current = draft;
  for (const write of COMPLETING_SECTIONS) {
    const res = await put(ctx, who, current.id, current.version, write);
    expect(res.statusCode).toBe(200);
    current = SurveySpot.parse(body(res));
  }
  return current;
}

test("survey routes require a session", async () => {
  const ctx = await setup();
  expect((await ctx.app.inject({ method: "GET", url: "/survey/spots" })).statusCode).toBe(401);
  const res = await ctx.app.inject({
    method: "POST",
    url: "/survey/spots",
    payload: { client_write_id: writeId(), identity: identity() },
  });
  expect(res.statusCode).toBe(401);
});

test("the list summarizes every spot with verification age and hours state", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const res = await ctx.app.inject({ method: "GET", url: "/survey/spots", headers: me.headers });
  expect(res.statusCode).toBe(200);
  const list = SpotList.parse(body(res));
  expect(list.term).toEqual({ id: "2026-fall", name: "Fall 2026" });
  expect(list.spots).toHaveLength(5);
  const crr = list.spots.find((s) => s.slug === "central-reading-room");
  expect(crr).toMatchObject({
    building_name: "Melville Library",
    status: "published",
    review_state: "unreviewed",
    oldest_verified_at: "2026-10-01T15:00:00.000Z",
    hours_confirmed: true,
  });
  const draft = list.spots.find((s) => s.slug === "union-draft");
  expect(draft).toMatchObject({
    status: "draft",
    oldest_verified_at: null,
    hours_confirmed: false,
  });
});

test("the survey list carries an approved cover's id, and nothing else", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const sha = "b".repeat(64);
  await ctx.db.insert(photo_blob).values({
    sha256: sha,
    bytes: new Uint8Array([0xff, 0xd8, 0xff]),
    content_type: "image/jpeg",
    byte_size: 3,
  });
  const photo = async (
    spotId: string,
    over: { is_cover: boolean; approved: boolean; blob?: boolean },
  ) => {
    const [row] = await ctx.db
      .insert(spot_photo)
      .values({
        spot_id: spotId,
        blob_sha256: over.blob === false ? null : sha,
        taken_at: NOW,
        is_cover: over.is_cover,
        approved_at: over.approved ? NOW : null,
      })
      .returning({ id: spot_photo.id });
    if (!row) throw new Error("insert returned nothing");
    return row.id;
  };
  const ids = ctx.ids.spotIds;
  const [seedCover] = await ctx.db
    .select({ id: spot_photo.id })
    .from(spot_photo)
    .where(and(eq(spot_photo.spot_id, ids["central-reading-room"]), eq(spot_photo.is_cover, true)));
  // The seed already gives Central Reading Room an approved cover with bytes.
  const a = await photo(ids["sac-lounge"], { is_cover: true, approved: true });
  await photo(ids["union-draft"], { is_cover: true, approved: false });
  await photo(ids["kelly-rcc"], { is_cover: false, approved: true });
  const other = await foreignSpot(ctx);
  await photo(other, { is_cover: true, approved: true });

  const list = SpotList.parse(
    body(await ctx.app.inject({ method: "GET", url: "/survey/spots", headers: me.headers })),
  );
  const cover = (slug: string) => list.spots.find((s) => s.slug === slug)?.cover_photo_id;
  expect(cover("sac-lounge")).toBe(a);
  expect(cover("union-draft")).toBeNull();
  expect(cover("kelly-rcc")).toBeNull();
  expect(cover("central-reading-room")).toBe(seedCover?.id);
  expect(list.spots.some((s) => s.slug === "other-spot")).toBe(false);
});

async function foreignSpot(ctx: TestContext): Promise<string> {
  await ctx.db.insert(campus).values({ id: "other", name: "Other", tz: "America/New_York" });
  await ctx.db
    .insert(building)
    .values({ id: "other-hall", campus_id: "other", name: "Other Hall", lat: 1, lng: 1 });
  await ctx.db.insert(bundle_state).values({ campus_id: "other", dirty: false, write_seq: 0 });
  const [row] = await ctx.db
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
  if (!row) throw new Error("insert returned nothing");
  return row.id;
}

test("a spot detail includes current-term hours, estimates, photos, and missing fields", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  const res = await ctx.app.inject({
    method: "GET",
    url: `/survey/spots/${crrId}`,
    headers: me.headers,
  });
  expect(res.statusCode).toBe(200);
  const crr = SurveySpot.parse(body(res));
  expect(crr.term?.id).toBe("2026-fall");
  expect(crr.hours).toHaveLength(7);
  expect(crr.hours[0]).toEqual({
    day_of_week: 0,
    opens: "08:00",
    closes: "02:00",
    last_entry: null,
    is_exam: false,
  });
  expect(crr.estimates.map((e) => e.bucket)).toEqual(["filling"]);
  expect(crr.photos.map((p) => p.approved).sort()).toEqual([false, true]);
  expect(crr.missing).toEqual([]);

  const draft = SurveySpot.parse(
    body(
      await ctx.app.inject({
        method: "GET",
        url: `/survey/spots/${ctx.ids.spotIds["union-draft"]}`,
        headers: me.headers,
      }),
    ),
  );
  expect(draft.missing).toContain("last_verified");

  const unknown = await ctx.app.inject({
    method: "GET",
    url: "/survey/spots/8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    headers: me.headers,
  });
  expect(unknown.statusCode).toBe(404);
  const local = await ctx.app.inject({
    method: "GET",
    url: "/survey/spots/local:8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
    headers: me.headers,
  });
  expect(local.statusCode).toBe(400);
});

test("a legacy row that fails request rules still reads, so the form can fix it", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const nrrId = ctx.ids.spotIds["north-reading-room"];
  await ctx.db
    .update(spot)
    .set({ reservable: true, reservation_url: "libcal.stonybrook.edu/x" })
    .where(eq(spot.id, nrrId));
  const res = await ctx.app.inject({
    method: "GET",
    url: `/survey/spots/${nrrId}`,
    headers: me.headers,
  });
  expect(res.statusCode).toBe(200);
  expect(SurveySpot.parse(body(res)).reservation_url).toBe("libcal.stonybrook.edu/x");
});

test("creating a draft stamps identity and replays without a duplicate", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const id = writeId();
  const first = await create(ctx, me, id);
  expect(first.statusCode).toBe(201);
  const draft = SurveySpot.parse(body(first));
  expect(draft).toMatchObject({
    status: "draft",
    version: 1,
    review_state: "unreviewed",
    last_edited_by: me.id,
    noise_policy: null,
  });
  expect(draft.verified).toEqual({ identity: NOW.toISOString() });
  expect(draft.missing).toEqual([
    "eligibility",
    "seat_count",
    "outlet_coverage_pct",
    "noise_policy",
    "group_work_ok",
    "food_policy",
  ]);

  const replay = await create(ctx, me, id);
  expect(replay.statusCode).toBe(201);
  expect(SurveySpot.parse(body(replay)).id).toBe(draft.id);
  const list = SpotList.parse(
    body(await ctx.app.inject({ method: "GET", url: "/survey/spots", headers: me.headers })),
  );
  expect(list.spots.filter((s) => s.slug === "frey-lounge")).toHaveLength(1);
});

test("a taken slug or unknown building is a 422 and stores nothing", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const taken = await create(ctx, me, writeId(), { slug: "sac-lounge" });
  expect(taken.statusCode).toBe(422);
  expect(body(taken)).toMatchObject({ error: "slug_taken" });
  const nowhere = await create(ctx, me, writeId(), { building_id: "atlantis" });
  expect(body(nowhere)).toMatchObject({ error: "unknown_building" });
  expect(await ctx.db.select().from(write_receipt)).toEqual([]);
});

test("a section write bumps version, stamps verification, and audits", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  ctx.clock.advance(HOUR);
  const access = COMPLETING_SECTIONS[0];
  if (!access) throw new Error("fixture missing");
  const res = await put(ctx, me, draft.id, 1, access);
  expect(res.statusCode).toBe(200);
  const after = SurveySpot.parse(body(res));
  expect(after.version).toBe(2);
  expect(after.eligibility).toBe("all_students");
  expect(after.verified.access).toBe(new Date(NOW.getTime() + HOUR).toISOString());
  expect(after.updated_at).toBe(new Date(NOW.getTime() + HOUR).toISOString());
  const audits = await ctx.db.select().from(audit_log).where(eq(audit_log.entity_id, draft.id));
  expect(audits.map((a) => a.action)).toEqual(["create", "section.access"]);
  expect(audits[1]?.surveyor_id).toBe(me.id);
});

test("a stale base_version is a 409 with the current spot and changes nothing", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const draft = await newDraft(ctx, ana);
  const [access, seating] = COMPLETING_SECTIONS;
  if (!access || !seating) throw new Error("fixture missing");
  expect((await put(ctx, ana, draft.id, 1, access)).statusCode).toBe(200);

  const id = writeId();
  const stale = await put(ctx, bo, draft.id, 1, seating, id);
  expect(stale.statusCode).toBe(409);
  const conflict = VersionConflict.parse(body(stale));
  expect(conflict.current.version).toBe(2);
  expect(conflict.current.seat_count).toBeNull();
  expect(
    await ctx.db.select().from(write_receipt).where(eq(write_receipt.client_write_id, id)),
  ).toEqual([]);

  // "Keep mine": the same write re-sent on the new base succeeds.
  const kept = await put(ctx, bo, draft.id, 2, seating, id);
  expect(kept.statusCode).toBe(200);
  expect(SurveySpot.parse(body(kept)).seat_count).toBe(30);
});

test("replaying a section write returns the stored spot and bumps version once", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const access = COMPLETING_SECTIONS[0];
  if (!access) throw new Error("fixture missing");
  const id = writeId();
  const a = await put(ctx, me, draft.id, 1, access, id);
  const b = await put(ctx, me, draft.id, 1, access, id);
  expect(b.statusCode).toBe(200);
  expect(body(b)).toEqual(body(a));
  expect(SurveySpot.parse(body(b)).version).toBe(2);
});

test("bad section data or an unknown section is a 400", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const bad = await ctx.app.inject({
    method: "PUT",
    url: `/survey/spots/${draft.id}/power`,
    headers: me.headers,
    payload: { client_write_id: writeId(), base_version: 1, data: { outlet_coverage_pct: 2 } },
  });
  expect(bad.statusCode).toBe(400);
  const unknown = await ctx.app.inject({
    method: "PUT",
    url: `/survey/spots/${draft.id}/photos`,
    headers: me.headers,
    payload: { client_write_id: writeId(), base_version: 1, data: {} },
  });
  expect(unknown.statusCode).toBe(400);
});

test("hours replace one term's rows only and reject an unknown term", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  await ctx.db.insert(spot_hours).values({
    spot_id: crrId,
    term_id: "2027-spring",
    day_of_week: 0,
    opens: "09:00",
    closes: "17:00",
  });
  const row = {
    day_of_week: 4,
    opens: "10:00",
    closes: "24:00",
    last_entry: "23:30",
    is_exam: false,
  };
  const res = await put(ctx, me, crrId, 1, {
    section: "hours",
    data: { term_id: "2026-fall", rows: [row] },
  });
  expect(res.statusCode).toBe(200);
  expect(SurveySpot.parse(body(res)).hours).toEqual([row]);
  const spring = await ctx.db
    .select()
    .from(spot_hours)
    .where(and(eq(spot_hours.spot_id, crrId), eq(spot_hours.term_id, "2027-spring")));
  expect(spring).toHaveLength(1);

  const unknown = await put(ctx, me, crrId, 2, {
    section: "hours",
    data: { term_id: "1999-fall", rows: [] },
  });
  expect(unknown.statusCode).toBe(422);
  expect(body(unknown)).toMatchObject({ error: "unknown_term" });
});

test("seating and amenities replace their child rows", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  const seating = await put(ctx, me, crrId, 1, {
    section: "seating",
    data: {
      seat_count: 90,
      seat_types: [{ type: "carrel", count: 90 }],
      table_configs: [],
      effective_capacity: 60,
      max_group_size: null,
      spread_out_room: null,
    },
  });
  const afterSeating = SurveySpot.parse(body(seating));
  expect(afterSeating.seat_types).toEqual([{ type: "carrel", count: 90 }]);
  expect(afterSeating.table_configs).toEqual([]);
  expect(afterSeating.effective_capacity).toBe(60);

  const amenities = await put(ctx, me, crrId, 2, {
    section: "amenities",
    data: { amenities: [{ amenity: "water", walk_minutes: 2 }] },
  });
  expect(SurveySpot.parse(body(amenities)).amenities).toEqual([
    { amenity: "water", walk_minutes: 2 },
  ]);
});

test("estimates add rows, keep the latest per cell, and stamp no verification", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const first = await put(ctx, me, draft.id, 1, {
    section: "estimates",
    data: { cells: [{ day_type: "weekday", block: "evening", bucket: "some" }] },
  });
  expect(first.statusCode).toBe(200);
  ctx.clock.advance(HOUR);
  const second = await put(ctx, me, draft.id, 2, {
    section: "estimates",
    data: { cells: [{ day_type: "weekday", block: "evening", bucket: "full" }] },
  });
  const spot = SurveySpot.parse(body(second));
  expect(spot.estimates.map((e) => e.bucket)).toEqual(["full"]);
  expect(Object.keys(spot.verified)).toEqual(["identity"]);
});

test("verify stamps groups without a version bump and checks the base version", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  ctx.clock.advance(HOUR);
  const res = await post(ctx, me, `/survey/spots/${crrId}/verify`, {
    client_write_id: writeId(),
    base_version: 1,
    groups: ["hours", "power"],
  });
  expect(res.statusCode).toBe(200);
  const spot = SurveySpot.parse(body(res));
  expect(spot.version).toBe(1);
  const at = new Date(NOW.getTime() + HOUR).toISOString();
  expect(spot.verified).toMatchObject({
    hours: at,
    power: at,
    identity: "2026-10-01T15:00:00.000Z",
  });
  expect(ctx.publisher.scheduled).toBe(1);

  const stale = await post(ctx, me, `/survey/spots/${crrId}/verify`, {
    client_write_id: writeId(),
    base_version: 7,
    groups: ["hours"],
  });
  expect(stale.statusCode).toBe(409);
});

test("publish is a 422 with the missing list until complete, then publishes", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const early = await post(ctx, me, `/survey/spots/${draft.id}/publish`, {
    client_write_id: writeId(),
  });
  expect(early.statusCode).toBe(422);
  expect(body(early)).toEqual({ error: "incomplete", missing: draft.missing });
  expect(ctx.publisher.scheduled).toBe(0);

  const filled = await complete(ctx, me, draft);
  expect(filled.missing).toEqual([]);
  expect(ctx.publisher.scheduled).toBe(0);
  const res = await post(ctx, me, `/survey/spots/${draft.id}/publish`, {
    client_write_id: writeId(),
  });
  expect(res.statusCode).toBe(200);
  expect(SurveySpot.parse(body(res)).status).toBe("published");
  expect(ctx.publisher.scheduled).toBe(1);
  const [state] = await ctx.db.select().from(bundle_state);
  expect(state?.dirty).toBe(true);

  // The server check and bundle assembly agree: the spot is in the bundle.
  const { bundle, warnings } = await buildBundle(ctx.db, "sbu", ctx.clock.now());
  expect(warnings).toEqual([]);
  const inBundle = bundle.spots.find((s) => s.id === draft.id);
  expect(inBundle?.hours_unconfirmed).toBe(true);
  expect(inBundle?.noise_policy).toBe("conversational");

  // Editing a published spot schedules a publish.
  const power = COMPLETING_SECTIONS[2];
  if (!power) throw new Error("fixture missing");
  await put(ctx, me, draft.id, filled.version, power);
  expect(ctx.publisher.scheduled).toBe(2);
});

test("unpublish is admin only", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const admin = await signIn(ctx, "admin", "Admin");
  const crrId = ctx.ids.spotIds["central-reading-room"];
  const denied = await post(ctx, me, `/survey/spots/${crrId}/unpublish`, {
    client_write_id: writeId(),
  });
  expect(denied.statusCode).toBe(403);
  const ok = await post(ctx, admin, `/survey/spots/${crrId}/unpublish`, {
    client_write_id: writeId(),
  });
  expect(ok.statusCode).toBe(200);
  expect(SurveySpot.parse(body(ok)).status).toBe("draft");
  expect(ctx.publisher.scheduled).toBe(1);
});

test("review: not your own edit, another surveyor can, an admin always can", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const admin = await signIn(ctx, "admin", "Admin");
  const draft = await newDraft(ctx, ana);
  const review = (who: SignedIn, version: number) =>
    post(ctx, who, `/survey/spots/${draft.id}/review`, {
      client_write_id: writeId(),
      base_version: version,
    });

  expect((await review(ana, 1)).statusCode).toBe(403);
  const byBo = await review(bo, 1);
  expect(byBo.statusCode).toBe(200);
  expect(SurveySpot.parse(body(byBo))).toMatchObject({
    review_state: "reviewed",
    reviewed_by: bo.id,
    reviewed_by_name: "Bo",
    last_edited_by_name: "Ana",
  });

  // Any edit resets review; an admin may review even their own edit.
  const access = COMPLETING_SECTIONS[0];
  if (!access) throw new Error("fixture missing");
  const edited = SurveySpot.parse(body(await put(ctx, admin, draft.id, 1, access)));
  expect(edited).toMatchObject({
    review_state: "unreviewed",
    reviewed_by: null,
    last_edited_by: admin.id,
    last_edited_by_name: "Admin",
  });
  expect((await review(admin, 2)).statusCode).toBe(200);
  expect((await review(bo, 1)).statusCode).toBe(409);
});

test("a spot in another campus is a 404 for every route and leaves its bundle state alone", async () => {
  const ctx = await setup();
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
  const base = `/survey/spots/${foreign.id}`;
  const access = COMPLETING_SECTIONS[0];
  if (!access) throw new Error("fixture missing");

  expect((await ctx.app.inject({ method: "GET", url: base, headers: me.headers })).statusCode).toBe(
    404,
  );
  expect((await put(ctx, me, foreign.id, 1, access)).statusCode).toBe(404);
  const verify = await post(ctx, me, `${base}/verify`, {
    client_write_id: writeId(),
    base_version: 1,
    groups: ["power"],
  });
  expect(verify.statusCode).toBe(404);
  const publish = await post(ctx, me, `${base}/publish`, { client_write_id: writeId() });
  expect(publish.statusCode).toBe(404);
  const unpublish = await post(ctx, admin, `${base}/unpublish`, { client_write_id: writeId() });
  expect(unpublish.statusCode).toBe(404);
  const review = await post(ctx, admin, `${base}/review`, {
    client_write_id: writeId(),
    base_version: 1,
  });
  expect(review.statusCode).toBe(404);

  const [state] = await ctx.db
    .select()
    .from(bundle_state)
    .where(eq(bundle_state.campus_id, "other"));
  expect(state).toMatchObject({ dirty: false, write_seq: 0 });
  expect(ctx.publisher.scheduled).toBe(0);
});

test("review and verify with a stale base_version are 409", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const draft = await newDraft(ctx, ana);
  const access = COMPLETING_SECTIONS[0];
  if (!access) throw new Error("fixture missing");
  await put(ctx, ana, draft.id, 1, access);
  const review = await post(ctx, bo, `/survey/spots/${draft.id}/review`, {
    client_write_id: writeId(),
    base_version: 1,
  });
  expect(review.statusCode).toBe(409);
  const verify = await post(ctx, bo, `/survey/spots/${draft.id}/verify`, {
    client_write_id: writeId(),
    base_version: 1,
    groups: ["power"],
  });
  expect(verify.statusCode).toBe(409);
});

test("review's update is guarded by version against a write between read and update", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const draft = await newDraft(ctx, ana);
  const term = await currentTerm(ctx.db, "sbu", ctx.clock.now());
  const sctx = {
    surveyorId: bo.id,
    role: "surveyor" as const,
    now: ctx.clock.now(),
    campusId: "sbu",
    term,
  };
  // Simulates a section write committing after the version check: bump the
  // version just before the guarded UPDATE runs.
  const racing = new Proxy(ctx.db, {
    get(target, prop, receiver) {
      if (prop !== "update") return Reflect.get(target, prop, receiver);
      return (table: Parameters<typeof target.update>[0]) => ({
        set: (values: never) => ({
          where: (cond: never) => ({
            returning: async (fields: never) => {
              await target
                .update(spot)
                .set({ version: sql`${spot.version} + 1` })
                .where(eq(spot.id, draft.id));
              return target.update(table).set(values).where(cond).returning(fields);
            },
          }),
        }),
      });
    },
  });
  const err = await reviewSpot(racing, sctx, draft.id, 1).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect(err).toMatchObject({ status: 409 });
  const [row] = await ctx.db.select().from(spot).where(eq(spot.id, draft.id));
  expect(row?.review_state).toBe("unreviewed");
});

async function stamps(ctx: TestContext, spotId: string): Promise<string[]> {
  const rows = await ctx.db
    .select({ group: spot_verification.attribute_group })
    .from(spot_verification)
    .where(eq(spot_verification.spot_id, spotId));
  return rows.map((r) => r.group).sort();
}

const HOURS_ROW = {
  day_of_week: 1,
  opens: "09:00",
  closes: "17:00",
  last_entry: null,
  is_exam: false,
};

test("hours with no rows for the current term clear the hours stamp", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const crrId = ctx.ids.spotIds["central-reading-room"];
  expect(await stamps(ctx, crrId)).toContain("hours");
  const res = await put(ctx, me, crrId, 1, {
    section: "hours",
    data: { term_id: "2026-fall", rows: [] },
  });
  expect(res.statusCode).toBe(200);
  const saved = SurveySpot.parse(body(res));
  expect(saved.hours).toEqual([]);
  expect(saved.verified.hours).toBeUndefined();
  expect(await stamps(ctx, crrId)).not.toContain("hours");
});

test("hours for another term are saved without stamping", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const res = await put(ctx, me, draft.id, 1, {
    section: "hours",
    data: { term_id: "2027-spring", rows: [HOURS_ROW] },
  });
  expect(res.statusCode).toBe(200);
  expect(await stamps(ctx, draft.id)).toEqual(["identity"]);
});

test("hours for the current term with rows stamp hours", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const res = await put(ctx, me, draft.id, 1, {
    section: "hours",
    data: { term_id: "2026-fall", rows: [HOURS_ROW] },
  });
  expect(res.statusCode).toBe(200);
  expect(await stamps(ctx, draft.id)).toEqual(["hours", "identity"]);
});

test("verify with hours and no current-term hours is a 422 that stamps nothing", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const res = await post(ctx, me, `/survey/spots/${draft.id}/verify`, {
    client_write_id: writeId(),
    base_version: 1,
    groups: ["hours", "access"],
  });
  expect(res.statusCode).toBe(422);
  expect(body(res)).toMatchObject({ error: "invalid_request" });
  expect(await stamps(ctx, draft.id)).toEqual(["identity"]);
});

test("verify with hours and access stamps both when current-term hours exist", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const draft = await newDraft(ctx, me);
  const saved = await put(ctx, me, draft.id, 1, {
    section: "hours",
    data: { term_id: "2026-fall", rows: [HOURS_ROW] },
  });
  expect(saved.statusCode).toBe(200);
  const res = await post(ctx, me, `/survey/spots/${draft.id}/verify`, {
    client_write_id: writeId(),
    base_version: 2,
    groups: ["hours", "access"],
  });
  expect(res.statusCode).toBe(200);
  expect(await stamps(ctx, draft.id)).toEqual(["access", "hours", "identity"]);
});
