import { expect, test } from "bun:test";
import {
  DEFAULT_ACCESS,
  draw,
  presetById,
  pushRecent,
  RecentPicks,
  rankSpots,
  rerollPool,
  surpriseRank,
  topPick,
  weightedSample,
} from "../../src/index.ts";
import { makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";
import { mulberry32 } from "../prng.ts";

const bundle = makeScoringBundle();
const input = {
  bundle,
  now: new Date("2026-10-13T18:00:00Z"),
  from: "melville-library",
  time: "60" as const,
  preset: presetById("silent_solo", []),
  extra: [],
  group: 1,
  access: DEFAULT_ACCESS,
};

test("weighted sample walks the cumulative weights", () => {
  const items = ["a", "b", "c"];
  const w = (x: string) => ({ a: 1, b: 2, c: 1 })[x] ?? 0;
  expect(weightedSample(items, w, () => 0)).toBe("a");
  expect(weightedSample(items, w, () => 0.3)).toBe("b");
  expect(weightedSample(items, w, () => 0.99)).toBe("c");
  expect(weightedSample([], w, () => 0.5)).toBeNull();
});

test("pool is the top max(5, 30%) above 40% of the top score", () => {
  const ranked = surpriseRank(input).ranked;
  expect(rerollPool(ranked, []).map((c) => c.spot.slug)).toEqual([
    "quiet-carrels",
    "union-study",
    "sac-lounge",
  ]);
});

test("Something else with one good match returns that match", () => {
  const ranked = rankSpots(input).ranked;
  const first = topPick(ranked);
  expect(first?.primary.spot.id).toBe(SPOT.carrels);
  expect(first?.alternates.map((c) => c.spot.slug)).toEqual(["union-study", "reading-room"]);
  const again = draw(ranked, [SPOT.carrels], mulberry32(1));
  expect(again?.primary.spot.id).toBe(SPOT.carrels);
});

test("Surprise me avoids the last picks and falls back to the oldest", () => {
  const ranked = surpriseRank(input).ranked;
  const rand = mulberry32(3);
  const seen = new Set<string>();
  for (let i = 0; i < 300; i += 1) {
    const p = draw(ranked, [SPOT.carrels], rand);
    if (p === null) throw new Error("no pick");
    expect(p.primary.spot.id).not.toBe(SPOT.carrels);
    expect(p.primary.spot.id).not.toBe(SPOT.reading); // below the 40% floor
    seen.add(p.primary.spot.slug);
  }
  expect([...seen].sort()).toEqual(["sac-lounge", "union-study"]);
  // All three pool spots seen recently: the oldest (last in the list) comes back
  const all = [SPOT.carrels, SPOT.union, SPOT.sacLounge];
  expect(draw(ranked, all, rand)?.primary.spot.id).toBe(SPOT.sacLounge);
  expect(draw([], [], rand)).toBeNull();
});

test("a draw never re-shows the spot on screen while others qualify", () => {
  const ranked = surpriseRank(input).ranked;
  const rand = mulberry32(9);
  for (let i = 0; i < 200; i += 1) {
    // Empty Surprise history, but carrels is the current primary (shown by the top pick)
    expect(draw(ranked, [], rand, SPOT.carrels)?.primary.spot.id).not.toBe(SPOT.carrels);
  }
  // With one good match, the current spot comes back (the screen toasts "only good match")
  expect(draw(rankSpots(input).ranked, [], rand, SPOT.carrels)?.primary.spot.id).toBe(SPOT.carrels);
});

test("alternates never repeat the primary", () => {
  const ranked = surpriseRank(input).ranked;
  const p = draw(ranked, [SPOT.carrels], () => 0);
  expect(p?.alternates.some((c) => c.spot.id === p.primary.spot.id)).toBe(false);
  expect(p?.alternates).toHaveLength(2);
});

test("recent history keeps 5, newest first, no duplicates; schema rejects junk", () => {
  let r: string[] = [];
  for (const id of Object.values(SPOT)) r = pushRecent(r, id);
  expect(r).toHaveLength(5);
  expect(r[0]).toBe(SPOT.hoursTbd);
  expect(pushRecent(r, SPOT.grad)[0]).toBe(SPOT.grad);
  expect(new Set(pushRecent(r, SPOT.grad)).size).toBe(5);
  expect(RecentPicks.safeParse(["x"]).success).toBe(false);
});
