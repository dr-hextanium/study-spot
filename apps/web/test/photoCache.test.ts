import { expect, test } from "vitest";
import { photoCacheRule } from "../src/lib/photoCache.ts";

const rule = photoCacheRule("https://perch-data.pages.dev");
const match = (url: string) => rule.urlPattern.test(url);

test("only the data site's photos are cached", () => {
  expect(match("https://perch-data.pages.dev/photos/abc123.jpg")).toBe(true);
  expect(match("https://other.example/photos/abc123.jpg")).toBe(false);
  // A look-alike host that starts with the data origin is not the data site.
  expect(match("https://perch-data.pages.dev.evil.example/photos/a.jpg")).toBe(false);
  expect(match("https://perch-data.pages.dev/bundle-latest.json")).toBe(false);
  expect(match("https://perch-data.pages.dev/x/photos/a.jpg")).toBe(false);
});

test("CORS photos get their own cache, apart from the old opaque entries", () => {
  // The old rule kept no-cors (opaque) responses in "perch-photos". CacheFirst matches by URL,
  // so reusing that name would answer a crossOrigin request with an opaque entry: a load error.
  expect(rule.options.cacheName).toBe("perch-photos-cors");
});

test("only full 200 responses are kept, never an opaque one", () => {
  expect(rule.options.cacheableResponse.statuses).toEqual([200]);
  expect(rule.handler).toBe("CacheFirst");
});

test("a trailing slash or a dot in the origin is handled literally", () => {
  const r = photoCacheRule("http://data.localhost:8961/");
  expect(r.urlPattern.test("http://data.localhost:8961/photos/a.jpg")).toBe(true);
  expect(r.urlPattern.test("http://dataxlocalhost:8961/photos/a.jpg")).toBe(false);
});
