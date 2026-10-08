import type { SectionStatus } from "@study-spot/ui-logic";
import { buildSpotView, type OverviewSection, t } from "@study-spot/ui-logic";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { sectionEnd, sectionFact } from "../src/lib/facts.tsx";

const TERM = { id: "fall-2026", name: "Fall 2026" };

function viewOf(over: Parameters<typeof surveySpotFixture>[0]) {
  const spot = surveySpotFixture(over);
  const view = buildSpotView(spot, [], spot.id, TERM);
  if (view === null) throw new Error("no view");
  return view;
}

test("section facts come from the editors' own labels", () => {
  const v = viewOf({
    floor: "2",
    eligibility: "all_students",
    seat_count: 112,
    outlet_coverage_pct: 0.4,
    noise_policy: "quiet",
    food_policy: "covered_drinks",
    hours: [],
    estimates: [],
    photos: [],
  });
  expect(sectionFact(v, "identity", TERM)).toBe("Floor 2");
  expect(sectionFact(v, "access", TERM)).toBe("Any student");
  expect(sectionFact(v, "seating", TERM)).toBe("112 seats");
  expect(sectionFact(v, "power", TERM)).toBe("40% near outlets");
  expect(sectionFact(v, "environment", TERM)).toBe("Quiet");
  expect(sectionFact(v, "use_fit", TERM)).toBe("Covered drinks");
  expect(sectionFact(v, "late_night", TERM)).toBeNull();
  expect(sectionFact(v, "hours", TERM)).toBeNull();
  expect(sectionFact(v, "estimates", TERM)).toBeNull();
  expect(sectionFact(v, "photos", TERM)).toBeNull();
});

test("hours, busyness and photos say what is there", () => {
  const v = viewOf({
    hours: [{ day_of_week: 1, opens: "08:00", closes: "22:00", last_entry: null, is_exam: false }],
    estimates: [
      {
        day_type: "weekday",
        block: "morning",
        bucket: "some",
        created_at: "2026-10-01T12:00:00.000Z",
      },
    ],
  });
  expect(sectionFact(v, "hours", TERM)).toBe("Fall 2026 hours");
  expect(sectionFact(v, "hours", null)).toBeNull();
  expect(sectionFact(v, "estimates", TERM)).toBe("1 of 8 blocks");
});

function status(over: Partial<SectionStatus>): SectionStatus {
  const section: OverviewSection = "seating";
  return {
    section,
    group: "required",
    fill: "done",
    verifiedAt: null,
    checkedToday: false,
    sync: "synced",
    ...over,
  };
}

test("the row end: sync trouble beats missing, missing beats the fact", () => {
  const cases: [Partial<SectionStatus>, string | null, string][] = [
    [{ sync: "conflict", fill: "missing" }, "40", t("spot.section.conflict")],
    [{ sync: "failed", fill: "done" }, "40", t("spot.section.failed")],
    [{ sync: "syncing" }, "40", t("spot.section.syncing")],
    [{ sync: "saved_on_phone" }, "40", t("spot.section.on_phone")],
    [{ fill: "missing" }, null, t("spot.section.missing")],
    [{ fill: "partial" }, "40", t("spot.section.partial")],
    [{ fill: "done" }, "40", "40"],
    [{ fill: "done" }, null, t("spot.section.done")],
  ];
  for (const [over, fact, text] of cases) {
    const { unmount } = render(sectionEnd(status(over), fact));
    expect(screen.getByText(text)).toBeTruthy();
    unmount();
  }
});
