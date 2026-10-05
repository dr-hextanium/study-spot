import { expect, test } from "bun:test";
import { BundleSpot } from "@study-spot/core";
import type { SpotRow, VerificationRow } from "../src/bundle/spot.ts";
import { toBundleSpot } from "../src/bundle/spot.ts";

const base: SpotRow = {
  id: "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
  slug: "crr",
  building_id: "lib",
  floor: "3",
  official_name: "Central Reading Room",
  common_name: null,
  lat: 40.9,
  lng: -73.12,
  directions: "Floor 3.",
  status: "published",
  review_state: "unreviewed",
  reviewed_by: null,
  version: 1,
  last_edited_by: null,
  eligibility: "all_students",
  eligibility_scope: null,
  eligibility_verified: true,
  entry_method: null,
  reservable: false,
  reservation_system: null,
  reservation_url: null,
  seat_count: 100,
  effective_capacity: null,
  max_group_size: null,
  spread_out_room: null,
  outlet_coverage_pct: 0.5,
  usb_outlets: null,
  wifi_mbps: null,
  cell_signal: null,
  noise_policy: "silent",
  natural_light: null,
  lighting: null,
  temperature: null,
  temperature_consistent: null,
  windows_view: null,
  calls_ok: null,
  group_work_ok: false,
  whiteboard: null,
  food_policy: "none",
  step_free: null,
  elevator: null,
  accessible_seating: null,
  open_past_midnight: null,
  staffed_late: null,
  lit_route_to_residences: null,
  outdoor: false,
  seasonal: false,
  created_at: new Date("2026-10-01T00:00:00Z"),
  updated_at: new Date("2026-10-01T00:00:00Z"),
};

const identity: VerificationRow = {
  spot_id: base.id,
  attribute_group: "identity",
  last_verified_at: new Date("2026-10-01T15:00:00Z"),
  source: "survey",
  confidence: "estimated",
};

const empty = {
  seatTypes: [],
  tableConfigs: [],
  amenities: [],
  verifications: [identity],
  approvedPhotos: [],
  hoursUnconfirmed: false,
};

test("complete spot maps to a valid bundle spot", () => {
  const r = toBundleSpot({ row: base, ...empty });
  expect(r.ok).toBe(true);
  if (r.ok) expect(BundleSpot.safeParse(r.spot).success).toBe(true);
});

test("missing v0-required fields are reported, not thrown", () => {
  const r = toBundleSpot({
    row: { ...base, directions: null, seat_count: null, food_policy: null },
    ...empty,
  });
  expect(r).toEqual({ ok: false, missing: ["directions", "seat_count", "food_policy"] });
});

test("a spot with no verification rows is missing last_verified", () => {
  const r = toBundleSpot({ row: { ...base, directions: null }, ...empty, verifications: [] });
  expect(r).toEqual({ ok: false, missing: ["directions", "last_verified"] });
});

test("verification dates and photos are included, cover first", () => {
  const at = new Date("2026-10-05T15:00:00Z");
  const r = toBundleSpot({
    row: base,
    ...empty,
    verifications: [
      {
        spot_id: base.id,
        attribute_group: "hours",
        last_verified_at: at,
        source: "official",
        confidence: "measured",
      },
    ],
    approvedPhotos: [
      {
        id: "p1",
        spot_id: base.id,
        url: "https://example.org/a.jpg",
        blob_sha256: null,
        taken_at: at,
        is_cover: false,
        uploaded_by: null,
        approved_by: "s",
        approved_at: at,
      },
      {
        id: "p2",
        spot_id: base.id,
        url: "https://example.org/cover.jpg",
        blob_sha256: null,
        taken_at: at,
        is_cover: true,
        uploaded_by: null,
        approved_by: "s",
        approved_at: at,
      },
    ],
  });
  if (!r.ok) throw new Error("expected ok");
  expect(r.spot.verified).toEqual({ hours: "2026-10-05T15:00:00.000Z" });
  expect(r.spot.photos.map((p) => p.url)).toEqual([
    "https://example.org/cover.jpg",
    "https://example.org/a.jpg",
  ]);
  expect(r.spot.photos[0]?.is_cover).toBe(true);
});

test("a missing noise policy blocks the spot", () => {
  const r = toBundleSpot({ row: { ...base, noise_policy: null }, ...empty });
  expect(r).toEqual({ ok: false, missing: ["noise_policy"] });
});

test("an approved photo without a url yet is left out", () => {
  const at = new Date("2026-10-05T15:00:00Z");
  const r = toBundleSpot({
    row: base,
    ...empty,
    approvedPhotos: [
      {
        id: "p1",
        spot_id: base.id,
        url: null,
        blob_sha256: "ab".repeat(32),
        taken_at: at,
        is_cover: true,
        uploaded_by: null,
        approved_by: "s",
        approved_at: at,
      },
    ],
  });
  if (!r.ok) throw new Error("expected ok");
  expect(r.spot.photos).toEqual([]);
});
