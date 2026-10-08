import { expect, test } from "bun:test";
import { type DraftRow, homeList, isDue, keepGoing, type SurveyHome } from "../src/index.ts";

const NOW = new Date("2026-10-07T16:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const draft = (over: Partial<DraftRow> & { spotId: string; name: string }): DraftRow => ({
  localOnly: false,
  coverPhotoId: null,
  progress: null,
  updatedAt: null,
  editedByMe: false,
  lastSeq: null,
  ...over,
});

test("due: never checked, unreadable, or checked more than 90 days ago", () => {
  expect(isDue(null, NOW)).toBe(true);
  expect(isDue("not a date", NOW)).toBe(true);
  expect(isDue(days(91), NOW)).toBe(true);
  expect(isDue(days(90), NOW)).toBe(false);
  expect(isDue(days(3), NOW)).toBe(false);
});

const HOME: SurveyHome = {
  attention: [
    { spotId: "a", name: "Melville Library, 2nd floor", reason: "conflict", coverPhotoId: null },
  ],
  drafts: [
    draft({
      spotId: "d",
      name: "Union Lobby Tables",
      progress: { steps: [], done: 4, total: 6, next: "seating" },
    }),
    draft({ spotId: "a", name: "Melville Library, 2nd floor" }),
  ],
  stale: [
    { spotId: "n", name: "North Reading Room", oldestVerifiedAt: null, coverPhotoId: null },
    { spotId: "o", name: "Old Lounge", oldestVerifiedAt: days(120), coverPhotoId: null },
    { spotId: "f", name: "Fresh Café", oldestVerifiedAt: days(2), coverPhotoId: null },
  ],
  unreadable: 0,
};

test("all lists each spot once, the most urgent fact first", () => {
  const { rows, counts } = homeList(HOME, { filter: "all", query: "", now: NOW });
  expect(rows.map((r) => [r.spotId, r.fact.kind])).toEqual([
    ["a", "conflict"],
    ["d", "progress"],
    ["n", "never_checked"],
    ["o", "checked"],
    ["f", "checked"],
  ]);
  expect(counts).toEqual({ all: 5, attention: 1, drafts: 2, due: 2 });
});

test("due holds only stale published spots; a fresh one is only under all", () => {
  const { rows } = homeList(HOME, { filter: "due", query: "", now: NOW });
  expect(rows.map((r) => r.spotId)).toEqual(["n", "o"]);
});

test("search ignores case and accents, and the counts follow it", () => {
  const { rows, counts } = homeList(HOME, { filter: "all", query: "cafe", now: NOW });
  expect(rows.map((r) => r.name)).toEqual(["Fresh Café"]);
  expect(counts).toEqual({ all: 1, attention: 0, drafts: 0, due: 0 });
});

test("a draft without cached details has no progress fact", () => {
  const { rows } = homeList(
    { ...HOME, attention: [], drafts: [draft({ spotId: "x", name: "X" })], stale: [] },
    { filter: "drafts", query: "", now: NOW },
  );
  expect(rows[0]?.fact).toEqual({ kind: "draft" });
});

test("keep going: the draft with the newest write on this phone, else my latest server edit", () => {
  const a = draft({ spotId: "a", name: "A", lastSeq: 3 });
  const b = draft({ spotId: "b", name: "B", lastSeq: 9 });
  const c = draft({ spotId: "c", name: "C", editedByMe: true, updatedAt: days(1) });
  const d = draft({ spotId: "d", name: "D", editedByMe: true, updatedAt: days(5) });
  const e = draft({ spotId: "e", name: "E", editedByMe: false, updatedAt: days(0) });
  expect(keepGoing([a, b, c])?.spotId).toBe("b");
  expect(keepGoing([d, c, e])?.spotId).toBe("c");
  expect(keepGoing([e])).toBeNull();
  expect(keepGoing([])).toBeNull();
});

test("a row carries its cover to the list", () => {
  const COVER = "5b0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a21";
  const home: SurveyHome = {
    ...HOME,
    stale: [{ spotId: "c", name: "Covered", oldestVerifiedAt: days(2), coverPhotoId: COVER }],
    drafts: [draft({ spotId: "e", name: "Draft", coverPhotoId: COVER })],
  };
  const { rows } = homeList(home, { filter: "all", query: "", now: NOW });
  expect(rows.map((r) => [r.spotId, r.coverPhotoId])).toEqual([
    ["a", null],
    ["e", COVER],
    ["c", COVER],
  ]);
});

test("a published spot keeps its check date when an attention fact leads", () => {
  const home: SurveyHome = {
    ...HOME,
    stale: [
      ...HOME.stale,
      {
        spotId: "a",
        name: "Melville Library, 2nd floor",
        oldestVerifiedAt: days(40),
        coverPhotoId: null,
      },
    ],
  };
  const { rows } = homeList(home, { filter: "all", query: "", now: NOW });
  expect(rows.find((r) => r.spotId === "a")).toMatchObject({
    fact: { kind: "conflict" },
    checked: { at: days(40) },
  });
  expect(rows.find((r) => r.spotId === "d")?.checked).toBeNull();
  expect(rows.find((r) => r.spotId === "n")?.checked).toEqual({ at: null });
});
