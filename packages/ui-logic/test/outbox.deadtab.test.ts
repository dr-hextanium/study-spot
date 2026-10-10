import { expect, test } from "bun:test";
import type { SurveySpot } from "@perch/core";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import { createOutbox, createSurveyApi, HELD_RECHECK_MS } from "../src/index.ts";
import { POWER, SEATING, SPOT_A } from "./builders.ts";
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

/*
 * Tabs sharing one outbox (decision 18). A `syncing` record carries its tab's
 * Liveness owner id: pick and start() leave a live tab's in-flight write alone
 * and send a gone tab's write again. The default Liveness and QueueSignal are
 * in-process registries keyed by the shared cache, which is what these tabs
 * share; apps/web passes Web Locks and BroadcastChannel versions. In these
 * tests, stop() stands in for a tab dying.
 */

const power = (spot_id: string) => ({ kind: "spot.section", spot_id, payload: POWER }) as const;
const seating = (spot_id: string) => ({ kind: "spot.section", spot_id, payload: SEATING }) as const;

function setup(spots: SurveySpot[]) {
  const server = new FakeSurveyServer(spots);
  const cache = new MemoryCache();
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
  return { server, network, foreground, timers, make };
}

test("a live tab recovers a dead tab's in-flight write without a reload", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const live = t.make();
  await live.start();
  const dying = t.make();
  await dying.start();
  const gate = t.server.holdNext();
  await dying.enqueue(power(SPOT_A), 3);
  // The dying tab's request is in flight and its answer never comes back.
  await gate.arrived;
  dying.stop();
  await live.enqueue(seating(SPOT_A), 3);
  await live.idle();
  t.foreground.fire();
  await live.idle();

  expect(live.getSnapshot().records).toEqual([]);
  expect(t.server.spot(SPOT_A).version).toBe(5);
  expect(t.server.requests.map((r) => [r.path, r.body.base_version])).toEqual([
    [`/survey/spots/${SPOT_A}/power`, 3],
    [`/survey/spots/${SPOT_A}/power`, 3],
    [`/survey/spots/${SPOT_A}/seating`, 4],
  ]);
});

test("start() in a new tab does not send a live tab's in-flight write again", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const a = t.make();
  await a.start();
  t.network.set(false);
  await a.enqueue(power(SPOT_A), 3);
  const gate = t.server.holdNext();
  t.network.set(true);
  await gate.arrived;
  const b = t.make();
  await b.start();
  gate.release();
  await a.idle();
  await b.idle();

  expect(t.server.requests.filter((r) => r.path.endsWith("/power"))).toHaveLength(1);
  expect(t.server.spot(SPOT_A).version).toBe(4);
  expect(a.getSnapshot().records).toEqual([]);
  expect(b.getSnapshot().records).toEqual([]);
});

test("a spot held by a tab that dies is picked up on the recheck timer alone", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const live = t.make();
  await live.start();
  const dying = t.make();
  await dying.start();
  const gate = t.server.holdNext();
  await dying.enqueue(power(SPOT_A), 3);
  await gate.arrived;
  await live.idle();
  expect(t.timers.scheduled()).toContain(HELD_RECHECK_MS);
  dying.stop();
  t.timers.advance(HELD_RECHECK_MS);
  await live.idle();

  expect(live.getSnapshot().records).toEqual([]);
  expect(t.server.spot(SPOT_A).version).toBe(4);
});

test("a dead tab's late answer does not settle a write another tab took over", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const live = t.make();
  await live.start();
  const dying = t.make();
  await dying.start();
  const gate = t.server.holdNext();
  await dying.enqueue(power(SPOT_A), 3);
  await gate.arrived;
  dying.stop();
  const second = t.server.holdNext();
  void live.syncNow();
  await second.arrived;
  // The first copy answers while the second is still in flight.
  gate.release();
  await dying.idle();
  expect(live.getSnapshot().records.map((r) => r.state)).toEqual(["syncing"]);
  second.release();
  await live.idle();

  expect(live.getSnapshot().records).toEqual([]);
  expect(t.server.executed).toHaveLength(1);
  expect(t.server.spot(SPOT_A).version).toBe(4);
});

test("a tab whose writes are all held by another tab never says it is syncing", async () => {
  const t = setup([surveySpotFixture({ id: SPOT_A, version: 3 })]);
  const sender = t.make();
  await sender.start();
  const watcher = t.make();
  await watcher.start();
  const seen: boolean[] = [];
  watcher.subscribe(() => seen.push(watcher.getSnapshot().syncing));
  const gate = t.server.holdNext();
  await sender.enqueue(power(SPOT_A), 3);
  await gate.arrived;
  // Every wake-up (the sender's signal, the foreground, the recheck) finds the spot held.
  t.foreground.fire();
  await watcher.idle();
  t.timers.advance(HELD_RECHECK_MS);
  await watcher.idle();
  gate.release();
  await sender.idle();
  await watcher.idle();

  expect(watcher.getSnapshot().records).toEqual([]);
  expect(seen).not.toContain(true);
});
