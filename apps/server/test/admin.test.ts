import { expect, test } from "bun:test";
import { PendingPhotoList, SurveyorList } from "@perch/core";
import { building, bundle_state, campus, photo_blob, spot, spot_photo } from "@perch/db";
import { body, NOW, setup, signIn } from "./helpers.ts";

test("admins list every surveyor, including revoked ones", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin", "Admin");
  const ana = await signIn(ctx, "surveyor", "Ana");
  await ctx.app.inject({
    method: "POST",
    url: `/admin/surveyors/${ana.id}/revoke`,
    headers: admin.headers,
  });
  const res = await ctx.app.inject({
    method: "GET",
    url: "/admin/surveyors",
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  const list = SurveyorList.parse(body(res));
  expect(list.surveyors.map((s) => [s.display_name, s.role, s.active])).toEqual([
    ["Admin", "admin", true],
    ["Ana", "surveyor", false],
    ["Seed Admin", "admin", true],
  ]);
  expect(
    (await ctx.app.inject({ method: "GET", url: "/admin/surveyors", headers: ana.headers }))
      .statusCode,
  ).toBe(401);
});

test("pending photos list unapproved photos with spot and uploader names", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin", "Admin");
  const ana = await signIn(ctx, "surveyor", "Ana");
  const sha = "a".repeat(64);
  await ctx.db.insert(photo_blob).values({
    sha256: sha,
    bytes: new Uint8Array([0xff, 0xd8, 0xff]),
    content_type: "image/jpeg",
    byte_size: 3,
  });
  await ctx.db.insert(spot_photo).values({
    spot_id: ctx.ids.spotIds["sac-lounge"],
    blob_sha256: sha,
    taken_at: NOW,
    uploaded_by: ana.id,
  });
  const res = await ctx.app.inject({
    method: "GET",
    url: "/admin/photos/pending",
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  const list = PendingPhotoList.parse(body(res));
  // The seed's unapproved sample photo is older, so it comes first.
  expect(list.photos.map((p) => [p.spot_name, p.uploaded_by_name])).toEqual([
    ["Central Reading Room", "Seed Admin"],
    ["SAC Second Floor Lounge", "Ana"],
  ]);
  expect(list.photos.every((p) => !p.approved)).toBe(true);
  expect(
    (await ctx.app.inject({ method: "GET", url: "/admin/photos/pending", headers: ana.headers }))
      .statusCode,
  ).toBe(403);
});

test("pending photos exclude another campus", async () => {
  const ctx = await setup();
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
  await ctx.db
    .insert(spot_photo)
    .values({ spot_id: foreign.id, taken_at: new Date(NOW.getTime() - 86_400_000) });
  const res = await ctx.app.inject({
    method: "GET",
    url: "/admin/photos/pending",
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  const names = PendingPhotoList.parse(body(res)).photos.map((p) => p.spot_name);
  expect(names).toEqual(["Central Reading Room"]);
});
