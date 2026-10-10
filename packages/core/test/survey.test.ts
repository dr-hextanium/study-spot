import { expect, test } from "bun:test";
import {
  AcceptInviteRequest,
  HoursSection,
  IdentitySection,
  Incomplete,
  missingV0Fields,
  SECTION_SCHEMAS,
  SectionWrite,
  SURVEY_SECTION,
  SurveySpot,
  V0_FIELD,
  V0_FIELD_SECTION,
  VerifyRequest,
  v0InputOf,
} from "../src/index.ts";
import { surveySpotFixture } from "./fixtures/survey-spot.ts";

const complete = {
  floor: "3",
  directions: "Floor 3.",
  eligibility: "all_students",
  seat_count: 10,
  outlet_coverage_pct: 0.5,
  noise_policy: "quiet",
  group_work_ok: false,
  food_policy: "none",
  has_verification: true,
} as const;

test("a complete spot is missing nothing", () => {
  expect(missingV0Fields(complete)).toEqual([]);
});

test("missing fields are reported in V0_FIELD order", () => {
  const nothing = {
    floor: " ",
    directions: null,
    eligibility: null,
    seat_count: null,
    outlet_coverage_pct: null,
    noise_policy: null,
    group_work_ok: null,
    food_policy: null,
    has_verification: false,
  };
  expect(missingV0Fields(nothing)).toEqual([...V0_FIELD]);
  expect(missingV0Fields({ ...complete, seat_count: null, has_verification: false })).toEqual([
    "seat_count",
    "last_verified",
  ]);
});

test("a blank floor is missing, so a bootstrap draft cannot publish before identity is saved", () => {
  expect(missingV0Fields({ ...complete, floor: "" })).toEqual(["floor"]);
});

test("false and zero are present values, not missing", () => {
  expect(missingV0Fields({ ...complete, group_work_ok: false, outlet_coverage_pct: 0 })).toEqual(
    [],
  );
});

test("the API spot fixture parses and v0InputOf agrees with its missing list", () => {
  const spot = SurveySpot.parse(surveySpotFixture());
  expect(missingV0Fields(v0InputOf(spot))).toEqual(spot.missing);
  const bare = surveySpotFixture({ directions: null, verified: {}, missing: [] });
  expect(missingV0Fields(v0InputOf(bare))).toEqual(["directions", "last_verified"]);
});

test("every v0 field maps to the section that fills it", () => {
  expect(Object.keys(V0_FIELD_SECTION)).toEqual([...V0_FIELD]);
  for (const section of Object.values(V0_FIELD_SECTION)) {
    if (section !== null) expect(SURVEY_SECTION).toContain(section);
  }
});

test("every survey section has a payload schema", () => {
  expect(Object.keys(SECTION_SCHEMAS).sort()).toEqual([...SURVEY_SECTION].sort());
});

test("SectionWrite checks data against the named section", () => {
  const ok = SectionWrite.safeParse({
    section: "power",
    data: { outlet_coverage_pct: 0.4, usb_outlets: null, wifi_mbps: null, cell_signal: "good" },
  });
  expect(ok.success).toBe(true);
  const wrong = SectionWrite.safeParse({ section: "seating", data: { outlet_coverage_pct: 0.4 } });
  expect(wrong.success).toBe(false);
  const unknown = SectionWrite.safeParse({ section: "photos", data: {} });
  expect(unknown.success).toBe(false);
});

test("hours allow past-midnight closes and reject 24:00 opens and duplicates", () => {
  const row = { day_of_week: 0, opens: "08:00", closes: "02:00", last_entry: null, is_exam: false };
  expect(HoursSection.safeParse({ term_id: "2026-fall", rows: [row] }).success).toBe(true);
  expect(
    HoursSection.safeParse({ term_id: "2026-fall", rows: [{ ...row, opens: "24:00" }] }).success,
  ).toBe(false);
  expect(HoursSection.safeParse({ term_id: "2026-fall", rows: [row, row] }).success).toBe(false);
  const examRow = { ...row, is_exam: true };
  expect(HoursSection.safeParse({ term_id: "2026-fall", rows: [row, examRow] }).success).toBe(true);
  expect(HoursSection.safeParse({ term_id: "2026-fall", rows: [] }).success).toBe(true);
});

test("identity requires a clean slug and trims names", () => {
  const identity = {
    slug: "sac-lounge",
    official_name: "  SAC Lounge ",
    common_name: null,
    building_id: "sac",
    floor: "2",
    lat: 40.9,
    lng: -73.1,
    directions: null,
    outdoor: false,
    seasonal: false,
  };
  expect(IdentitySection.parse(identity).official_name).toBe("SAC Lounge");
  expect(IdentitySection.safeParse({ ...identity, slug: "SAC Lounge" }).success).toBe(false);
  expect(IdentitySection.safeParse({ ...identity, slug: "sac--lounge" }).success).toBe(false);
});

test("verify needs distinct groups and accept needs a 43-char token", () => {
  const id = "0b7e7f8e-3f3a-4c55-8d5e-1e2f3a4b5c6d";
  expect(
    VerifyRequest.safeParse({ client_write_id: id, base_version: 1, groups: ["hours"] }).success,
  ).toBe(true);
  expect(
    VerifyRequest.safeParse({ client_write_id: id, base_version: 1, groups: ["hours", "hours"] })
      .success,
  ).toBe(false);
  expect(
    VerifyRequest.safeParse({ client_write_id: id, base_version: 1, groups: [] }).success,
  ).toBe(false);
  expect(AcceptInviteRequest.safeParse({ token: "a".repeat(43) }).success).toBe(true);
  expect(AcceptInviteRequest.safeParse({ token: "a".repeat(42) }).success).toBe(false);
  expect(AcceptInviteRequest.safeParse({ token: `${"a".repeat(42)}=` }).success).toBe(false);
});

test("an incomplete body lists at least one missing field", () => {
  expect(Incomplete.safeParse({ error: "incomplete", missing: [] }).success).toBe(false);
  expect(Incomplete.safeParse({ error: "incomplete", missing: ["directions"] }).success).toBe(true);
});
