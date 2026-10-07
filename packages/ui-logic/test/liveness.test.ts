import { expect, test } from "bun:test";
import { createLocalLiveness, createLocalSignal } from "../src/index.ts";

test("local liveness: an owner is alive while it holds, per shared scope", async () => {
  const scope = {};
  const a = createLocalLiveness(scope);
  const b = createLocalLiveness(scope);
  const other = createLocalLiveness({});
  const idA = await a.hold();
  expect(await a.hold()).toBe(idA);
  expect(await b.alive(idA)).toBe(true);
  expect(await other.alive(idA)).toBe(false);
  a.release();
  expect(await b.alive(idA)).toBe(false);
  expect(await b.alive("never-held")).toBe(false);
});

test("local signal reaches the other subscribers on the same scope, not the poster", () => {
  const scope = {};
  const a = createLocalSignal(scope);
  const b = createLocalSignal(scope);
  const c = createLocalSignal({});
  const got: string[] = [];
  a.subscribe(() => got.push("a"));
  const stopB = b.subscribe(() => got.push("b"));
  c.subscribe(() => got.push("c"));
  a.post();
  expect(got).toEqual(["b"]);
  stopB();
  a.post();
  expect(got).toEqual(["b"]);
});
