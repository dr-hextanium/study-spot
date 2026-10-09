import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COPY, COPY_MAX, type CopyId, plural, t } from "../src/index.ts";
import { parseCopyDeck } from "./copyDeck.ts";

const deck = parseCopyDeck(
  readFileSync(
    fileURLToPath(new URL("../../../docs/design/surveyor-copy.md", import.meta.url)),
    "utf8",
  ),
);

/**
 * Realistic values for every placeholder in the deck. Names are a typical
 * display name; the deck's max chars assume names up to about 20 characters.
 */
const SAMPLE: Readonly<Record<string, string>> = {
  block: "Afternoon",
  building: "Melville Library",
  bucket: "Nearly full",
  count: "12",
  date: "Oct 15",
  day: "Weekdays",
  done: "4",
  field: "outlet coverage",
  fields: "directions, seat count",
  floor: "2",
  meters: "120",
  minutes: "15",
  name: "Jordan Rivera",
  new: "Ana Lopez",
  percent: "100",
  reason: "seat count is required",
  section: "Power and signal",
  spot: "SAC Lounge",
  term: "Fall 2026",
  time: "Oct 15, 3:40 PM",
  total: "6",
  what: "Power and signal for SAC Lounge",
};

const ids = Object.keys(COPY) as CopyId[];

test("the module holds exactly the deck's strings and limits", () => {
  expect(deck.length).toBeGreaterThan(300);
  expect(new Set(deck.map((r) => r.id)).size).toBe(deck.length);
  const text: Record<string, string> = COPY;
  const max: Record<string, number> = COPY_MAX;
  expect(text).toEqual(Object.fromEntries(deck.map((r) => [r.id, r.text])));
  expect(max).toEqual(Object.fromEntries(deck.map((r) => [r.id, r.max])));
});

const EM_DASH = String.fromCodePoint(0x2014);

test("no string has an em-dash or an exclamation mark", () => {
  for (const id of ids) {
    expect(COPY[id].includes(EM_DASH)).toBe(false);
    expect(COPY[id].includes("!")).toBe(false);
  }
});

test("every string fits its max chars with representative params", () => {
  for (const id of ids) {
    const rendered = COPY[id].replace(/\{(\w+)\}/g, (_m, name: string) => {
      const value = SAMPLE[name];
      if (value === undefined) throw new Error(`no sample for {${name}} in ${id}`);
      return value;
    });
    expect({ id, length: rendered.length }).toEqual({
      id,
      length: Math.min(rendered.length, COPY_MAX[id]),
    });
  }
});

test("t fills typed params and leaves plain strings alone", () => {
  expect(t("common.save")).toBe("Save");
  expect(t("sync.pending", { count: 3 })).toBe("3 waiting to sync");
  expect(
    t("admin.publish.warning.item", { name: "SAC Lounge", reason: "missing directions" }),
  ).toBe("SAC Lounge: missing directions");
  // @ts-expect-error sync.pending needs { count }
  t("sync.pending");
  // @ts-expect-error common.save takes no params
  t("common.save", { count: 1 });
});

test("the deck covers the states added by review fixes", () => {
  expect(t("sync.unreadable", { count: 2 })).toBe("2 changes can't be read");
  expect(t("home.unreadable", { count: 2 })).toBe("2 changes can't be read");
  expect(t("sync.what.review", { name: "SAC Lounge" })).toBe("Review SAC Lounge");
  expect(t("sync.what.cover", { name: "SAC Lounge" })).toBe("Cover photo for SAC Lounge");
  expect(t("editor.verify.hours_missing", { term: "Fall 2026" })).toBe(
    "Add hours for Fall 2026 before marking this checked.",
  );
  expect(t("conflict.body_unknown")).toContain("Someone else");
});

test("plural picks the singular id for 1 and fills count otherwise", () => {
  expect(plural(1, "home.unreadable_one", "home.unreadable")).toBe("1 change can't be read");
  expect(plural(3, "home.unreadable_one", "home.unreadable")).toBe("3 changes can't be read");
  expect(plural(0, "sync.unreadable_one", "sync.unreadable")).toBe("0 changes can't be read");
  // @ts-expect-error the plural form must take exactly { count }
  plural(2, "common.save", "sync.what.create");
});
