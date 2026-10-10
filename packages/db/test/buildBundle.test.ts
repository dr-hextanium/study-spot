import { expect, test } from "bun:test";
import { parseBundle, slotIndex } from "@perch/core";
import { and, eq, sql } from "drizzle-orm";
import { buildBundle, NoTermError } from "../src/bundle/buildBundle.ts";
import {
  spot,
  spot_amenity,
  spot_hours,
  spot_seat_type,
  spot_table_config,
  spot_verification,
  term,
  walk_matrix,
} from "../src/index.ts";
import { seed } from "../src/seed/seed.ts";
import { createTestDb } from "../src/testing.ts";

const NOW = new Date("2026-10-13T18:00:00Z");

async function seeded() {
  const db = await createTestDb();
  const ids = await seed(db);
  return { db, ids };
}

test("seed bundle is valid and contains only published spots", async () => {
  const { db } = await seeded();
  const { bundle, warnings } = await buildBundle(db, "sbu", NOW);

  expect(parseBundle(bundle).ok).toBe(true);
  expect(warnings).toEqual([]);
  expect(bundle.term.id).toBe("2026-fall");
  expect(bundle.campus.tz).toBe("America/New_York");
  expect(bundle.spots.map((s) => s.slug).sort()).toEqual([
    "central-reading-room",
    "kelly-rcc",
    "north-reading-room",
    "sac-lounge",
  ]);
});

test("unverified eligibility is carried through for the client to filter", async () => {
  const { db } = await seeded();
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const rcc = bundle.spots.find((s) => s.slug === "kelly-rcc");
  expect(rcc?.eligibility_verified).toBe(false);
  expect(rcc?.eligibility_scope).toBe("Kelly Quad");
});

test("bundle holds no surveyor ids and no unapproved photos", async () => {
  const { db, ids } = await seeded();
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const json = JSON.stringify(bundle);
  expect(json).not.toContain(ids.adminId);
  expect(json).not.toContain("unapproved");
  const crr = bundle.spots.find((s) => s.slug === "central-reading-room");
  expect(crr?.photos).toHaveLength(1);
  expect(crr?.photos[0]?.is_cover).toBe(true);
});

test("busyness uses measured, estimated, then none", async () => {
  const { db, ids } = await seeded();
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const b = bundle.busyness[ids.spotIds["central-reading-room"]];
  expect(b?.confidence[slotIndex(1, 14)]).toBe("measured");
  expect(b?.confidence[slotIndex(2, 13)]).toBe("estimated");
  expect(b?.confidence[slotIndex(2, 3)]).toBe("none");
});

test("hours include only the current term, past-midnight closes survive", async () => {
  const { db, ids } = await seeded();
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const crrHours = bundle.hours.filter((h) => h.spot_id === ids.spotIds["central-reading-room"]);
  expect(crrHours).toHaveLength(7);
  expect(crrHours.find((h) => h.day_of_week === 0)?.closes).toBe("02:00");

  const key = (h: (typeof bundle.hours)[number]) =>
    `${h.spot_id}|${h.day_of_week}|${h.is_exam ? 1 : 0}`;
  const sorted = [...bundle.hours].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  expect(bundle.hours).toEqual(sorted);
});

test("a spot with no hours this term is marked hours_unconfirmed", async () => {
  const { db, ids } = await seeded();
  await db.delete(spot_hours).where(eq(spot_hours.spot_id, ids.spotIds["sac-lounge"]));
  const { bundle } = await buildBundle(db, "sbu", NOW);
  expect(bundle.spots.find((s) => s.slug === "sac-lounge")?.hours_unconfirmed).toBe(true);
  expect(bundle.spots.find((s) => s.slug === "north-reading-room")?.hours_unconfirmed).toBe(false);
});

test("a missing walk pair falls back and is flagged", async () => {
  const { db } = await seeded();
  await db
    .delete(walk_matrix)
    .where(
      and(eq(walk_matrix.from_building_id, "sac"), eq(walk_matrix.to_building_id, "kelly-quad")),
    );
  const { bundle } = await buildBundle(db, "sbu", NOW);
  const i = bundle.walk.building_ids.indexOf("sac");
  const j = bundle.walk.building_ids.indexOf("kelly-quad");
  expect(bundle.walk.estimated_pairs).toContainEqual([i, j]);
  expect(bundle.walk.minutes[i]?.[j]).toBeGreaterThan(0);
});

test("an incomplete published spot is skipped with a warning", async () => {
  const { db, ids } = await seeded();
  await db.update(spot).set({ status: "published" }).where(eq(spot.id, ids.spotIds["union-draft"]));
  const { bundle, warnings } = await buildBundle(db, "sbu", NOW);
  expect(bundle.spots.some((s) => s.slug === "union-draft")).toBe(false);
  expect(warnings).toEqual([
    "skipped union-draft: missing directions, eligibility, seat_count, outlet_coverage_pct, group_work_ok, food_policy, last_verified",
  ]);
});

test("between terms the next term is used; after all terms it throws", async () => {
  const { db } = await seeded();
  const winter = await buildBundle(db, "sbu", new Date("2027-01-05T17:00:00Z"));
  expect(winter.bundle.term.id).toBe("2027-spring");
  // Spring has no hours seeded, so every spot is unconfirmed for that term
  expect(winter.bundle.spots.every((s) => s.hours_unconfirmed)).toBe(true);

  await db.delete(term).where(eq(term.id, "2027-spring"));
  await expect(buildBundle(db, "sbu", new Date("2027-01-05T17:00:00Z"))).rejects.toThrow(
    NoTermError,
  );
});

test("a spot with a scheme-less reservation url is skipped with a warning", async () => {
  const { db, ids } = await seeded();
  await db
    .update(spot)
    .set({ reservable: true, reservation_url: "libcal.stonybrook.edu/x" })
    .where(eq(spot.id, ids.spotIds["north-reading-room"]));
  const { bundle, warnings } = await buildBundle(db, "sbu", NOW);
  expect(parseBundle(bundle).ok).toBe(true);
  expect(bundle.spots.some((s) => s.slug === "north-reading-room")).toBe(false);
  expect(bundle.hours.some((h) => h.spot_id === ids.spotIds["north-reading-room"])).toBe(false);
  expect(ids.spotIds["north-reading-room"] in bundle.busyness).toBe(false);
  expect(warnings).toEqual(["skipped north-reading-room: invalid reservation_url: Invalid URL"]);
});

test("a spot with a negative seat type count is skipped with a warning", async () => {
  const { db, ids } = await seeded();
  // Simulate a row written before the check constraint existed.
  await db.execute(
    sql`alter table spot_seat_type drop constraint if exists spot_seat_type_count_nonnegative`,
  );
  await db
    .insert(spot_seat_type)
    .values({ spot_id: ids.spotIds["sac-lounge"], type: "soft", count: -1 });
  const { bundle, warnings } = await buildBundle(db, "sbu", NOW);
  expect(parseBundle(bundle).ok).toBe(true);
  expect(bundle.spots.some((s) => s.slug === "sac-lounge")).toBe(false);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toStartWith("skipped sac-lounge: invalid seat_types.0.count:");
});

test("an invalid hours row is skipped, and a spot left with none is unconfirmed", async () => {
  const { db, ids } = await seeded();
  // Simulate rows written before the check constraint existed.
  await db.execute(
    sql`alter table spot_hours drop constraint if exists spot_hours_last_entry_format`,
  );
  const sac = ids.spotIds["sac-lounge"];
  await db
    .update(spot_hours)
    .set({ last_entry: "9pm" })
    .where(and(eq(spot_hours.spot_id, sac), eq(spot_hours.day_of_week, 2)));
  const kelly = ids.spotIds["kelly-rcc"];
  await db.update(spot_hours).set({ last_entry: "9pm" }).where(eq(spot_hours.spot_id, kelly));

  const { bundle, warnings } = await buildBundle(db, "sbu", NOW);
  expect(parseBundle(bundle).ok).toBe(true);
  const sacHours = bundle.hours.filter((h) => h.spot_id === sac);
  expect(sacHours.map((h) => h.day_of_week)).toEqual([0, 1, 3, 4, 5, 6]);
  expect(bundle.spots.find((s) => s.slug === "sac-lounge")?.hours_unconfirmed).toBe(false);
  expect(bundle.spots.find((s) => s.slug === "kelly-rcc")?.hours_unconfirmed).toBe(true);
  expect(bundle.hours.some((h) => h.spot_id === kelly)).toBe(false);
  expect(
    warnings.some((w) => w.startsWith("skipped sac-lounge hours day 2: invalid last_entry:")),
  ).toBe(true);
  expect(warnings.filter((w) => w.startsWith("skipped kelly-rcc hours day"))).toHaveLength(7);
  expect(warnings).toHaveLength(8);
});

test("the serialized bundle does not depend on row insertion order", async () => {
  const { db, ids } = await seeded();
  const crr = ids.spotIds["central-reading-room"];
  await db.insert(spot_seat_type).values([
    { spot_id: crr, type: "soft", count: 4 },
    { spot_id: crr, type: "carrel", count: 10 },
  ]);
  await db.insert(spot_table_config).values([
    { spot_id: crr, config: "individual" },
    { spot_id: crr, config: "small_2_4" },
  ]);
  await db.insert(spot_amenity).values([
    { spot_id: crr, amenity: "water", walk_minutes: 2 },
    { spot_id: crr, amenity: "printer", walk_minutes: 3 },
  ]);
  await db.insert(spot_verification).values({
    spot_id: crr,
    attribute_group: "access",
    last_verified_at: new Date("2026-10-01T15:00:00Z"),
    source: "survey",
    confidence: "estimated",
  });
  const first = JSON.stringify((await buildBundle(db, "sbu", NOW)).bundle);

  const seats = await db.select().from(spot_seat_type);
  const tables = await db.select().from(spot_table_config);
  const amenities = await db.select().from(spot_amenity);
  const verifications = await db.select().from(spot_verification);
  const hours = await db.select().from(spot_hours);
  await db.delete(spot_seat_type);
  await db.delete(spot_table_config);
  await db.delete(spot_amenity);
  await db.delete(spot_verification);
  await db.delete(spot_hours);
  await db.insert(spot_seat_type).values(seats.reverse());
  await db.insert(spot_table_config).values(tables.reverse());
  await db.insert(spot_amenity).values(amenities.reverse());
  await db.insert(spot_verification).values(verifications.reverse());
  await db.insert(spot_hours).values(hours.reverse());

  const second = JSON.stringify((await buildBundle(db, "sbu", NOW)).bundle);
  expect(second).toBe(first);
});
