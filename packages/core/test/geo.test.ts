import { expect, test } from "bun:test";
import { fallbackWalkMinutes, haversineMeters } from "../src/index.ts";

test("haversine distance is roughly right", () => {
  // 0.001 degrees of latitude is about 111 meters
  const d = haversineMeters({ lat: 40.9, lng: -73.12 }, { lat: 40.901, lng: -73.12 });
  expect(d).toBeGreaterThan(110);
  expect(d).toBeLessThan(112);
});

test("fallback walk minutes: meters * 1.3 at 1.3 m/s, rounded up", () => {
  const a = { lat: 40.9, lng: -73.12 };
  const b = { lat: 40.901, lng: -73.12 };
  // about 111 m * 1.3 / 1.3 m/s = 111 s, rounds up to 2 minutes
  expect(fallbackWalkMinutes(a, b)).toBe(2);
  expect(fallbackWalkMinutes(a, a)).toBe(0);
});
