import { expect, test } from "vitest";
import type { Pin } from "../src/map/pin.ts";
import { campusBounds, diffPins, fitKey } from "../src/map/pinDiff.ts";

const pin = (id: string, over: Partial<Pin> = {}): Pin => ({
  id,
  slug: id,
  lat: 40.91,
  lng: -73.12,
  bucket: "some",
  label: `${id}, Usually some seats`,
  ...over,
});

test("the first set adds every pin", () => {
  const d = diffPins(new Map(), [pin("a"), pin("b")]);
  expect(d.add.map((p) => p.id)).toEqual(["a", "b"]);
  expect(d.update).toEqual([]);
  expect(d.remove).toEqual([]);
});

test("the same pins again, even as new objects, change nothing", () => {
  const prev = new Map([pin("a"), pin("b")].map((p) => [p.id, p]));
  expect(diffPins(prev, [pin("a"), pin("b")])).toEqual({ add: [], update: [], remove: [] });
});

test("a changed bucket or label updates in place; a gone pin is removed; a new one added", () => {
  const prev = new Map([pin("a"), pin("b"), pin("c")].map((p) => [p.id, p]));
  const d = diffPins(prev, [
    pin("a", { bucket: "full", label: "a, Usually full" }),
    pin("c"),
    pin("d"),
  ]);
  expect(d.update.map((p) => [p.id, p.bucket])).toEqual([["a", "full"]]);
  expect(d.remove).toEqual(["b"]);
  expect(d.add.map((p) => p.id)).toEqual(["d"]);
});

test("the fit key changes with the set of ids and the centre, not order or busyness", () => {
  const c = { lat: 40.9, lng: -73.1 };
  const k = fitKey([pin("a"), pin("b")], c);
  expect(fitKey([pin("b", { bucket: "full" }), pin("a")], c)).toBe(k);
  expect(fitKey([pin("a")], c)).not.toBe(k);
  expect(fitKey([pin("a"), pin("b")], { lat: 40.8, lng: -73.1 })).not.toBe(k);
});

test("campus bounds wrap every building with a margin", () => {
  const b = campusBounds([
    { lat: 40.91, lng: -73.13 },
    { lat: 40.92, lng: -73.11 },
  ]);
  if (b === null) throw new Error("no bounds");
  const [[west, south], [east, north]] = b;
  expect(west).toBeLessThan(-73.13);
  expect(south).toBeLessThan(40.91);
  expect(east).toBeGreaterThan(-73.11);
  expect(north).toBeGreaterThan(40.92);
  expect(campusBounds([])).toBeNull();
});
