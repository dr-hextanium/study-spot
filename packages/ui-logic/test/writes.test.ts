import { expect, test } from "bun:test";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import {
  createOutboxStore,
  nextToSend,
  photoKey,
  planEnqueue,
  rewriteSpotIds,
  WriteRecord,
} from "../src/index.ts";
import {
  create,
  identity,
  LOCAL,
  POWER,
  photo,
  rec,
  SEATING,
  SPOT_A,
  SPOT_B,
  section,
} from "./builders.ts";
import { MemoryBinary, MemoryCache, mutableClock } from "./fakes.ts";

const meta = (n: number) => ({
  client_write_id: `00000000-0000-4000-b000-00000000000${n}`,
  seq: 100 + n,
  created_at: "2026-10-05T16:00:00.000Z",
});
const powerWrite = { kind: "spot.section", spot_id: SPOT_A, payload: POWER } as const;

test("the first write for a spot takes the seen version; later ones chain", () => {
  const first = planEnqueue([], powerWrite, 3, meta(1));
  expect(first.put[0]?.base_version).toBe(3);
  expect(first.seedVersion).toBe(3);
  const second = planEnqueue(
    first.put,
    { kind: "spot.section", spot_id: SPOT_A, payload: SEATING },
    3,
    meta(2),
  );
  expect(second.put[0]?.base_version).toBeNull();
  expect(second.seedVersion).toBeNull();
});

test("saving a section again replaces the unsent copy in place", () => {
  const queued = section(SPOT_A, POWER, { base_version: 3 });
  const again = { ...POWER, data: { ...POWER.data, cell_signal: "poor" as const } };
  const plan = planEnqueue([queued], { ...powerWrite, payload: again }, 3, meta(1));
  expect(plan.remove).toEqual([]);
  expect(plan.put).toHaveLength(1);
  expect(plan.put[0]?.client_write_id).toBe(queued.client_write_id);
  expect(plan.put[0]?.payload).toEqual(again);
});

test("saving a failed or conflicted section queues a new id; a conflict rebases", () => {
  const failed = section(SPOT_A, POWER, { state: "failed", attempts: 1, base_version: 3 });
  const plan = planEnqueue([failed], powerWrite, 3, meta(1));
  expect(plan.remove).toEqual([failed.client_write_id]);
  expect(plan.put[0]).toMatchObject({ client_write_id: meta(1).client_write_id, base_version: 3 });

  const current = surveySpotFixture({ version: 7 });
  const conflict = section(SPOT_A, POWER, { state: "conflict", attempts: 1, current });
  expect(planEnqueue([conflict], powerWrite, 3, meta(2)).put[0]?.base_version).toBe(7);
});

test("a second publish is a no-op and invalid section data is refused", () => {
  const publish = rec({ kind: "spot.publish", spot_id: SPOT_A, payload: {} });
  const plan = planEnqueue(
    [publish],
    { kind: "spot.publish", spot_id: SPOT_A, payload: {} },
    3,
    meta(1),
  );
  expect(plan).toEqual({
    put: [],
    remove: [],
    seedVersion: null,
    existing: publish.client_write_id,
  });
  const bad = { ...SEATING, data: { ...SEATING.data, seat_count: 0 } };
  expect(() =>
    planEnqueue([], { kind: "spot.section", spot_id: SPOT_A, payload: bad }, 3, meta(2)),
  ).toThrow();
});

test("Basics saved for a refused or unsent create edits the create", () => {
  const refused = create(LOCAL, {
    state: "failed",
    attempts: 1,
    error: { status: 422, code: "slug_taken", message: null, missing: [] },
  });
  const basics = { section: "identity", data: identity({ slug: "sac-lounge-2" }) } as const;
  const plan = planEnqueue(
    [refused],
    { kind: "spot.section", spot_id: LOCAL, payload: basics },
    null,
    meta(1),
  );
  expect(plan.remove).toEqual([]);
  expect(plan.put).toHaveLength(1);
  expect(plan.put[0]).toMatchObject({
    client_write_id: refused.client_write_id,
    payload: { identity: basics.data },
    state: "pending",
    error: null,
  });
});

test("oldest first across spots; photos jump only their own spot's text", () => {
  const b = section(SPOT_B, POWER);
  const a = section(SPOT_A, POWER);
  const aPhoto = photo(SPOT_A);
  expect(nextToSend([aPhoto, a, b])).toBe(b);
  expect(nextToSend([aPhoto, a])).toBe(aPhoto);
});

test("a failed write holds later text on its spot, not photos or other spots", () => {
  const failed = section(SPOT_A, POWER, { state: "failed" });
  const later = section(SPOT_A, SEATING);
  const aPhoto = photo(SPOT_A);
  const other = section(SPOT_B, POWER);
  const records: WriteRecord[] = [failed, later, aPhoto, other];
  expect(nextToSend(records)).toBe(aPhoto);
  expect(nextToSend([failed, later, other])).toBe(other);
  expect(nextToSend([failed, later])).toBeNull();
});

test("rewriting local ids leaves the create alone", () => {
  const records = [create(LOCAL), section(LOCAL, POWER)];
  const changed = rewriteSpotIds(records, { [LOCAL]: SPOT_A });
  expect(changed.map((r) => [r.kind, r.spot_id])).toEqual([["spot.section", SPOT_A]]);
});

test("the store skips unreadable records and removes photo bytes with a record", async () => {
  const cache = new MemoryCache();
  const blobs = new MemoryBinary();
  const store = createOutboxStore({ cache, blobs, clock: mutableClock("2026-10-05T16:00:00Z") });
  const p = photo(SPOT_A);
  await store.put(p);
  await store.putPhoto(p.client_write_id, new Uint8Array([1, 2, 3]));
  await cache.set("outbox:w:broken", "{not json");
  expect(await store.list()).toEqual([p]);
  await store.remove(p.client_write_id);
  expect(blobs.data.has(photoKey(p.client_write_id))).toBe(false);
  expect(await store.list()).toEqual([]);
});

test("nextSeq stays above queued records when the seq key is evicted and the clock is behind", async () => {
  const cache = new MemoryCache();
  const store = createOutboxStore({
    cache,
    blobs: new MemoryBinary(),
    clock: mutableClock("2026-10-05T15:00:00Z"),
  });
  const ahead = Date.parse("2026-10-05T16:00:00Z");
  const queued = section(SPOT_A, POWER, { seq: ahead });
  await store.put(queued);
  await cache.delete("outbox:seq");
  expect(await store.nextSeq()).toBeGreaterThan(ahead);
});

test("concurrent nextSeq calls get distinct, increasing values", async () => {
  const store = createOutboxStore({
    cache: new MemoryCache(),
    blobs: new MemoryBinary(),
    clock: mutableClock("2026-10-05T16:00:00Z"),
  });
  const [a, b, c] = await Promise.all([store.nextSeq(), store.nextSeq(), store.nextSeq()]);
  expect(a).toBeLessThan(b);
  expect(b).toBeLessThan(c);
});

test("unreadable records are reported, kept in storage, and left out of list", async () => {
  const cache = new MemoryCache();
  const store = createOutboxStore({
    cache,
    blobs: new MemoryBinary(),
    clock: mutableClock("2026-10-05T16:00:00Z"),
  });
  const ok = section(SPOT_A, POWER);
  await store.put(ok);
  await cache.set("outbox:w:bad-json", "{not json");
  await cache.set("outbox:w:bad-schema", JSON.stringify({ kind: "spot.section" }));
  expect(await store.list()).toEqual([ok]);
  expect((await store.unreadable()).sort()).toEqual(["outbox:w:bad-json", "outbox:w:bad-schema"]);
  expect(cache.data.has("outbox:w:bad-json")).toBe(true);
  expect(cache.data.has("outbox:w:bad-schema")).toBe(true);
});

test("re-saving a conflicted section rebases on the server version and seeds it", () => {
  const current = surveySpotFixture({ version: 7 });
  const conflict = section(SPOT_A, POWER, { state: "conflict", attempts: 1, current });
  const behind = section(SPOT_A, SEATING, { base_version: null });
  const plan = planEnqueue([conflict, behind], powerWrite, 3, meta(1));
  expect(plan.remove).toEqual([conflict.client_write_id]);
  expect(plan.seedVersion).toBe(7);
  expect(plan.put[0]?.base_version).toBeNull();

  const alone = planEnqueue([conflict], powerWrite, 3, meta(2));
  expect(alone.seedVersion).toBe(7);
  expect(alone.put[0]?.base_version).toBe(7);
});

test("new records carry schema version 1; records without one still read as version 1", () => {
  const [made] = planEnqueue([], powerWrite, 3, meta(1)).put;
  expect(made?.v).toBe(1);
  const { v: _v, ...legacy } = section(SPOT_A, POWER);
  expect(WriteRecord.safeParse(legacy).success).toBe(true);
  expect(WriteRecord.safeParse({ ...legacy, v: 2 }).success).toBe(false);
});
