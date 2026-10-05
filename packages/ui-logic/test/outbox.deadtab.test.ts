import { expect, test } from "bun:test";
import type { SurveySpot } from "@study-spot/core";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import { createOutbox, createSurveyApi } from "../src/index.ts";
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
 * Acceptance tests for tabs sharing one outbox, which plan D must make pass.
 * Today a `syncing` record from another tab is trusted until a reload, so a
 * dead tab's write blocks its spot, and start() in a new tab resets a live
 * tab's in-flight write and sends it twice. Plan D adds an owner id on syncing
 * records and a liveness check (Web Locks) in pick and start(). It may change
 * the setup to wire liveness in; the assertions describe the required outcome.
 * In these tests, stop() stands in for a tab dying.
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
  return { server, network, foreground, make };
}

// required by plan D (Web Locks liveness)
test.skip("a live tab recovers a dead tab's in-flight write without a reload", async () => {
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

// required by plan D (Web Locks liveness)
test.skip("start() in a new tab does not send a live tab's in-flight write again", async () => {
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
