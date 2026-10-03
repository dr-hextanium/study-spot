import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
  building,
  campus,
  spot,
  spot_hours,
  spot_photo,
  spot_room,
  spot_seat_type,
  spotSelectSchema,
  term,
} from "../src/index.ts";
import { createTestDb } from "../src/testing.ts";

async function withSpot() {
  const db = await createTestDb();
  await db
    .insert(campus)
    .values({ id: "sbu", name: "Stony Brook University", tz: "America/New_York" });
  await db.insert(term).values({
    id: "2026-fall",
    campus_id: "sbu",
    name: "Fall 2026",
    starts: "2026-08-24",
    ends: "2026-12-19",
  });
  await db.insert(building).values({
    id: "melville-library",
    campus_id: "sbu",
    name: "Melville Library",
    lat: 40.9154,
    lng: -73.1222,
  });

  const [row] = await db
    .insert(spot)
    .values({
      slug: "central-reading-room",
      building_id: "melville-library",
      floor: "3",
      official_name: "Central Reading Room",
      lat: 40.9155,
      lng: -73.1221,
      noise_policy: "silent",
    })
    .returning();
  if (!row) throw new Error("insert returned nothing");
  return { db, row };
}

test("migrations apply and enums enforce values", async () => {
  const { db, row } = await withSpot();
  expect(row.status).toBe("draft");
  expect(row.version).toBe(1);
  expect(row.eligibility_verified).toBe(false);
  expect(spotSelectSchema.safeParse(row).success).toBe(true);

  await expect(
    Promise.resolve(
      db.execute(sql`insert into spot (slug, building_id, floor, official_name, lat, lng, noise_policy)
      values ('x', 'melville-library', '1', 'X', 0, 0, 'loud')`),
    ),
  ).rejects.toThrow();
});

test("spot_hours accepts valid rows and rejects bad day or time", async () => {
  const { db, row } = await withSpot();
  const base = { spot_id: row.id, term_id: "2026-fall", opens: "08:00", closes: "02:00" };
  await db.insert(spot_hours).values({ ...base, day_of_week: 0 });
  await db.insert(spot_hours).values({ ...base, day_of_week: 1, closes: "24:00" });
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 7 })),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 2, opens: "8:00" })),
  ).rejects.toThrow();
});

test("a spot has at most one cover photo", async () => {
  const { db, row } = await withSpot();
  const photo = {
    spot_id: row.id,
    url: "https://example.org/a.jpg",
    r2_key: "a.jpg",
    taken_at: new Date(),
  };
  await db.insert(spot_photo).values({ ...photo, is_cover: true });
  await db.insert(spot_photo).values({ ...photo, is_cover: false });
  await expect(
    Promise.resolve(db.insert(spot_photo).values({ ...photo, is_cover: true })),
  ).rejects.toThrow();
});

test("spot_hours rejects opens at 24:00, bad last_entry, and duplicate slots", async () => {
  const { db, row } = await withSpot();
  const base = { spot_id: row.id, term_id: "2026-fall", opens: "08:00", closes: "24:00" };
  await db.insert(spot_hours).values({ ...base, day_of_week: 0, last_entry: "23:30" });
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 1, opens: "24:00" })),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 1, last_entry: "9pm" })),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(db.insert(spot_hours).values({ ...base, day_of_week: 0 })),
  ).rejects.toThrow();
  // A second block on the same day with a different opening time is allowed.
  await db.insert(spot_hours).values({ ...base, day_of_week: 0, opens: "18:00" });
});

test("counts and capacities cannot be negative", async () => {
  const { db, row } = await withSpot();
  await expect(
    Promise.resolve(db.insert(spot_seat_type).values({ spot_id: row.id, type: "soft", count: -1 })),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(db.insert(spot_room).values({ spot_id: row.id, name: "A", capacity: -1 })),
  ).rejects.toThrow();
  await db.insert(spot_room).values({ spot_id: row.id, name: "B", capacity: null });
});

test("pick_ping hour bucket stays within a day", async () => {
  const { db, row } = await withSpot();
  await db.execute(
    sql`insert into pick_ping (spot_id, day, hour_bucket) values (${row.id}, '2026-10-13', 23)`,
  );
  await expect(
    Promise.resolve(
      db.execute(
        sql`insert into pick_ping (spot_id, day, hour_bucket) values (${row.id}, '2026-10-13', 24)`,
      ),
    ),
  ).rejects.toThrow();
});
