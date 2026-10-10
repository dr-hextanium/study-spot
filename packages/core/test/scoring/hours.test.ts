import { expect, test } from "bun:test";
import { openSpan } from "../../src/index.ts";
import { hoursOf, makeScoringBundle, SPOT } from "../fixtures/scoring-bundle.ts";

const b = makeScoringBundle();
const NY = b.campus.tz;
const at = (s: string) => new Date(s);
const span = (id: string, s: string) => openSpan(hoursOf(b, id), b.term, at(s), NY);
const closes = (id: string, s: string): string => {
  const r = span(id, s);
  if (!r.open) throw new Error(`closed at ${s}`);
  return r.closesAt.toISOString();
};

test("open in the middle of the day", () => {
  // Tue 14:00 EDT; carrels close Wed 02:00 EDT
  expect(closes(SPOT.carrels, "2026-10-13T18:00:00Z")).toBe("2026-10-14T06:00:00.000Z");
});

test("past midnight: 01:30 Wed still uses Tuesday's 08:00 to 02:00 row", () => {
  expect(closes(SPOT.carrels, "2026-10-14T05:30:00Z")).toBe("2026-10-14T06:00:00.000Z");
  expect(span(SPOT.carrels, "2026-10-14T06:00:00Z").open).toBe(false);
  expect(span(SPOT.carrels, "2026-10-14T11:59:00Z").open).toBe(false); // 07:59
  expect(span(SPOT.carrels, "2026-10-14T12:00:00Z").open).toBe(true); // 08:00
});

test("24-hour days chain across midnight", () => {
  // Tue 23:30 at the reading room runs through the next 24h rows (3 days ahead max)
  const r = span(SPOT.reading, "2026-10-14T03:30:00Z");
  expect(r.open).toBe(true);
  if (r.open) expect(r.closesAt.getTime()).toBeGreaterThan(Date.parse("2026-10-15T04:00:00Z"));
});

test("08:00 to 24:00 closes at midnight, not later", () => {
  expect(closes(SPOT.union, "2026-10-14T03:40:00Z")).toBe("2026-10-14T04:00:00.000Z");
});

test("DST fall back: 00:30 EDT to 02:00 EST is 150 real minutes", () => {
  const r = span(SPOT.carrels, "2026-11-01T04:30:00Z");
  expect(r.open).toBe(true);
  if (r.open) {
    expect((r.closesAt.getTime() - Date.parse("2026-11-01T04:30:00Z")) / 60_000).toBe(150);
  }
});

test("DST spring forward: 02:00 does not exist, close moves to 03:00 EDT", () => {
  expect(closes(SPOT.carrels, "2027-03-14T06:30:00Z")).toBe("2027-03-14T07:00:00.000Z");
});

test("exam window uses exam rows; outside it the regular rows", () => {
  // Mon 2026-12-14 03:00 EST: exam rows are 24h
  expect(span(SPOT.carrels, "2026-12-14T08:00:00Z").open).toBe(true);
  // Tue 2026-12-01 03:00 EST: regular rows closed at 02:00
  expect(span(SPOT.carrels, "2026-12-01T08:00:00Z").open).toBe(false);
  // A spot without exam rows keeps its regular hours in the exam window
  expect(span(SPOT.union, "2026-12-14T15:00:00Z").open).toBe(true);
});

test("last entry closes the door before closing time", () => {
  const rows = hoursOf(b, SPOT.union).map((h) => ({ ...h, last_entry: "23:00" }));
  expect(openSpan(rows, b.term, at("2026-10-14T02:59:00Z"), NY).open).toBe(true); // 22:59
  expect(openSpan(rows, b.term, at("2026-10-14T03:01:00Z"), NY).open).toBe(false); // 23:01
});

test("exam day with no exam row for that weekday falls back to its regular hours", () => {
  // Exam rows only for Thursday 2026-12-10; Friday 2026-12-11 is in the exam window too.
  const rows = hoursOf(b, SPOT.union).map((h) => ({ ...h }));
  const examThursday = {
    spot_id: SPOT.union,
    day_of_week: 4,
    opens: "00:00",
    closes: "24:00",
    last_entry: null,
    is_exam: true,
  };
  const mixed = [...rows, examThursday];
  // Thu 03:00 EST: the exam row is 24h, so open (regular 08:00 would be closed)
  expect(openSpan(mixed, b.term, at("2026-12-10T08:00:00Z"), NY).open).toBe(true);
  // Fri 10:00 EST: no Friday exam row, so regular 08:00 to 24:00 applies, not closed
  expect(openSpan(mixed, b.term, at("2026-12-11T15:00:00Z"), NY).open).toBe(true);
  // Fri 03:00 EST: regular hours are not open yet
  expect(openSpan(mixed, b.term, at("2026-12-11T08:00:00Z"), NY).open).toBe(false);
});

test("no rows means closed", () => {
  expect(span(SPOT.hoursTbd, "2026-10-13T18:00:00Z").open).toBe(false);
});

test("hours count days from Sunday: a Sunday-only row is open Sunday, not Monday", () => {
  const sundayOnly = hoursOf(b, SPOT.union).filter((h) => h.day_of_week === 0);
  // Sun 2026-10-18 14:00 EDT and Mon 2026-10-19 14:00 EDT
  expect(openSpan(sundayOnly, b.term, at("2026-10-18T18:00:00Z"), NY).open).toBe(true);
  expect(openSpan(sundayOnly, b.term, at("2026-10-19T18:00:00Z"), NY).open).toBe(false);
});
