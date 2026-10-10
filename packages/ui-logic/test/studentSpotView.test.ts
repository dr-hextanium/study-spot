import { expect, test } from "bun:test";
import type { BundleSpot } from "@perch/core";
import { makeScoringBundle, SPOT } from "../../core/test/fixtures/scoring-bundle.ts";
import { checkedView, dayForecast, dayShortName, timeOfDayText, weekHours } from "../src/index.ts";

const NY = "America/New_York";
const TUE_2PM = new Date("2026-10-13T18:00:00Z");
const EXAM_TUE = new Date("2026-12-15T19:00:00Z");
const bundle = makeScoringBundle();

function spotOf(id: string): BundleSpot {
  const s = bundle.spots.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no spot ${id}`);
  return s;
}

// "live" is only allowed as the literal ending "not live."
const LIVE = /\blive\b(?!\.)|\bnow\b/i;

test("carrels forecast: 24 bars, one current, measured, typical caption", () => {
  const f = dayForecast(bundle, SPOT.carrels, TUE_2PM);
  if (f.kind !== "bars") throw new Error("expected bars");
  expect(f.bars).toHaveLength(24);
  expect(f.bars[14]?.current).toBe(true);
  expect(f.bars.filter((b) => b.current)).toHaveLength(1);
  expect(f.bars.every((b) => b.confidence === "measured")).toBe(true);
  expect(f.exam).toBe(false);
  expect(f.caption).toBe("Typical Tuesday, not live.");
  expect(f.caption.endsWith("not live.")).toBe(true);
  expect(f.caption).not.toMatch(LIVE);
  expect(f.nowLine).toBe("Usually some seats, typical Tue 2 PM");
  expect(f.nowLine).not.toMatch(LIVE);
  expect(f.bars[14]?.label).toBe("2 PM");
});

test("sac lounge forecast is all estimated", () => {
  const f = dayForecast(bundle, SPOT.sacLounge, TUE_2PM);
  if (f.kind !== "bars") throw new Error("expected bars");
  expect(f.bars.every((b) => b.confidence === "estimated")).toBe(true);
  expect(f.nowLine).toMatch(/estimate/);
  expect(f.nowLine).not.toMatch(LIVE);
});

test("a spot with no data says so", () => {
  expect(dayForecast(bundle, SPOT.hoursTbd, TUE_2PM)).toEqual({
    kind: "none",
    caption: "No data yet",
  });
});

test("exam window uses the finals caption and estimated bars", () => {
  const f = dayForecast(bundle, SPOT.carrels, EXAM_TUE);
  if (f.kind !== "bars") throw new Error("expected bars");
  expect(f.exam).toBe(true);
  expect(f.caption).toBe("Typical Tuesday in finals, not live.");
  expect(f.caption.endsWith("not live.")).toBe(true);
  expect(f.caption).not.toMatch(LIVE);
  expect(f.bars[14]?.ratio).toBe(0.4375);
  expect(f.bars[14]?.confidence).toBe("estimated");
});

test("week hours run Monday to Sunday with today marked", () => {
  const w = weekHours(bundle, spotOf(SPOT.carrels), TUE_2PM);
  expect(w.heading).toBe("This week");
  expect(w.unconfirmed).toBe(false);
  expect(w.days.map((d) => d.name)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  expect(w.days.every((d) => d.text === "8:00 AM to 2:00 AM")).toBe(true);
  expect(w.days.filter((d) => d.today).map((d) => d.name)).toEqual(["Tue"]);
});

test("week hours in finals use the exam rows", () => {
  const w = weekHours(bundle, spotOf(SPOT.carrels), EXAM_TUE);
  expect(w.heading).toBe("Finals hours");
  expect(w.days.every((d) => d.text === "Open 24 hours")).toBe(true);
});

test("unconfirmed hours show Closed every day", () => {
  const w = weekHours(bundle, spotOf(SPOT.hoursTbd), TUE_2PM);
  expect(w.unconfirmed).toBe(true);
  expect(w.days.every((d) => d.text === "Closed")).toBe(true);
});

test("a last entry time is named", () => {
  const b = structuredClone(bundle);
  for (const h of b.hours) {
    if (h.spot_id === SPOT.carrels && !h.is_exam) {
      h.closes = "24:00";
      h.last_entry = "23:30";
    }
  }
  const w = weekHours(b, spotOf(SPOT.carrels), TUE_2PM);
  expect(w.days[0]?.text).toBe("8:00 AM to 12:00 AM, last entry 11:30 PM");
});

test("checked view lists groups in order and the newest date", () => {
  expect(checkedView(spotOf(SPOT.carrels), NY)).toEqual({
    latest: "Checked Oct 6",
    groups: [
      { group: "identity", name: "Name and place", date: "Oct 5" },
      { group: "hours", name: "Hours", date: "Oct 6" },
    ],
  });
});

test("time of day text", () => {
  expect(timeOfDayText("00:00")).toBe("12:00 AM");
  expect(timeOfDayText("12:30")).toBe("12:30 PM");
  expect(timeOfDayText("24:00")).toBe("12:00 AM");
  expect(timeOfDayText("07:05")).toBe("7:05 AM");
  expect(timeOfDayText("02:00")).toBe("2:00 AM");
  expect(dayShortName(0)).toBe("Sun");
  expect(dayShortName(6)).toBe("Sat");
});
