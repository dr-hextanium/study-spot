import { expect, test } from "vitest";
import { MemoryCache } from "../../../packages/ui-logic/test/fakes.ts";
import { createPersistStorage } from "../src/app/persistStorage.ts";

class FlakyCache extends MemoryCache {
  failGet = false;
  override async get(key: string): Promise<string | null> {
    if (this.failGet) throw new Error("idb timeout");
    return super.get(key);
  }
}

test("a failed restore never lets a later save overwrite the stored snapshot", async () => {
  const cache = new FlakyCache();
  await cache.set("k", "good");
  cache.failGet = true;
  const storage = createPersistStorage(cache);
  expect(await storage.getItem("k")).toBeNull();
  await storage.setItem("k", "empty");
  cache.failGet = false;
  expect(await cache.get("k")).toBe("good");
});

test("saves go through once a restore succeeded or found nothing", async () => {
  const cache = new FlakyCache();
  const storage = createPersistStorage(cache);
  expect(await storage.getItem("k")).toBeNull();
  await storage.setItem("k", "one");
  expect(await cache.get("k")).toBe("one");
  expect(await storage.getItem("k")).toBe("one");
  await storage.removeItem("k");
  expect(await cache.get("k")).toBeNull();
});
