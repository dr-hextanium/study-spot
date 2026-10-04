import { expect, test } from "bun:test";
import type { SpotSummary, SurveyorPublic } from "@study-spot/core";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import {
  buildSpotView,
  type OutboxSnapshot,
  OVERVIEW_ORDER,
  publishReadiness,
  REQUIRED_PARTS,
  reviewAction,
  type SpotView,
  sectionStatuses,
  surveyHome,
  syncHeader,
} from "../src/index.ts";
import {
  create,
  identity,
  LOCAL,
  photo,
  rec,
  SEATING,
  SPOT_A,
  SPOT_B,
  section,
} from "./builders.ts";

const TERM = { id: "2026-fall", name: "Fall 2026" };
const ME: SurveyorPublic = {
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bec",
  display_name: "Me",
  role: "surveyor",
  active: true,
};
const OTHER = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const NY = { now: new Date("2026-10-05T16:00:00Z"), tz: "America/New_York" };

function view(records = [section(SPOT_A, SEATING)], over = {}): SpotView {
  const server = surveySpotFixture({
    id: SPOT_A,
    seat_count: null,
    missing: ["seat_count"],
    ...over,
  });
  const v = buildSpotView(server, records, SPOT_A, TERM);
  if (!v) throw new Error("no view");
  return v;
}

test("queued writes show on top of the server copy and missing is recomputed", () => {
  const v = view();
  expect(v.spot.seat_count).toBe(40);
  expect(v.spot.missing).toEqual([]);
  expect(v.spot.verified.seating).toBe("2026-10-05T15:00:00.000Z");
  const seating = sectionStatuses(v, NY).find((s) => s.section === "seating");
  expect(seating).toMatchObject({ fill: "done", sync: "saved_on_phone", group: "required" });
  expect(publishReadiness(v)).toEqual({ kind: "ready" });
});

test("missingV0Fields parity: with nothing queued the phone agrees with the server", () => {
  for (const s of [
    surveySpotFixture(),
    surveySpotFixture({ directions: null, verified: {}, missing: ["directions", "last_verified"] }),
  ]) {
    expect(buildSpotView(s, [], s.id, TERM)?.spot.missing).toEqual(s.missing);
  }
});

test("a draft made on this phone builds from its create", () => {
  const v = buildSpotView(null, [create(LOCAL)], LOCAL, TERM);
  expect(v?.localOnly).toBe(true);
  expect(v?.serverVersion).toBeNull();
  expect(v?.spot.missing).toEqual([
    "eligibility",
    "seat_count",
    "outlet_coverage_pct",
    "noise_policy",
    "group_work_ok",
    "food_policy",
  ]);
  expect(buildSpotView(null, [], LOCAL, TERM)).toBeNull();
});

test("7 required parts, matching the copy deck", () => {
  expect(REQUIRED_PARTS).toHaveLength(7);
});

test("overview order: needed to publish, photos and busyness, then optional", () => {
  expect(OVERVIEW_ORDER).toEqual([
    "identity",
    "access",
    "seating",
    "power",
    "environment",
    "use_fit",
    "photos",
    "estimates",
    "hours",
    "amenities",
    "accessibility",
    "late_night",
  ]);
});

test("checked today uses the campus date, not UTC", () => {
  const lateEvening = "2026-10-06T03:30:00.000Z";
  const v = view([], { verified: { power: lateEvening } });
  const power = (tz: string) =>
    sectionStatuses(v, { now: NY.now, tz }).find((s) => s.section === "power");
  expect(power("America/New_York")).toMatchObject({ verifiedAt: lateEvening, checkedToday: true });
  expect(power("UTC")?.checkedToday).toBe(false);
});

test("fill states: partial use fit, partial estimates, photos waiting to upload", () => {
  const v = view([photo(SPOT_A)], {
    group_work_ok: null,
    missing: ["group_work_ok"],
    photos: [],
  });
  const fills = Object.fromEntries(sectionStatuses(v, NY).map((s) => [s.section, s.fill]));
  expect(fills).toMatchObject({
    use_fit: "partial",
    seating: "missing",
    estimates: "partial",
    photos: "done",
    hours: "done",
    late_night: "done",
    accessibility: "done",
  });
  expect(v.pendingPhotos).toHaveLength(1);
});

test("publish readiness lists missing fields with their sections", () => {
  expect(publishReadiness(view([]))).toEqual({
    kind: "blocked",
    missing: [{ field: "seat_count", section: "seating" }],
  });
  const queued = view([rec({ kind: "spot.publish", spot_id: SPOT_A, payload: {} })]);
  expect(publishReadiness(queued)).toEqual({ kind: "queued" });
  expect(publishReadiness(view([], { status: "published" }))).toEqual({ kind: "published" });
});

test("review: admins always, never your own edit, nothing once reviewed", () => {
  const byOther = view([], { last_edited_by: OTHER });
  expect(reviewAction(byOther, ME)).toBe("button");
  expect(reviewAction(view([], { last_edited_by: ME.id }), ME)).toBe("own");
  expect(reviewAction(view([section(SPOT_A, SEATING)], { last_edited_by: OTHER }), ME)).toBe("own");
  expect(reviewAction(view([], { last_edited_by: ME.id }), { ...ME, role: "admin" })).toBe(
    "button",
  );
  expect(reviewAction(view([], { review_state: "reviewed" }), ME)).toBe("none");
});

test("the sync header puts stuck writes first, then offline, then progress", () => {
  const base: OutboxSnapshot = {
    records: [],
    idMap: {},
    syncing: false,
    signedOut: false,
    online: true,
    unreadable: 0,
  };
  const pending = section(SPOT_A, SEATING);
  const failed = section(SPOT_B, SEATING, { state: "failed" });
  expect(syncHeader(base)).toEqual({ kind: "all_synced" });
  expect(syncHeader({ ...base, records: [pending] })).toEqual({ kind: "pending", count: 1 });
  expect(syncHeader({ ...base, records: [pending], syncing: true })).toEqual({
    kind: "syncing",
    count: 1,
  });
  expect(syncHeader({ ...base, records: [pending], online: false })).toEqual({ kind: "offline" });
  expect(syncHeader({ ...base, records: [pending, failed], online: false })).toEqual({
    kind: "failed",
    count: 1,
  });
  expect(syncHeader({ ...base, signedOut: true })).toEqual({ kind: "signed_out" });
});

function summary(over: Partial<SpotSummary>): SpotSummary {
  return {
    id: SPOT_A,
    slug: "a",
    official_name: "A",
    common_name: null,
    building_id: "sac",
    building_name: "Student Activities Center",
    status: "published",
    review_state: "reviewed",
    version: 3,
    last_edited_by: ME.id,
    last_edited_by_name: "Me",
    updated_at: "2026-10-05T15:00:00.000Z",
    oldest_verified_at: "2026-10-01T15:00:00.000Z",
    hours_confirmed: true,
    ...over,
  };
}

test("home: attention by urgency, oldest checks first, drafts with part counts", () => {
  const ids = (n: number) => `8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a2${n}`;
  const list = {
    term: TERM,
    spots: [
      summary({ id: ids(1), official_name: "Hours gap", hours_confirmed: false }),
      summary({
        id: ids(2),
        official_name: "Bo's edit",
        review_state: "unreviewed",
        last_edited_by: OTHER,
        last_edited_by_name: "Bo",
      }),
      summary({ id: ids(3), official_name: "Broken" }),
      summary({ id: ids(4), official_name: "Never", oldest_verified_at: null }),
      summary({ id: ids(5), official_name: "Draft", status: "draft" }),
    ],
  };
  const records = [section(ids(3), SEATING, { state: "failed" }), create(LOCAL)];
  const details = new Map([[ids(5), surveySpotFixture({ id: ids(5), seat_count: null })]]);
  const home = surveyHome(list, records, ME, details);
  expect(home.attention.map((r) => [r.name, r.reason])).toEqual([
    ["Broken", "failed"],
    ["Bo's edit", "unreviewed"],
    ["Hours gap", "hours_unconfirmed"],
  ]);
  expect(home.stale.map((r) => r.name)).toEqual(["Never", "Bo's edit", "Broken", "Hours gap"]);
  expect(home.drafts).toEqual([
    { spotId: ids(5), name: "Draft", localOnly: false, requiredDone: 6 },
    { spotId: LOCAL, name: "SAC Lounge", localOnly: true, requiredDone: 1 },
  ]);
});

test("home counts stored records that could not be read", () => {
  expect(surveyHome(null, [], ME, new Map()).unreadable).toBe(0);
  expect(surveyHome(null, [], ME, new Map(), 2).unreadable).toBe(2);
});

test("failed and conflict writes show but do not count toward readiness or checks", () => {
  for (const state of ["failed", "conflict"] as const) {
    const v = view([section(SPOT_A, SEATING, { state })]);
    expect(v.spot.seat_count).toBe(40);
    expect(v.spot.missing).toEqual(["seat_count"]);
    expect(v.spot.verified.seating).toBeUndefined();
    expect(publishReadiness(v).kind).toBe("blocked");
    const seating = sectionStatuses(v, NY).find((s) => s.section === "seating");
    expect(seating).toMatchObject({
      fill: "missing",
      sync: state,
      verifiedAt: null,
      checkedToday: false,
    });
  }
});

test("a conflicted publish or review is not reported as queued", () => {
  for (const kind of ["spot.publish", "spot.review"] as const) {
    for (const state of ["failed", "conflict"] as const) {
      const v = view([rec({ kind, spot_id: SPOT_A, payload: {} }, { state })], {
        seat_count: 40,
        missing: [],
      });
      expect(v.publishQueued).toBe(false);
      expect(v.reviewQueued).toBe(false);
    }
  }
  const live = view([
    rec({ kind: "spot.publish", spot_id: SPOT_A, payload: {} }, { state: "syncing" }),
  ]);
  expect(live.publishQueued).toBe(true);
});
test("queued writes overlay in seq order, whatever order they are passed in", () => {
  const first = section(SPOT_A, SEATING);
  const second = section(SPOT_A, {
    section: "seating",
    data: { ...SEATING.data, seat_count: 55 },
  });
  const v = view([second, first]);
  expect(v.spot.seat_count).toBe(55);
  expect(v.records.map((r) => r.seq)).toEqual([first.seq, second.seq]);
  const made = create(LOCAL);
  const renamed = rec({
    kind: "spot.section",
    spot_id: LOCAL,
    payload: { section: "identity", data: identity({ official_name: "New" }) },
  });
  const home = surveyHome(null, [made, renamed].reverse(), ME, new Map());
  expect(home.drafts.map((d) => d.name)).toEqual(["New"]);
});
test("the sync header never says all synced while unreadable writes exist", () => {
  const base: OutboxSnapshot = {
    records: [],
    idMap: {},
    syncing: false,
    signedOut: false,
    online: true,
    unreadable: 2,
  };
  expect(syncHeader(base)).toEqual({ kind: "unreadable", count: 2 });
  expect(syncHeader({ ...base, online: false })).toEqual({ kind: "unreadable", count: 2 });
});
