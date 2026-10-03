import { expect, test } from "bun:test";
import { parseBundle, slotIndex } from "@study-spot/core";
import { and, eq } from "drizzle-orm";
import { buildBundle, NoTermError } from "../src/bundle/buildBundle.ts";
import { spot, spot_hours, term, walk_matrix } from "../src/index.ts";
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
