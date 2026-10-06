import type { SpotList, SurveySpot } from "@study-spot/core";
import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { keys } from "../src/app/keys.ts";
import {
  applyServerSpot,
  mergeList,
  newerSpot,
  sanitizePersisted,
} from "../src/app/serverCache.ts";
import { CAMPUS, summary } from "./harness.tsx";

const v = (version: number, over: Partial<SurveySpot> = {}) =>
  surveySpotFixture({ version, ...over });

test("a spot is never replaced by an older version", () => {
  expect(newerSpot(v(5), v(4)).version).toBe(5);
  expect(newerSpot(v(4), v(5)).version).toBe(5);
  expect(newerSpot(undefined, v(2)).version).toBe(2);
});

test("a refetched list keeps rows this phone holds at a newer version", () => {
  const old: SpotList = { term: null, spots: [summary(v(6, { official_name: "Mine" }))] };
  const next: SpotList = {
    term: { id: "t", name: "T" },
    spots: [summary(v(5, { official_name: "Stale" }))],
  };
  const merged = mergeList(old, next);
  expect(merged.term).toEqual({ id: "t", name: "T" });
  expect(merged.spots.map((s) => [s.official_name, s.version])).toEqual([["Mine", 6]]);
});

test("an applied write updates the detail and the list row, never lowering either", () => {
  const qc = new QueryClient();
  qc.setQueryData(keys.campus, CAMPUS);
  qc.setQueryData<SpotList>(keys.list, { term: null, spots: [summary(v(3))] });
  applyServerSpot(qc, v(4, { official_name: "Renamed", hours: [] }));
  expect(qc.getQueryData<SurveySpot>(keys.spot(v(4).id))?.version).toBe(4);
  const row = qc.getQueryData<SpotList>(keys.list)?.spots[0];
  expect(row).toMatchObject({ version: 4, official_name: "Renamed", hours_confirmed: false });
  expect(row?.building_name).toBe("Melville Library");
  applyServerSpot(qc, v(3, { official_name: "Old" }));
  expect(qc.getQueryData<SurveySpot>(keys.spot(v(4).id))?.official_name).toBe("Renamed");
  expect(qc.getQueryData<SpotList>(keys.list)?.spots[0]?.official_name).toBe("Renamed");
});

test("a spot created on this phone joins the cached list once the server has it", () => {
  const qc = new QueryClient();
  qc.setQueryData<SpotList>(keys.list, { term: null, spots: [] });
  applyServerSpot(qc, v(1, { building_id: "sac" }));
  qc.setQueryData(keys.campus, CAMPUS);
  expect(qc.getQueryData<SpotList>(keys.list)?.spots).toHaveLength(1);
});

test("persisted queries are checked on restore: damaged or unknown ones are dropped", () => {
  const good = { queryKey: ["survey", "spot", v(3).id], queryHash: "a", state: { data: v(3) } };
  const damaged = { queryKey: ["survey", "spot", "x"], queryHash: "b", state: { data: { id: 1 } } };
  const admin = {
    queryKey: ["admin", "surveyors"],
    queryHash: "c",
    state: { data: { surveyors: [] } },
  };
  const restored = sanitizePersisted({
    timestamp: 5,
    buster: "survey-1",
    clientState: { mutations: [], queries: [good, damaged, admin] },
  });
  expect(restored.clientState.queries.map((q) => q.queryHash)).toEqual(["a"]);
  expect(restored.buster).toBe("survey-1");
  expect(sanitizePersisted("garbage").clientState.queries).toEqual([]);
  expect(sanitizePersisted({ timestamp: 1 }).clientState.queries).toEqual([]);
});
