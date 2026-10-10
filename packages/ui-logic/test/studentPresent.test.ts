import { expect, test } from "bun:test";
import { DEFAULT_ACCESS, FULLNESS, presetById, rankSpots, type SlotConfidence } from "@perch/core";
import { makeScoringBundle } from "../../core/test/fixtures/scoring-bundle.ts";
import {
  busyLine,
  clockText,
  closesText,
  dataAgeView,
  lockText,
  pickCardView,
  rowBusy,
  slotWhen,
} from "../src/index.ts";

const NY = "America/New_York";
const TUE_2PM = new Date("2026-10-13T18:00:00Z");
const RATIOS = [0.1, 0.35, 0.6, 0.85, 1];

test("every busyness string names its basis and never claims to be live", () => {
  const confs: SlotConfidence[] = ["measured", "estimated", "none"];
  for (const confidence of confs) {
    for (const ratio of RATIOS) {
      for (const at of [TUE_2PM, new Date("2026-10-14T05:30:00Z")]) {
        const line = busyLine({ ratio, confidence }, at, NY);
        expect(line).toMatch(/typical|estimate|No busyness data/);
        expect(line).not.toMatch(/\blive\b|\bnow\b|right now/i);
        const row = rowBusy({ ratio, confidence });
        expect(row).toMatch(/^Usually|est\.$|^No data/);
        expect(row).not.toMatch(/\blive\b|\bnow\b/i);
      }
    }
  }
  expect(FULLNESS).toHaveLength(5);
});

test("measured lines carry the slot; estimates and no data do not", () => {
  expect(busyLine({ ratio: 0.35, confidence: "measured" }, TUE_2PM, NY)).toBe(
    "Usually some seats, typical Tue 2 PM",
  );
  expect(busyLine({ ratio: 0.6, confidence: "estimated" }, TUE_2PM, NY)).toBe(
    "Filling up, estimate",
  );
  expect(busyLine({ ratio: 0.6, confidence: "none" }, TUE_2PM, NY)).toBe("No busyness data yet");
});

test("times read in campus time", () => {
  expect(slotWhen(new Date("2026-10-14T04:30:00Z"), NY)).toBe("Wed 12 AM");
  expect(clockText(new Date("2026-10-14T06:00:00Z"), NY)).toBe("2:00 AM");
  expect(closesText(new Date("2026-10-13T18:40:00Z"), TUE_2PM, NY)).toBe("Closes in 40 min");
  expect(closesText(new Date("2026-10-14T06:00:00Z"), TUE_2PM, NY)).toBe("Open till 2:00 AM");
  expect(closesText(new Date("2026-10-15T06:00:00Z"), TUE_2PM, NY)).toBe("Open all day");
});

test("pick card view for the golden top pick", () => {
  const bundle = makeScoringBundle();
  const r = rankSpots({
    bundle,
    now: TUE_2PM,
    from: "melville-library",
    time: "60",
    preset: presetById("silent_solo", []),
    extra: [],
    group: 1,
    access: DEFAULT_ACCESS,
  });
  const top = r.ranked[0];
  if (top === undefined) throw new Error("no pick");
  expect(pickCardView(top, bundle, TUE_2PM)).toEqual({
    id: top.spot.id,
    slug: "quiet-carrels",
    name: "Quiet Carrels",
    place: "Melville Library · Floor 1",
    walk: "In this building",
    busy: "Usually some seats, typical Tue 2 PM",
    seat: "Likely seats",
    closes: "Open till 2:00 AM",
    reasons: ["Silent", "Outlets at most seats"],
  });
});

test("lock labels", () => {
  expect(lockText({ kind: "open" })).toBeNull();
  expect(lockText({ kind: "unverified" })).toBe("Access not confirmed yet");
  expect(lockText({ kind: "locked", eligibility: "residents_quad", scope: "Kelly Quad" })).toBe(
    "Residents of Kelly Quad only",
  );
  expect(lockText({ kind: "locked", eligibility: "department", scope: null })).toBe(
    "One department only",
  );
});

test("data age", () => {
  expect(dataAgeView(0, false)).toEqual({
    line: "Spots updated today",
    prominent: null,
    offline: false,
  });
  expect(dataAgeView(4, true)).toEqual({
    line: "Spots updated 4 days ago",
    prominent: "These spots are 4 days old. Hours and busyness may have changed.",
    offline: true,
  });
  expect(dataAgeView(3, false).prominent).toBeNull();
});
