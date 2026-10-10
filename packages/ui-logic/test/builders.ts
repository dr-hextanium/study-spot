import type { IdentitySection, SectionWrite } from "@perch/core";
import { type NewWrite, WriteRecord } from "../src/index.ts";
import { sequentialIds } from "./fakes.ts";

export const SPOT_A = "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11";
export const SPOT_B = "8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a12";
export const LOCAL = "local:00000000-0000-4000-a000-000000000001";

type Sw<S extends SectionWrite["section"]> = Extract<SectionWrite, { section: S }>;

export const POWER: Sw<"power"> = {
  section: "power",
  data: { outlet_coverage_pct: 0.5, usb_outlets: null, wifi_mbps: null, cell_signal: "good" },
};
export const SEATING: Sw<"seating"> = {
  section: "seating",
  data: {
    seat_count: 40,
    seat_types: [],
    table_configs: [],
    effective_capacity: null,
    max_group_size: 4,
    spread_out_room: null,
  },
};

export function identity(overrides: Partial<IdentitySection> = {}): IdentitySection {
  return {
    slug: "sac-lounge",
    official_name: "SAC Lounge",
    common_name: null,
    building_id: "sac",
    floor: "2",
    lat: 40.9,
    lng: -73.1,
    directions: "Main doors, then left.",
    outdoor: false,
    seasonal: false,
    ...overrides,
  };
}

const ids = sequentialIds("9000");
let seq = 0;

type Extra = Partial<
  Pick<
    WriteRecord,
    "client_write_id" | "seq" | "state" | "attempts" | "base_version" | "error" | "current"
  >
>;

/** A valid record with increasing seq; `extra` overrides the bookkeeping. */
export function rec(write: NewWrite, extra: Extra = {}): WriteRecord {
  seq += 1;
  return WriteRecord.parse({
    client_write_id: ids.uuid(),
    seq,
    created_at: "2026-10-05T15:00:00.000Z",
    attempts: 0,
    state: "pending",
    error: null,
    current: null,
    base_version: null,
    ...write,
    ...extra,
  });
}

export const section = (spot_id: string, payload: SectionWrite, extra: Extra = {}) =>
  rec({ kind: "spot.section", spot_id, payload }, extra);
export const photo = (spot_id: string, extra: Extra = {}) =>
  rec(
    {
      kind: "photo.upload",
      spot_id,
      payload: { taken_at: "2026-10-05T15:00:00.000Z", byte_size: 3 },
    },
    extra,
  );
export const create = (spot_id: string, extra: Extra = {}) =>
  rec({ kind: "spot.create", spot_id, payload: { identity: identity() } }, extra);
