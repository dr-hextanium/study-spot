import { expect, test } from "bun:test";
import { floorPenalty, walkMinutes } from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";

test("floor penalty: 1 per floor above ground, basements 1, labels and junk 0", () => {
  expect(floorPenalty("1")).toBe(0);
  expect(floorPenalty("3")).toBe(2);
  expect(floorPenalty("2M")).toBe(1);
  expect(floorPenalty("0")).toBe(0);
  expect(floorPenalty("-1")).toBe(1);
  expect(floorPenalty("B")).toBe(1);
  expect(floorPenalty("B1")).toBe(1);
  expect(floorPenalty("B2")).toBe(2);
  expect(floorPenalty("b3")).toBe(3);
  expect(floorPenalty("B0")).toBe(1);
  expect(floorPenalty("Basement")).toBe(1);
  expect(floorPenalty("LL")).toBe(1);
  expect(floorPenalty("G")).toBe(0);
  expect(floorPenalty("Lobby")).toBe(0);
  expect(floorPenalty("mezzanine")).toBe(0);
});

test("walk is matrix minutes plus floors plus a staffed desk", () => {
  const b = makeScoringBundle();
  const byId = (id: string) => {
    const s = b.spots.find((x) => x.id === id);
    if (s === undefined) throw new Error(id);
    return s;
  };
  expect(walkMinutes(b, "melville-library", byId(SPOT.carrels))).toBe(0);
  expect(walkMinutes(b, "melville-library", byId(SPOT.reading))).toBe(2);
  expect(walkMinutes(b, "sac", byId(SPOT.union))).toBe(5);
  expect(walkMinutes(b, "sac", { ...byId(SPOT.union), entry_method: "staffed_desk" })).toBe(7);
});
