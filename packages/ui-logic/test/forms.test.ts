import { expect, test } from "bun:test";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import { conflictDiff, draftOf, initForm, setField, submitForm } from "../src/index.ts";
import { POWER, SPOT_A, section } from "./builders.ts";

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
