import { expect, test } from "bun:test";
import type { SectionWrite } from "@perch/core";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import { conflictDiff, draftOf, initForm, setField, submitForm } from "../src/index.ts";
import { POWER, rec, SPOT_A, section } from "./builders.ts";

const spot = surveySpotFixture({ id: SPOT_A });

test("drafts come from the spot, and hours use the spot's term", () => {
  expect(draftOf("power", spot)).toEqual({
    outlet_coverage_pct: 0.6,
    usb_outlets: null,
    wifi_mbps: null,
    cell_signal: null,
  });
  expect(draftOf("hours", spot)).toEqual({ term_id: "2026-fall", rows: spot.hours });
  expect(draftOf("hours", { ...spot, term: null }).term_id).toBeNull();
});

test("editing marks the form dirty, and putting the value back clears it", () => {
  const form = initForm("seating", spot);
  const edited = setField(form, "seat_count", 80);
  expect(edited.dirty).toBe(true);
  expect(setField(edited, "seat_count", 120).dirty).toBe(false);
});

test("submit validates with the shared schema and puts errors on fields", () => {
  const empty = setField(initForm("seating", spot), "seat_count", null);
  const failed = submitForm(empty);
  expect(failed.ok).toBe(false);
  if (failed.ok) return;
  expect(Object.keys(failed.form.errors)).toEqual(["seat_count"]);
  const fixed = setField(failed.form, "seat_count", 12);
  expect(fixed.errors).toEqual({});
  const ok = submitForm(fixed);
  expect(ok.ok && ok.write.section).toBe("seating");
});

test("the conflict view lists only fields that differ", () => {
  const current = surveySpotFixture({ id: SPOT_A, version: 4, outlet_coverage_pct: 0.2 });
  const conflicted = section(SPOT_A, POWER, { state: "conflict", current });
  expect(conflictDiff(conflicted)).toEqual([
    { field: "outlet_coverage_pct", yours: 0.5, theirs: 0.2 },
    { field: "cell_signal", yours: "good", theirs: null },
  ]);
  expect(conflictDiff(section(SPOT_A, POWER))).toEqual([]);
});

const ROW = { day_of_week: 1, opens: "08:00", closes: "22:00", last_entry: null, is_exam: false };
const ROW2 = { day_of_week: 2, opens: "09:00", closes: "22:00", last_entry: null, is_exam: false };

test("hours reject opens 24:00 and a missing term, with errors on the right fields", () => {
  const form = setField(initForm("hours", { ...spot, term: null }), "rows", [
    { ...ROW, opens: "24:00" },
  ]);
  const failed = submitForm(form);
  expect(failed.ok).toBe(false);
  if (failed.ok) return;
  expect(Object.keys(failed.form.errors).sort()).toEqual(["rows", "term_id"]);
  const cleared = setField(failed.form, "term_id", "2026-fall");
  expect(Object.keys(cleared.errors)).toEqual(["rows"]);
});

test("several field errors land on their own fields", () => {
  let form = initForm("seating", spot);
  form = setField(form, "seat_count", null);
  form = setField(form, "seat_types", [
    { type: "table_chair", count: 1 },
    { type: "table_chair", count: 2 },
  ]);
  const failed = submitForm(form);
  expect(failed.ok).toBe(false);
  if (failed.ok) return;
  expect(Object.keys(failed.form.errors).sort()).toEqual(["seat_count", "seat_types"]);
});

test("the same rows in a different order are no conflict", () => {
  const mine: SectionWrite = {
    section: "hours",
    data: { term_id: "2026-fall", rows: [ROW, ROW2] },
  };
  const current = surveySpotFixture({ id: SPOT_A, hours: [ROW2, ROW] });
  expect(conflictDiff(section(SPOT_A, mine, { state: "conflict", current }))).toEqual([]);

  const seating: SectionWrite = {
    section: "seating",
    data: {
      seat_count: 120,
      seat_types: [
        { type: "table_chair", count: 100 },
        { type: "soft", count: 20 },
      ],
      table_configs: ["large_shared", "individual"],
      effective_capacity: null,
      max_group_size: 1,
      spread_out_room: true,
    },
  };
  const same = surveySpotFixture({
    id: SPOT_A,
    seat_types: [
      { count: 20, type: "soft" },
      { count: 100, type: "table_chair" },
    ],
    table_configs: ["individual", "large_shared"],
  });
  expect(conflictDiff(section(SPOT_A, seating, { state: "conflict", current: same }))).toEqual([]);
});

test("a nested value that really differs is one diff on that field", () => {
  const mine: SectionWrite = {
    section: "hours",
    data: { term_id: "2026-fall", rows: [ROW, ROW2] },
  };
  const current = surveySpotFixture({ id: SPOT_A, hours: [ROW2, { ...ROW, closes: "23:00" }] });
  const diff = conflictDiff(section(SPOT_A, mine, { state: "conflict", current }));
  expect(diff.map((d) => d.field)).toEqual(["rows"]);
});

test("restoring an array in a different order clears dirty", () => {
  const two = surveySpotFixture({
    id: SPOT_A,
    seat_types: [
      { type: "table_chair", count: 100 },
      { type: "soft", count: 20 },
    ],
  });
  const form = initForm("seating", two);
  const edited = setField(form, "seat_types", []);
  expect(edited.dirty).toBe(true);
  const back = setField(edited, "seat_types", [
    { count: 20, type: "soft" },
    { count: 100, type: "table_chair" },
  ]);
  expect(back.dirty).toBe(false);
});

test("verify and review conflicts have no field rows", () => {
  const current = surveySpotFixture({ id: SPOT_A, version: 4 });
  expect(
    conflictDiff(
      rec(
        { kind: "spot.verify", spot_id: SPOT_A, payload: { groups: ["power"] } },
        { state: "conflict", current },
      ),
    ),
  ).toEqual([]);
  expect(
    conflictDiff(
      rec({ kind: "spot.review", spot_id: SPOT_A, payload: {} }, { state: "conflict", current }),
    ),
  ).toEqual([]);
});
