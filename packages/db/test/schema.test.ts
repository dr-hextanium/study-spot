import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import {
  building,
  bundle_state,
  campus,
  invite,
  photo_blob,
  spot,
  spot_hours,
  spot_photo,
  spot_room,
  spot_seat_type,
  spotSelectSchema,
  surveyor,
  term,
  write_receipt,
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

test("surveyor tooling columns have the expected defaults", async () => {
  const { db, row } = await withSpot();
  expect(row.review_state).toBe("unreviewed");
  expect(row.last_edited_by).toBeNull();
  const [draft] = await db
    .insert(spot)
    .values({
      slug: "no-noise-yet",
      building_id: "melville-library",
      floor: "1",
      official_name: "No Noise Yet",
      lat: 40.9,
      lng: -73.1,
    })
    .returning();
  expect(draft?.noise_policy).toBeNull();

  const [state] = await db.insert(bundle_state).values({ campus_id: "sbu" }).returning();
  expect(state?.write_seq).toBe(0);
  expect(state?.last_warnings).toBeNull();

  // magic_link was dropped by migration 0002.
  await expect(Promise.resolve(db.execute(sql`select * from magic_link`))).rejects.toThrow();
});

test("invites allow a null creator and enforce the surveyor reference", async () => {
  const { db } = await withSpot();
  const [s] = await db.insert(surveyor).values({ display_name: "Ana" }).returning();
  if (!s) throw new Error("insert returned nothing");
  expect(s.email).toBeNull();
  const expires_at = new Date("2026-10-15T00:00:00Z");
  await db.insert(invite).values({ token_hash: "a", role: "admin", expires_at });
  await db
    .insert(invite)
    .values({ token_hash: "b", role: "surveyor", surveyor_id: s.id, created_by: s.id, expires_at });
  await expect(
    Promise.resolve(
      db.insert(invite).values({
        token_hash: "c",
        role: "surveyor",
        surveyor_id: "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
        expires_at,
      }),
    ),
  ).rejects.toThrow();
});

test("photo blobs round-trip bytes exactly and photos must reference a blob", async () => {
  const { db, row } = await withSpot();
  const bytes = new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x7f, 0x80, 0xff, 0xd9]);
  await db
    .insert(photo_blob)
    .values({ sha256: "f".repeat(64), bytes, content_type: "image/jpeg", byte_size: 8 });
  const [blob] = await db.select().from(photo_blob);
  expect(blob?.bytes ? Array.from(blob.bytes) : []).toEqual(Array.from(bytes));
  expect(blob?.pages_hash).toBeNull();
  expect(blob?.offloaded_at).toBeNull();

  await db
    .insert(spot_photo)
    .values({ spot_id: row.id, blob_sha256: "f".repeat(64), taken_at: new Date() });
  await expect(
    Promise.resolve(
      db
        .insert(spot_photo)
        .values({ spot_id: row.id, blob_sha256: "0".repeat(64), taken_at: new Date() }),
    ),
  ).rejects.toThrow();
});

test("an offloaded blob keeps its hash and row with no bytes", async () => {
  const { db, row } = await withSpot();
  const offloadedAt = new Date("2026-10-13T18:00:00Z");
  await db.insert(photo_blob).values({
    sha256: "e".repeat(64),
    bytes: null,
    content_type: "image/jpeg",
    byte_size: 8,
    pages_hash: "a".repeat(32),
    offloaded_at: offloadedAt,
  });
  await db
    .insert(spot_photo)
    .values({ spot_id: row.id, blob_sha256: "e".repeat(64), taken_at: new Date() });
  const [blob] = await db.select().from(photo_blob);
  expect(blob?.bytes).toBeNull();
  expect(blob?.pages_hash).toBe("a".repeat(32));
  expect(blob?.offloaded_at?.toISOString()).toBe(offloadedAt.toISOString());
});

test("write receipts store a json response", async () => {
  const { db } = await withSpot();
  const [s] = await db.insert(surveyor).values({ display_name: "Ana" }).returning();
  if (!s) throw new Error("insert returned nothing");
  const id = "0b7e7f8e-3f3a-4c55-8d5e-1e2f3a4b5c6d";
  const response = { kind: "spot.create", status: 201, body: { id: "x" } };
  await db
    .insert(write_receipt)
    .values({ client_write_id: id, surveyor_id: s.id, response_json: response });
  const [r] = await db.select().from(write_receipt);
  expect(r?.response_json).toEqual(response);
});

test("a spot with photos cannot be deleted, so offloaded photos never vanish with it", async () => {
  const { db, row } = await withSpot();
  await db.insert(photo_blob).values({
    sha256: "d".repeat(64),
    bytes: null,
    content_type: "image/jpeg",
    byte_size: 8,
    pages_hash: "b".repeat(32),
  });
  await db
    .insert(spot_photo)
    .values({ spot_id: row.id, blob_sha256: "d".repeat(64), taken_at: new Date() });
  await expect(Promise.resolve(db.delete(spot).where(eq(spot.id, row.id)))).rejects.toThrow();
  await db.delete(spot_photo).where(eq(spot_photo.spot_id, row.id));
  await db.delete(spot).where(eq(spot.id, row.id));
  expect(await db.select().from(spot)).toEqual([]);
});
