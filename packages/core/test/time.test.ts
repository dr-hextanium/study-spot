import { expect, test } from "bun:test";
import { campusDate } from "../src/index.ts";

const NY = "America/New_York";

test("campus date uses campus time zone, not UTC", () => {
  // 03:30 UTC on Nov 1 is 23:30 on Oct 31 in New York (EDT, UTC-4)
  expect(campusDate(new Date("2026-11-01T03:30:00Z"), NY)).toBe("2026-10-31");
  expect(campusDate(new Date("2026-10-13T18:00:00Z"), NY)).toBe("2026-10-13");
});

test("campus date across the DST change", () => {
  // DST ends 2026-11-01 at 06:00 UTC. 05:30 UTC is 01:30 EDT, 06:30 UTC is 01:30 EST.
  expect(campusDate(new Date("2026-11-01T05:30:00Z"), NY)).toBe("2026-11-01");
  expect(campusDate(new Date("2026-11-01T06:30:00Z"), NY)).toBe("2026-11-01");
});
