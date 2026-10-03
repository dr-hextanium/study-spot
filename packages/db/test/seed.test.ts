import { expect, test } from "bun:test";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  building,
  forecast,
  spot,
  spot_estimate,
  spot_hours,
  spot_photo,
  spot_verification,
  surveyor,
  term,
  walk_matrix,
} from "../src/index.ts";
import { seed } from "../src/seed/seed.ts";
import { createTestDb } from "../src/testing.ts";

test("seed inserts sample campus data", async () => {
  const db = await createTestDb();
  const ids = await seed(db);

  expect(await db.select().from(building)).toHaveLength(4);
  expect(await db.select().from(walk_matrix)).toHaveLength(16);
  expect(await db.select().from(spot)).toHaveLength(5);

  const [draft] = await db.select().from(spot).where(eq(spot.id, ids.spotIds["union-draft"]));
  expect(draft?.status).toBe("draft");

  const hours = await db
    .select()
    .from(spot_hours)
    .where(eq(spot_hours.spot_id, ids.spotIds["central-reading-room"]));
  expect(hours).toHaveLength(7);
});

test("seed is rejected on a non-empty database and changes nothing", async () => {
  const db = await createTestDb();
  await seed(db);
  const counts = async () => ({
    spots: (await db.select().from(spot)).length,
    hours: (await db.select().from(spot_hours)).length,
    surveyors: (await db.select().from(surveyor)).length,
    photos: (await db.select().from(spot_photo)).length,
    verifications: (await db.select().from(spot_verification)).length,
  });
  const before = await counts();
  await expect(seed(db)).rejects.toThrow();
  expect(await counts()).toEqual(before);
});

test("seed facts that later work relies on", async () => {
  const db = await createTestDb();
  const ids = await seed(db);

  const [rcc] = await db.select().from(spot).where(eq(spot.id, ids.spotIds["kelly-rcc"]));
  expect(rcc?.eligibility).toBe("residents_quad");
  expect(rcc?.eligibility_scope).toBe("Kelly Quad");
  expect(rcc?.eligibility_verified).toBe(false);

  const crr = ids.spotIds["central-reading-room"];
  const approved = await db
    .select()
    .from(spot_photo)
    .where(and(eq(spot_photo.spot_id, crr), isNotNull(spot_photo.approved_at)));
  expect(approved).toHaveLength(1);
  expect(approved[0]?.is_cover).toBe(true);

  // day_of_week 1 is Tuesday in the seed's forecast convention.
  const forecasts = await db.select().from(forecast).where(eq(forecast.spot_id, crr));
  expect(forecasts).toHaveLength(2);
  const at = (hour: number) =>
    forecasts.find((f) => f.profile === "regular" && f.day_of_week === 1 && f.hour === hour)?.ratio;
  expect(at(14)).toBeCloseTo(0.7);
  expect(at(15)).toBeCloseTo(0.75);

  const estimates = await db.select().from(spot_estimate).where(eq(spot_estimate.spot_id, crr));
  expect(
    estimates.map((e) => ({ day_type: e.day_type, block: e.block, bucket: e.bucket })),
  ).toEqual([{ day_type: "weekday", block: "afternoon", bucket: "filling" }]);

  const [spring] = await db.select().from(term).where(eq(term.id, "2027-spring"));
  expect(spring).toBeDefined();
  expect(await db.select().from(spot_hours).where(eq(spot_hours.term_id, "2027-spring"))).toEqual(
    [],
  );

  const published = await db.select().from(spot).where(eq(spot.status, "published"));
  expect(published).toHaveLength(4);
  const identity = await db
    .select()
    .from(spot_verification)
    .where(eq(spot_verification.attribute_group, "identity"));
  for (const s of published) {
    expect(identity.some((v) => v.spot_id === s.id)).toBe(true);
  }
});
