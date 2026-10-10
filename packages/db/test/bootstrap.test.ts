import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { bootstrap } from "../src/bootstrap/bootstrap.ts";
import { BOOTSTRAP_BUILDINGS, BOOTSTRAP_CAMPUS, BOOTSTRAP_TERMS } from "../src/bootstrap/sbu.ts";
import { building, campus, spot, term, walk_matrix } from "../src/index.ts";
import { seed } from "../src/seed/seed.ts";
import { createTestDb } from "../src/testing.ts";

test("first run inserts the campus, terms and buildings", async () => {
  const db = await createTestDb();
  const report = await bootstrap(db);

  expect(report.campus).toBe("inserted");
  expect(report.terms).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
  expect(report.buildings).toEqual({
    inserted: BOOTSTRAP_BUILDINGS.length,
    updated: 0,
    unchanged: 0,
  });
  expect(await db.select().from(campus)).toEqual([BOOTSTRAP_CAMPUS]);
  expect(await db.select().from(term)).toHaveLength(BOOTSTRAP_TERMS.length);
  expect(await db.select().from(building)).toHaveLength(BOOTSTRAP_BUILDINGS.length);
  expect(await db.select().from(walk_matrix)).toEqual([]);
});

test("second run changes nothing", async () => {
  const db = await createTestDb();
  await bootstrap(db);
  const before = {
    campus: await db.select().from(campus),
    terms: await db.select().from(term),
    buildings: await db.select().from(building),
  };

  const report = await bootstrap(db);
  expect(report.campus).toBe("unchanged");
  expect(report.terms).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
  expect(report.buildings).toEqual({
    inserted: 0,
    updated: 0,
    unchanged: BOOTSTRAP_BUILDINGS.length,
  });
  expect(await db.select().from(campus)).toEqual(before.campus);
  expect(await db.select().from(term)).toEqual(before.terms);
  expect(await db.select().from(building)).toEqual(before.buildings);
});

test("a changed building name is updated, others are untouched", async () => {
  const db = await createTestDb();
  await bootstrap(db);
  await db.update(building).set({ name: "Old Name" }).where(eq(building.id, "sac"));

  const report = await bootstrap(db);
  expect(report.buildings.updated).toBe(1);
  expect(report.buildings.unchanged).toBe(BOOTSTRAP_BUILDINGS.length - 1);
  const [row] = await db.select().from(building).where(eq(building.id, "sac"));
  expect(row?.name).toBe("Student Activities Center");
});

test("a changed term date is updated", async () => {
  const db = await createTestDb();
  await bootstrap(db);
  await db.update(term).set({ exam_starts: "2026-12-01" }).where(eq(term.id, "2026-fall"));

  const report = await bootstrap(db);
  expect(report.terms).toEqual({ inserted: 0, updated: 1, unchanged: 1 });
  const [row] = await db.select().from(term).where(eq(term.id, "2026-fall"));
  expect(row?.exam_starts).toBe("2026-12-09");
});

test("never deletes buildings that are not in the list", async () => {
  const db = await createTestDb();
  await bootstrap(db);
  await db
    .insert(building)
    .values({ id: "extra", campus_id: "sbu", name: "Extra", lat: 40.9, lng: -73.1 });

  await bootstrap(db);
  expect(await db.select().from(building)).toHaveLength(BOOTSTRAP_BUILDINGS.length + 1);
});

test("leaves spots untouched", async () => {
  const db = await createTestDb();
  await seed(db);
  const before = await db.select().from(spot);
  expect(before.length).toBeGreaterThan(0);

  await bootstrap(db);
  expect(await db.select().from(spot)).toEqual(before);
});
