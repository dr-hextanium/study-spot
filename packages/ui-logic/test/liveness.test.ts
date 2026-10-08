import { expect, test } from "bun:test";
import { createLocalLiveness, createLocalSignal } from "../src/index.ts";
import { sequentialIds } from "./fakes.ts";

const ids = () => sequentialIds("7000");

test("local liveness: an owner is alive while it holds, per shared scope", async () => {
  const scope = {};
  const a = createLocalLiveness(scope, ids());
  const b = createLocalLiveness(scope, ids());
  const other = createLocalLiveness({}, ids());
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

test("local liveness names its owner from the injected ids, not a counter", async () => {
  const scope = {};
  const seq = sequentialIds("7100");
  const a = createLocalLiveness(scope, seq);
  const b = createLocalLiveness(scope, seq);
  const idA = await a.hold();
  const idB = await b.hold();
  expect(idA).toMatch(/^[0-9a-f-]{36}$/);
  expect(idA).not.toBe(idB);
  expect(idA).not.toMatch(/^local-/);
});
