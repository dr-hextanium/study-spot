import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { building, spot, spot_hours, walk_matrix } from "../src/index.ts";
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

test("seed is rejected on a non-empty database", async () => {
  const db = await createTestDb();
  await seed(db);
  await expect(seed(db)).rejects.toThrow();
});
