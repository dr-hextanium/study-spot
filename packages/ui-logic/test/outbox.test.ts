import { expect, test } from "bun:test";
import type { SurveySpot } from "@study-spot/core";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import {
  BACKOFF_MAX_MS,
  BACKOFF_START_MS,
  createOutbox,
  createOutboxStore,
  createSurveyApi,
} from "../src/index.ts";
import { identity, POWER, SEATING, SPOT_A, SPOT_B } from "./builders.ts";
import { API, FakeSurveyServer, TOKEN } from "./fakeServer.ts";
import {
  FakeForeground,
  FakeNetwork,
  FakeTimers,
  MemoryBinary,
  MemoryCache,
  mutableClock,
  RecordingLock,
  sequentialIds,
} from "./fakes.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const power = (spot_id: string) => ({ kind: "spot.section", spot_id, payload: POWER }) as const;
const seating = (spot_id: string) => ({ kind: "spot.section", spot_id, payload: SEATING }) as const;

class CrashingCache extends MemoryCache {
  failDeletes = false;
  /** Runs before a write lands, so a test can interleave another call there. */
  beforeSet: ((key: string, value: string) => Promise<void>) | null = null;
  override async set(key: string, value: string): Promise<void> {
    await this.beforeSet?.(key, value);
    await super.set(key, value);
  }
  override async delete(key: string): Promise<void> {
    if (this.failDeletes) throw new Error("killed");
    await super.delete(key);
  }
}

function setup(spots: SurveySpot[] = [surveySpotFixture({ id: SPOT_A, version: 3 })]) {
  const server = new FakeSurveyServer(spots);
  const cache = new CrashingCache();
  const blobs = new MemoryBinary();
  const network = new FakeNetwork();
  const timers = new FakeTimers();
  const foreground = new FakeForeground();
  const clock = mutableClock("2026-10-05T16:00:00Z");
  const api = createSurveyApi({ http: server, baseUrl: API, token: () => TOKEN });
  // One lock for every tab, like Web Locks across tabs on one origin.
  const lock = new RecordingLock();
  let tab = 0;
  const make = () => {
    tab += 1;
    const ids = sequentialIds(`80${tab.toString().padStart(2, "0")}`);
    return createOutbox({ cache, blobs, api, clock, ids, timers, network, foreground, lock });
  };
  const sent = () => server.requests.map((r) => `${r.method} ${r.path}`);
  const bases = () => server.requests.map((r) => r.body.base_version);
  return { server, cache, blobs, network, timers, foreground, clock, lock, make, sent, bases };
}

test("a spot created offline syncs its create, then photos, then text, under the real id", async () => {
  const t = setup([]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  const local = await box.createSpot(identity());
  await box.enqueue(power(local), null);
  await box.addPhoto(local, null, JPEG, new Date("2026-10-05T15:59:00Z"));
  const from: (string | null)[] = [];
  box.onApplied((_spot, fromLocal) => from.push(fromLocal));
  t.network.set(true);
  await box.idle();

  const [real] = [...t.server.spots.keys()];
  expect(t.sent()).toEqual([
    "POST /survey/spots",
    "POST /survey/photos",
    `PUT /survey/spots/${real}/power`,
  ]);
  expect(t.bases()).toEqual([undefined, undefined, 1]);
  expect(from).toEqual([local, null, null]);
  expect(box.getSnapshot().records).toEqual([]);
  expect(box.getSnapshot().idMap).toEqual({ [local]: String(real) });
  expect(t.blobs.data.size).toBe(0);
});

test("queued writes on one spot chain base_version from each response", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.enqueue({ kind: "spot.verify", spot_id: SPOT_A, payload: { groups: ["power"] } }, 3);
  await box.enqueue(seating(SPOT_A), 3);
  t.network.set(true);
  await box.idle();
  // Verify does not bump the version (plan A), so the seating write reuses 4.
  expect(t.bases()).toEqual([3, 4, 4]);
  expect(t.server.spot(SPOT_A).version).toBe(5);
});

test("a 409 holds later writes on that spot, other spots go on, and keep mine resends", async () => {
  const t = setup([
    surveySpotFixture({ id: SPOT_A, version: 3 }),
    surveySpotFixture({ id: SPOT_B, slug: "b", version: 1 }),
  ]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  const first = await box.enqueue(power(SPOT_A), 3);
  await box.enqueue(seating(SPOT_A), 3);
  await box.enqueue(power(SPOT_B), 1);
  t.server.bump(SPOT_A, { last_edited_by_name: "Bo" });
  t.network.set(true);
  await box.idle();

  expect(t.sent()).toEqual([
    `PUT /survey/spots/${SPOT_A}/power`,
    `PUT /survey/spots/${SPOT_B}/power`,
  ]);
  const held = box.getSnapshot().records;
  expect(held.map((r) => [r.payload, r.state])).toEqual([
    [POWER, "conflict"],
    [SEATING, "pending"],
  ]);
  expect(held[0]?.current?.version).toBe(4);

  await box.resolveConflict(first, "mine");
  await box.idle();
  expect(t.bases().slice(2)).toEqual([4, 5]);
  expect(box.getSnapshot().records).toEqual([]);
});

test("keep theirs drops the write, adopts the server spot, and later writes chain from it", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  const first = await box.enqueue(power(SPOT_A), 3);
  await box.enqueue(seating(SPOT_A), 3);
  const theirs = t.server.bump(SPOT_A);
  t.network.set(true);
  await box.idle();
  const adopted: SurveySpot[] = [];
  box.onApplied((spot) => adopted.push(spot));
  await box.resolveConflict(first, "theirs");
  await box.idle();
  expect(adopted[0]).toEqual(theirs);
  expect(t.sent().at(-1)).toBe(`PUT /survey/spots/${SPOT_A}/seating`);
  expect(t.bases().at(-1)).toBe(4);
});

test("a 422 fails the write with the missing list, and retry sends it again", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3, missing: ["directions"] })]);
  const box = t.make();
  await box.start();
  const id = await box.enqueue({ kind: "spot.publish", spot_id: SPOT_A, payload: {} }, 3);
  await box.idle();
  expect(box.getSnapshot().records[0]).toMatchObject({
    state: "failed",
    error: { status: 422, code: "incomplete", missing: ["directions"] },
  });
  t.server.spots.set(SPOT_A, { ...t.server.spot(SPOT_A), missing: [] });
  await box.retry(id);
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);
  expect(t.server.spot(SPOT_A).status).toBe("published");
});

test("a 401 pauses sync and keeps the write until resume", async () => {
  const t = setup();
  t.server.signedOut = true;
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  expect(box.getSnapshot().signedOut).toBe(true);
  expect(box.getSnapshot().records[0]).toMatchObject({ state: "pending", attempts: 0 });
  t.foreground.fire();
  await box.idle();
  expect(t.server.requests).toHaveLength(1);
  expect(t.timers.scheduled()).toEqual([]);

  t.server.signedOut = false;
  box.resume();
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);
});

test("5xx and network failures keep the write and back off from 30 s to 5 min", async () => {
  const t = setup();
  t.server.failWith.push(503, 503, 503, 503);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  expect(box.getSnapshot().records[0]).toMatchObject({ state: "pending", attempts: 1 });
  const delays: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [delay = -1] = t.timers.scheduled();
    delays.push(delay);
    if (i === 3) t.server.offline = true;
    t.timers.advance(delay);
    await box.idle();
  }
  expect(delays).toEqual([BACKOFF_START_MS, 60_000, 120_000, 240_000]);
  expect(t.timers.scheduled()).toEqual([BACKOFF_MAX_MS]);
  t.server.offline = false;
  t.timers.advance(BACKOFF_MAX_MS);
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);
  expect(t.timers.scheduled()).toEqual([]);
});

test("coming online, the foreground, and a new write trigger sync; overlaps collapse", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  expect(t.server.requests).toHaveLength(0);
  t.network.set(true);
  await box.idle();
  expect(t.server.requests).toHaveLength(1);

  t.server.failWith.push(503);
  await box.enqueue(seating(SPOT_A), 4);
  await box.idle();
  t.foreground.fire();
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);

  let passes = 0;
  let wasSyncing = false;
  box.subscribe(() => {
    const { syncing } = box.getSnapshot();
    if (syncing && !wasSyncing) passes += 1;
    wasSyncing = syncing;
  });
  t.foreground.fire();
  t.foreground.fire();
  t.foreground.fire();
  await box.idle();
  expect(passes).toBe(2);
});

test("an app killed mid-sync resends the same id and the server applies it once", async () => {
  const t = setup();
  const first = t.make();
  await first.start();
  t.server.dropNextResponse = true;
  const id = await first.enqueue(power(SPOT_A), 3);
  await first.idle();
  first.stop();
  // The process died with the record marked as sending.
  const store = createOutboxStore({ cache: t.cache, blobs: t.blobs, clock: t.clock });
  const [left] = await store.list();
  if (!left) throw new Error("record lost");
  await store.put({ ...left, state: "syncing" });

  const reopened = t.make();
  await reopened.start();
  expect(t.server.requests.map((r) => r.body.client_write_id)).toEqual([id, id]);
  expect(t.server.executed).toEqual([id]);
  expect(reopened.getSnapshot().records).toEqual([]);
  expect(await store.version(SPOT_A)).toBe(4);
});

test("a crash after the id map is saved but before the create is removed replays the create", async () => {
  const t = setup([]);
  t.network.set(false);
  const first = t.make();
  await first.start();
  const local = await first.createSpot(identity());
  await first.enqueue(power(local), null);
  t.cache.failDeletes = true;
  t.network.set(true);
  await first.idle();
  first.stop();
  t.cache.failDeletes = false;

  const reopened = t.make();
  await reopened.start();
  const [real] = [...t.server.spots.keys()];
  expect(t.server.spots.size).toBe(1);
  expect(t.sent()).toEqual([
    "POST /survey/spots",
    "POST /survey/spots",
    `PUT /survey/spots/${real}/power`,
  ]);
  expect(t.server.executed).toHaveLength(2);
  expect(reopened.getSnapshot().records).toEqual([]);
});

test("a refused create is fixed by saving Basics again, and its writes follow", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, slug: "sac-lounge" })]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  const local = await box.createSpot(identity());
  await box.enqueue(power(local), null);
  t.network.set(true);
  await box.idle();
  expect(box.getSnapshot().records[0]).toMatchObject({
    kind: "spot.create",
    state: "failed",
    error: { status: 422, code: "slug_taken" },
  });
  const basics = { section: "identity", data: identity({ slug: "sac-lounge-2" }) } as const;
  await box.enqueue({ kind: "spot.section", spot_id: local, payload: basics }, null);
  await box.idle();
  const real = box.getSnapshot().idMap[local];
  expect(t.sent()).toEqual([
    "POST /survey/spots",
    "POST /survey/spots",
    `PUT /survey/spots/${real}/power`,
  ]);
  expect(box.getSnapshot().records).toEqual([]);
});

test("a photo whose bytes were evicted fails alone and does not hold the spot's text", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.addPhoto(SPOT_A, 3, JPEG, new Date("2026-10-05T15:59:00Z"));
  await box.enqueue(power(SPOT_A), 3);
  t.blobs.data.clear();
  t.network.set(true);
  await box.idle();
  expect(t.sent()).toEqual([`PUT /survey/spots/${SPOT_A}/power`]);
  expect(box.getSnapshot().records).toMatchObject([
    { kind: "photo.upload", state: "failed", error: { status: 0, code: "photo_missing" } },
  ]);
});

test("one spot edited offline in two tabs keeps both writes and runs each once", async () => {
  const t = setup();
  t.network.set(false);
  const tabA = t.make();
  const tabB = t.make();
  await tabA.start();
  await tabB.start();
  await tabA.enqueue(power(SPOT_A), 3);
  await tabB.enqueue(seating(SPOT_A), 3);
  t.network.set(true);
  await Promise.all([tabA.idle(), tabB.idle()]);
  await Promise.all([tabA.syncNow(), tabB.syncNow()]);
  expect(new Set(t.server.executed).size).toBe(2);
  expect(t.server.executed).toHaveLength(2);
  expect(t.server.spot(SPOT_A).version).toBe(5);
  expect(tabB.getSnapshot().records).toEqual([]);
});

test("the clock moving backwards does not reorder queued writes", async () => {
  const t = setup([
    surveySpotFixture({ id: SPOT_A, version: 3 }),
    surveySpotFixture({ id: SPOT_B, slug: "b", version: 1 }),
  ]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  t.clock.set("2026-10-05T14:00:00Z");
  await box.enqueue(power(SPOT_B), 1);
  t.network.set(true);
  await box.idle();
  expect(t.sent()).toEqual([
    `PUT /survey/spots/${SPOT_A}/power`,
    `PUT /survey/spots/${SPOT_B}/power`,
  ]);
});

test("a 2xx with an unreadable body fails instead of replaying forever", async () => {
  const t = setup();
  t.server.failWith.push(200);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  expect(box.getSnapshot().records[0]).toMatchObject({
    state: "failed",
    error: { code: "bad_response" },
  });
  expect(t.timers.scheduled()).toEqual([]);
});

test("discarding a draft drops its queued writes and photo bytes", async () => {
  const t = setup([]);
  t.network.set(false);
  const box = t.make();
  await box.start();
  const local = await box.createSpot(identity());
  await box.addPhoto(local, null, JPEG, new Date("2026-10-05T15:59:00Z"));
  const [create] = box.getSnapshot().records;
  if (!create) throw new Error("no create");
  await box.discard(create.client_write_id);
  expect(box.getSnapshot().records).toEqual([]);
  expect(t.blobs.data.size).toBe(0);
});

test("getSnapshot returns the same object until something changes", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  const a = box.getSnapshot();
  expect(box.getSnapshot()).toBe(a);
  await box.enqueue(power(SPOT_A), 3);
  expect(box.getSnapshot()).not.toBe(a);
});

test("an unreadable record is counted, never sent, and never deleted", async () => {
  const t = setup();
  const garbage = "outbox:w:00000000-0000-4000-9999-000000000001";
  await t.cache.set(garbage, "{not json");
  const box = t.make();
  await box.start();
  expect(box.getSnapshot().unreadable).toBe(1);
  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  expect(t.sent()).toEqual([`PUT /survey/spots/${SPOT_A}/power`]);
  expect(box.getSnapshot().records).toEqual([]);
  expect(box.getSnapshot().unreadable).toBe(1);
  expect(t.cache.data.get(garbage)).toBe("{not json");
});

test("re-saving a conflicted section rebases it, and held writes chain from the server", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  await box.enqueue(seating(SPOT_A), 3);
  t.server.bump(SPOT_A);
  t.network.set(true);
  await box.idle();
  expect(box.getSnapshot().records.map((r) => r.state)).toEqual(["conflict", "pending"]);

  await box.enqueue(power(SPOT_A), 3);
  await box.idle();
  expect(t.sent().slice(1)).toEqual([
    `PUT /survey/spots/${SPOT_A}/seating`,
    `PUT /survey/spots/${SPOT_A}/power`,
  ]);
  expect(t.bases().slice(1)).toEqual([4, 5]);
  expect(box.getSnapshot().records).toEqual([]);
});

/** Lets every pending microtask and storage call run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const NEWER = { ...POWER, data: { ...POWER.data, outlet_coverage_pct: 0.9 } };
const powerData = (t: ReturnType<typeof setup>) =>
  t.server.requests.map(
    (r) => (r.body.data as { outlet_coverage_pct?: number } | undefined)?.outlet_coverage_pct,
  );

test("a re-save landing while sync picks the write is sent too, not lost", async () => {
  const t = setup();
  t.network.set(false);
  const box = t.make();
  await box.start();
  await box.enqueue(power(SPOT_A), 3);
  let resaved: Promise<string> | null = null;
  t.cache.beforeSet = async (_key, value) => {
    if (resaved !== null || !value.includes('"state":"syncing"')) return;
    resaved = box.enqueue({ kind: "spot.section", spot_id: SPOT_A, payload: NEWER }, 3);
    await settle();
  };
  t.network.set(true);
  await box.idle();
  await resaved;
  await box.idle();
  expect(powerData(t)).toEqual([0.5, 0.9]);
  expect(t.server.spot(SPOT_A).outlet_coverage_pct).toBe(0.9);
  expect(box.getSnapshot().records).toEqual([]);
  expect(t.lock.names.length).toBeGreaterThan(0);
});

test("a re-save while the write is in flight is queued behind it and sent", async () => {
  const t = setup();
  const box = t.make();
  await box.start();
  const gate = t.server.holdNext();
  await box.enqueue(power(SPOT_A), 3);
  await gate.arrived;
  await box.enqueue({ kind: "spot.section", spot_id: SPOT_A, payload: NEWER }, 3);
  gate.release();
  await box.idle();
  expect(powerData(t)).toEqual([0.5, 0.9]);
  expect(t.bases()).toEqual([3, 4]);
  expect(box.getSnapshot().records).toEqual([]);
});

test("a write discarded while in flight stays gone after a network error", async () => {
  const t = setup();
  const box = t.make();
  await box.start();
  const gate = t.server.holdNext();
  const id = await box.enqueue(power(SPOT_A), 3);
  await gate.arrived;
  await box.discard(id);
  t.server.offline = true;
  gate.release();
  await box.idle();
  expect(box.getSnapshot().records).toEqual([]);
  t.server.offline = false;
  await box.syncNow();
  t.timers.advance(BACKOFF_MAX_MS);
  await box.idle();
  expect(t.server.requests).toHaveLength(1);
  expect(t.server.executed).toEqual([]);
  expect(box.getSnapshot().records).toEqual([]);
});

test("a write discarded while in flight does not come back as a conflict", async () => {
  const t = setup();
  const box = t.make();
  await box.start();
  const gate = t.server.holdNext();
  const id = await box.enqueue(power(SPOT_A), 3);
  await gate.arrived;
  await box.discard(id);
  t.server.bump(SPOT_A);
  gate.release();
  await box.idle();
  await box.syncNow();
  expect(t.server.requests).toHaveLength(1);
  expect(box.getSnapshot().records).toEqual([]);
});

test("writes queued under a local id after its create applied go out under the real id", async () => {
  const t = setup([]);
  const box = t.make();
  await box.start();
  const local = await box.createSpot(identity());
  await box.idle();
  const real = box.getSnapshot().idMap[local];
  expect(real).toBeDefined();

  await box.enqueue(power(local), null);
  await box.addPhoto(local, null, JPEG, new Date("2026-10-05T15:59:00Z"));
  await box.idle();
  expect(t.sent()).toEqual([
    "POST /survey/spots",
    `PUT /survey/spots/${real}/power`,
    "POST /survey/photos",
  ]);
  expect(t.server.requests.at(-1)?.body.spot_id).toBe(real);
  expect(t.bases().at(1)).toBe(1);
  expect(box.getSnapshot().records).toEqual([]);
});
