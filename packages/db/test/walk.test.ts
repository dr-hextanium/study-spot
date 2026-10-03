import { expect, test } from "bun:test";
import { assembleWalk } from "../src/bundle/walk.ts";

const b = (id: string, lat: number) => ({ id, campus_id: "sbu", name: id, lat, lng: -73.12 });

test("builds a sorted square matrix with zero diagonal", () => {
  const walk = assembleWalk(
    [b("sac", 40.901), b("lib", 40.9)],
    [
      { from_building_id: "lib", to_building_id: "sac", minutes: 4 },
      { from_building_id: "sac", to_building_id: "lib", minutes: 5 },
    ],
  );
  expect(walk.building_ids).toEqual(["lib", "sac"]);
  expect(walk.minutes).toEqual([
    [0, 4],
    [5, 0],
  ]);
  expect(walk.estimated_pairs).toEqual([]);
});

test("missing pairs fall back to straight-line time and are flagged", () => {
  const walk = assembleWalk([b("lib", 40.9), b("sac", 40.901)], []);
  // about 111 m, fallback rounds up to 2 minutes
  expect(walk.minutes).toEqual([
    [0, 2],
    [2, 0],
  ]);
  expect(walk.estimated_pairs).toEqual([
    [0, 1],
    [1, 0],
  ]);
});
