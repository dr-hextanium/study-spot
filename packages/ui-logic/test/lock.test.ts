import { expect, test } from "bun:test";
import { createLocalLock } from "../src/index.ts";

test("the local lock runs holders of one name one at a time, in call order", async () => {
  const lock = createLocalLock();
  const log: string[] = [];
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const a = lock.run("x", async () => {
    log.push("a start");
    await gate;
    log.push("a end");
    return 1;
  });
  const b = lock.run("x", async () => {
    log.push("b");
    return 2;
  });
  const other = lock.run("y", async () => {
    log.push("y");
  });
  await other;
  expect(log).toEqual(["a start", "y"]);
  release();
  expect(await Promise.all([a, b])).toEqual([1, 2]);
  expect(log).toEqual(["a start", "y", "a end", "b"]);
});

test("the local lock is released when a holder throws", async () => {
  const lock = createLocalLock();
  await expect(
    lock.run("x", async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(await lock.run("x", async () => "next")).toBe("next");
});
