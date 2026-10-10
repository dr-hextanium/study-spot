import { expect, test } from "bun:test";
import {
  DEFAULT_ACCESS,
  FULLNESS,
  presetById,
  rankSpots,
  type SeatWord,
  type SlotConfidence,
} from "@perch/core";
import { makeScoringBundle } from "../../core/test/fixtures/scoring-bundle.ts";
import {
  busyLine,
  COPY,
  checkedText,
  checkedView,
  clockText,
  closesText,
  dataAgeView,
  lockText,
  pickCardView,
  rowBusy,
  seatText,
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

test("seat words are a forecast too: never live or now", () => {
  const words: SeatWord[] = ["likely", "tight", "unlikely"];
  for (const w of words) {
    const text = seatText(w);
    expect(text).not.toMatch(/\blive\b|\bnow\b|right now/i);
  }
});

test("no student string claims to know what is happening right now", () => {
  for (const [id, text] of Object.entries(COPY)) {
    if (!id.startsWith("student.")) continue;
    expect({ id, text: /right now/i.test(text) }).toEqual({ id, text: false });
  }
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
    checked: "Checked Oct 6",
  });
});

test("the check date is the newest verified date, always set", () => {
  const spot = makeScoringBundle().spots[0];
  if (spot === undefined) throw new Error("no spot");
  const text: string = checkedText(spot, NY);
  expect(text).toBe("Checked Oct 6");
  // The bundle refuses a spot with no verified date, so this can only be a bug.
  expect(() => checkedText({ ...spot, verified: {} }, NY)).toThrow();
});

test("one presenter and one copy id for the check date", () => {
  const ids: readonly string[] = Object.keys(COPY);
  expect(ids).toContain("student.spot.checked");
  expect(ids).not.toContain("student.pick.checked");
  const spot = makeScoringBundle().spots[0];
  if (spot === undefined) throw new Error("no spot");
  expect(checkedView(spot, NY).latest).toBe(checkedText(spot, NY));
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
