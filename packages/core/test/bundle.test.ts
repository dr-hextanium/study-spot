import { expect, test } from "bun:test";
import { BundlePointer, parseBundle, TimeOfDay } from "../src/index.ts";
import { FIXTURE_SPOT_ID, makeBundleFixture } from "./fixtures/bundle-v1.ts";

test("schema version 1 fixture parses", () => {
  const result = parseBundle(makeBundleFixture());
  expect(result.ok).toBe(true);
});

test("hours past midnight and 24:00 are valid times", () => {
  expect(TimeOfDay.safeParse("02:00").success).toBe(true);
  expect(TimeOfDay.safeParse("24:00").success).toBe(true);
  expect(TimeOfDay.safeParse("23:59").success).toBe(true);
  expect(TimeOfDay.safeParse("24:30").success).toBe(false);
  expect(TimeOfDay.safeParse("8:00").success).toBe(false);
});

test("a different major version is a schema mismatch, not invalid", () => {
  const b = makeBundleFixture();
  b.schema_version = 2;
  const result = parseBundle(b);
  expect(result).toEqual({ ok: false, reason: "schema_mismatch", detail: "expected 1, got 2" });
});

test("non-object input is invalid", () => {
  expect(parseBundle(null).ok).toBe(false);
  expect(parseBundle("x").ok).toBe(false);
  const r = parseBundle({});
  expect(r.ok === false && r.reason).toBe("invalid");
});

test("forecast arrays must have 168 slots", () => {
  const b = makeBundleFixture();
  const busy = b.busyness as Record<string, { regular: number[] }>;
  const entry = busy[FIXTURE_SPOT_ID];
  if (!entry) throw new Error("fixture missing busyness");
  entry.regular = entry.regular.slice(0, 167);
  expect(parseBundle(b).ok).toBe(false);
});

test("walk matrix must be square and match buildings", () => {
  const b = makeBundleFixture();
  b.walk = { building_ids: ["melville-library", "sac"], minutes: [[0, 4]], estimated_pairs: [] };
  expect(parseBundle(b).ok).toBe(false);
});

test("every spot needs busyness and a known building", () => {
  const b = makeBundleFixture();
  b.busyness = {};
  expect(parseBundle(b).ok).toBe(false);

  const c = makeBundleFixture();
  const spots = c.spots as Array<Record<string, unknown>>;
  const first = spots[0];
  if (!first) throw new Error("fixture missing spot");
  first.building_id = "nowhere";
  expect(parseBundle(c).ok).toBe(false);
});

test("hours must reference a spot in the bundle", () => {
  const b = makeBundleFixture();
  b.hours = [
    {
      spot_id: "00000000-0000-4000-8000-000000000000",
      day_of_week: 0,
      opens: "08:00",
      closes: "17:00",
      last_entry: null,
      is_exam: false,
    },
  ];
  expect(parseBundle(b).ok).toBe(false);
});

test("pointer schema", () => {
  expect(
    BundlePointer.safeParse({
      schema_version: 1,
      hash: "a1b2c3d4e5f60718",
      url: "bundle.a1b2c3d4e5f60718.json",
      generated_at: "2026-10-13T18:00:00.000Z",
    }).success,
  ).toBe(true);
});

test("duplicate building ids are rejected", () => {
  const b = makeBundleFixture();
  const buildings = b.buildings as Array<Record<string, unknown>>;
  const first = buildings[0];
  if (!first) throw new Error("fixture missing building");
  buildings.push({ ...first });
  const r = parseBundle(b);
  expect(r.ok).toBe(false);
  expect(r.ok === false && r.detail).toContain("duplicate building id melville-library");
});

test("duplicate spot ids are rejected", () => {
  const b = makeBundleFixture();
  const spots = b.spots as Array<Record<string, unknown>>;
  const first = spots[0];
  if (!first) throw new Error("fixture missing spot");
  spots.push({ ...first, slug: "another-room" });
  const r = parseBundle(b);
  expect(r.ok).toBe(false);
  expect(r.ok === false && r.detail).toContain("duplicate spot id");
});

test("only http(s) urls are allowed for reservations and photos", () => {
  const withSpot = (patch: Record<string, unknown>) => {
    const b = makeBundleFixture();
    const spots = b.spots as Array<Record<string, unknown>>;
    const first = spots[0];
    if (!first) throw new Error("fixture missing spot");
    Object.assign(first, patch);
    return parseBundle(b);
  };
  expect(withSpot({ reservation_url: "https://libcal.example.org/x" }).ok).toBe(true);
  expect(withSpot({ reservation_url: "javascript:alert(1)" }).ok).toBe(false);
  expect(withSpot({ reservation_url: "libcal.example.org/x" }).ok).toBe(false);
  expect(
    withSpot({
      photos: [
        { url: "javascript:alert(1)", taken_at: "2026-10-05T15:00:00.000Z", is_cover: true },
      ],
    }).ok,
  ).toBe(false);
});
