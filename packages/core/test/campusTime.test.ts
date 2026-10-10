import { expect, test } from "bun:test";
import {
  addDays,
  campusParts,
  clockSkewMs,
  correctedNow,
  isExamDate,
  weekdayOfDate,
  zonedInstant,
} from "../src/index.ts";
import { mulberry32 } from "./prng.ts";

const NY = "America/New_York";
const iso = (d: Date): string => d.toISOString();

test("campus parts give both day-of-week conventions", () => {
  // Tue 2026-10-13 14:00 EDT
  expect(campusParts(new Date("2026-10-13T18:00:00Z"), NY)).toEqual({
    date: "2026-10-13",
    hour: 14,
    minute: 0,
    hoursDow: 2,
    slotDow: 1,
  });
  // 23:30 Sat Oct 31 in New York, already Nov 1 in UTC
  expect(campusParts(new Date("2026-11-01T03:30:00Z"), NY)).toEqual({
    date: "2026-10-31",
    hour: 23,
    minute: 30,
    hoursDow: 6,
    slotDow: 5,
  });
  // Midnight reads as hour 0, never 24
  expect(campusParts(new Date("2026-10-14T04:00:00Z"), NY).hour).toBe(0);
});

test("weekday and addDays are pure calendar math", () => {
  expect(weekdayOfDate("2026-10-13")).toBe(2);
  expect(weekdayOfDate("2026-11-01")).toBe(0);
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
});

test("zoned instants on ordinary days, end of day included", () => {
  expect(iso(zonedInstant("2026-10-13", 14 * 60, NY))).toBe("2026-10-13T18:00:00.000Z");
  expect(iso(zonedInstant("2026-10-13", 1440, NY))).toBe("2026-10-14T04:00:00.000Z");
});

test("fall back 2026-11-01: ambiguous 01:30 is the earlier instant, 02:00 is EST", () => {
  expect(iso(zonedInstant("2026-11-01", 90, NY))).toBe("2026-11-01T05:30:00.000Z");
  expect(iso(zonedInstant("2026-11-01", 120, NY))).toBe("2026-11-01T07:00:00.000Z");
});

test("spring forward 2027-03-14: nonexistent times move forward by the gap", () => {
  expect(iso(zonedInstant("2027-03-14", 120, NY))).toBe("2027-03-14T07:00:00.000Z");
  expect(iso(zonedInstant("2027-03-14", 150, NY))).toBe("2027-03-14T07:30:00.000Z");
  expect(iso(zonedInstant("2027-03-14", 180, NY))).toBe("2027-03-14T07:00:00.000Z");
});

test("zonedInstant inverts campusParts (property, 2000 instants over two years)", () => {
  const rand = mulberry32(7);
  const start = Date.parse("2026-08-01T00:00:00Z");
  const span = 2 * 365 * 86_400_000;
  for (let i = 0; i < 2000; i += 1) {
    const t = Math.floor((start + rand() * span) / 60_000) * 60_000;
    const p = campusParts(new Date(t), NY);
    const back = zonedInstant(p.date, p.hour * 60 + p.minute, NY).getTime();
    // Equal, or the earlier twin inside the repeated fall-back hour.
    expect(back === t || back === t - 3_600_000).toBe(true);
    const q = campusParts(new Date(back), NY);
    expect([q.date, q.hour, q.minute]).toEqual([p.date, p.hour, p.minute]);
  }
});

test("exam dates are inclusive and need both ends", () => {
  const term = {
    id: "f",
    name: "F",
    starts: "2026-08-24",
    ends: "2026-12-19",
    exam_starts: "2026-12-10",
    exam_ends: "2026-12-18",
  };
  expect(isExamDate("2026-12-10", term)).toBe(true);
  expect(isExamDate("2026-12-18", term)).toBe(true);
  expect(isExamDate("2026-12-19", term)).toBe(false);
  expect(isExamDate("2026-12-12", { ...term, exam_ends: null })).toBe(false);
});

test("clock skew is used only past 5 minutes and only from a real header", () => {
  const device = new Date("2026-10-13T18:00:00Z");
  expect(clockSkewMs(device, null)).toBe(0);
  expect(clockSkewMs(device, "not a date")).toBe(0);
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 18:04:59 GMT")).toBe(0);
  // Exactly 5:00 is still within tolerance, in both directions
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 18:05:00 GMT")).toBe(0);
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 17:55:00 GMT")).toBe(0);
  // One second past it is used
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 18:05:01 GMT")).toBe(301_000);
  // Negative skew: the device clock runs ahead of the server
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 17:54:59 GMT")).toBe(-301_000);
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 15:00:00 GMT")).toBe(-3 * 3_600_000);
  expect(clockSkewMs(device, "Tue, 13 Oct 2026 21:00:00 GMT")).toBe(3 * 3_600_000);
  expect(iso(correctedNow(device, -7_200_000))).toBe("2026-10-13T16:00:00.000Z");
});
