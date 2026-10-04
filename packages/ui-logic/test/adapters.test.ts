import { expect, test } from "bun:test";
import { ClientWriteId } from "@study-spot/core";
import { FakeTimers, MemoryCache, sequentialIds } from "./fakes.ts";

test("cache keys filter by prefix and delete removes", async () => {
  const cache = new MemoryCache();
  await cache.set("outbox:w:a", "1");
  await cache.set("outbox:v:a", "2");
  await cache.set("other", "3");
  expect((await cache.keys("outbox:")).sort()).toEqual(["outbox:v:a", "outbox:w:a"]);
  await cache.delete("outbox:w:a");
  expect(await cache.keys("outbox:w:")).toEqual([]);
});

test("fake ids are valid client write ids", () => {
  const ids = sequentialIds();
  expect(ClientWriteId.safeParse(ids.uuid()).success).toBe(true);
  expect(ids.uuid()).not.toBe(ids.uuid());
});

test("fake timers fire in time order and can be cancelled", () => {
  const timers = new FakeTimers();
  const fired: string[] = [];
  timers.after(300, () => fired.push("late"));
  timers.after(100, () => fired.push("early"));
  const cancel = timers.after(200, () => fired.push("cancelled"));
  cancel();
  expect(timers.scheduled()).toEqual([100, 300]);
  timers.advance(250);
  expect(fired).toEqual(["early"]);
  timers.advance(50);
  expect(fired).toEqual(["early", "late"]);
});
