import { expect, test } from "bun:test";
import type { BundleBuilding, Criterion } from "@perch/core";
import {
  ACCESS_KEY,
  CustomPresets,
  deleteCustomPreset,
  dismissInstall,
  INSTALL_KEY,
  MAX_CUSTOM_PRESETS,
  notePickAction,
  PRESETS_KEY,
  quadOptions,
  readAccess,
  readCustomPresets,
  residenceOptions,
  saveCustomPreset,
  shouldOfferInstall,
  writeAccess,
} from "../src/index.ts";
import { MemoryStorage, sequentialIds } from "./fakes.ts";

const OUTLETS: Criterion = { attr: "outlet_coverage_pct", target: 0.5 };
const b = (id: string, name: string): BundleBuilding => ({ id, name, lat: 40.9, lng: -73.1 });

test("access round-trips; missing is the default; corrupt resets", () => {
  const s = new MemoryStorage();
  expect(readAccess(s)).toEqual({
    value: { residence: null, quad: null, grad: false },
    reset: false,
  });
  writeAccess(s, { residence: "roth-quad", quad: "kelly-quad", grad: true });
  expect(readAccess(s)).toEqual({
    value: { residence: "roth-quad", quad: "kelly-quad", grad: true },
    reset: false,
  });
  s.setItem(ACCESS_KEY, "{nope");
  expect(readAccess(s)).toEqual({
    value: { residence: null, quad: null, grad: false },
    reset: true,
  });
  expect(s.getItem(ACCESS_KEY)).toBeNull();
});

test("custom presets with a built-in id or a null name reset the whole list", () => {
  const good = {
    id: "custom-a",
    name: "Mine",
    required: [OUTLETS],
    soft: [],
    minutes: null,
    groupDefault: null,
  };
  const s = new MemoryStorage();
  s.setItem(PRESETS_KEY, JSON.stringify([good, { ...good, id: "silent_solo" }]));
  expect(readCustomPresets(s)).toEqual({ value: [], reset: true });
  s.setItem(PRESETS_KEY, JSON.stringify([good, { ...good, id: "custom-b", name: null }]));
  expect(readCustomPresets(s).reset).toBe(true);
  s.setItem(PRESETS_KEY, JSON.stringify([good]));
  expect(readCustomPresets(s)).toEqual({ value: [good], reset: false });
  expect(CustomPresets.safeParse(Array(11).fill(good)).success).toBe(false);
});

test("saveCustomPreset validates, stores and names the preset", () => {
  const s = new MemoryStorage();
  const ids = sequentialIds();
  expect(saveCustomPreset(s, [], { name: "  ", extra: [OUTLETS] }, ids)).toEqual({
    ok: false,
    error: "name_required",
  });
  expect(saveCustomPreset(s, [], { name: "Outlets", extra: [] }, ids)).toEqual({
    ok: false,
    error: "filters_required",
  });
  const saved = saveCustomPreset(s, [], { name: "  Outlets  ", extra: [OUTLETS] }, ids);
  if (!saved.ok) throw new Error("expected ok");
  expect(saved.preset.id.startsWith("custom-")).toBe(true);
  expect(saved.preset).toMatchObject({
    name: "Outlets",
    required: [OUTLETS],
    soft: [],
    minutes: null,
    groupDefault: null,
  });
  expect(readCustomPresets(s)).toEqual({ value: saved.list, reset: false });
});

test("a long name is cut to 24 characters", () => {
  const r = saveCustomPreset(
    new MemoryStorage(),
    [],
    { name: "x".repeat(40), extra: [OUTLETS] },
    sequentialIds(),
  );
  if (!r.ok) throw new Error("expected ok");
  expect(r.preset.name).toBe("x".repeat(24));
});

test("a real-length uuid still reads back without a reset", () => {
  const s = new MemoryStorage();
  const ids = { uuid: () => "123e4567-e89b-42d3-a456-426614174000" };
  const r = saveCustomPreset(s, [], { name: "Mine", extra: [OUTLETS] }, ids);
  if (!r.ok) throw new Error("expected ok");
  expect(readCustomPresets(s)).toEqual({ value: r.list, reset: false });
});

test("the 11th preset is refused", () => {
  const s = new MemoryStorage();
  const ids = sequentialIds();
  let list: Parameters<typeof deleteCustomPreset>[1] = [];
  for (let i = 0; i < MAX_CUSTOM_PRESETS; i++) {
    const r = saveCustomPreset(s, list, { name: `P${i}`, extra: [OUTLETS] }, ids);
    if (!r.ok) throw new Error("expected ok");
    list = r.list;
  }
  expect(saveCustomPreset(s, list, { name: "More", extra: [OUTLETS] }, ids)).toEqual({
    ok: false,
    error: "full",
  });
});

test("deleteCustomPreset removes and stores", () => {
  const s = new MemoryStorage();
  const ids = sequentialIds();
  const a = saveCustomPreset(s, [], { name: "A", extra: [OUTLETS] }, ids);
  if (!a.ok) throw new Error("expected ok");
  const after = deleteCustomPreset(s, a.list, a.preset.id);
  expect(after).toEqual([]);
  expect(readCustomPresets(s).value).toEqual([]);
});

test("quad and residence options come from the bundle, by name", () => {
  const list = [
    b("kelly-quad", "Kelly Quad"),
    b("sac", "Student Activities Center"),
    b("roth-quad", "Roth Quad"),
  ];
  expect(quadOptions(list).map((x) => x.name)).toEqual(["Kelly Quad", "Roth Quad"]);
  expect(residenceOptions(list).map((x) => x.name)).toEqual([
    "Kelly Quad",
    "Roth Quad",
    "Student Activities Center",
  ]);
});

test("a pick action counts once per tab; the install offer follows", () => {
  const prefs = new MemoryStorage();
  const tabA = new MemoryStorage();
  expect(notePickAction(prefs, tabA).pickVisits).toBe(1);
  expect(notePickAction(prefs, tabA).pickVisits).toBe(1);
  const state = notePickAction(prefs, new MemoryStorage());
  expect(state).toEqual({ pickVisits: 2, dismissed: false });
  expect(shouldOfferInstall(state, false)).toBe(true);
  expect(shouldOfferInstall(state, true)).toBe(false);
  expect(shouldOfferInstall({ pickVisits: 1, dismissed: false }, false)).toBe(false);
  dismissInstall(prefs);
  expect(JSON.parse(prefs.getItem(INSTALL_KEY) ?? "null")).toEqual({
    pickVisits: 2,
    dismissed: true,
  });
  expect(shouldOfferInstall({ pickVisits: 2, dismissed: true }, false)).toBe(false);
});

test("corrupt install state starts over", () => {
  const prefs = new MemoryStorage();
  prefs.setItem(INSTALL_KEY, "[]");
  expect(notePickAction(prefs, new MemoryStorage())).toEqual({ pickVisits: 1, dismissed: false });
});
