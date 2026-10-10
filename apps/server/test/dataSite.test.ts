import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fsDataSite, httpDataSite } from "../src/publish/dataSite.ts";
import type { FetchLike } from "../src/publish/pagesTarget.ts";

test("httpDataSite reads 200s and turns everything else into null", async () => {
  const urls: string[] = [];
  const fake: FetchLike = async (url) => {
    urls.push(url);
    if (url.includes("/photos/ok.jpg"))
      return new Response(new Uint8Array([1, 2]), { status: 200 });
    if (url.includes("/photos/boom.jpg")) throw new Error("network down");
    return new Response("nope", { status: 404 });
  };
  const site = httpDataSite("https://data.example/", fake);
  expect(Array.from((await site.get("photos/ok.jpg")) ?? [])).toEqual([1, 2]);
  expect(await site.get("photos/missing.jpg")).toBeNull();
  expect(await site.get("photos/boom.jpg")).toBeNull();
  expect(urls[0]).toBe("https://data.example/photos/ok.jpg");

  await site.get("photos/ok.jpg", { fresh: true });
  expect(urls.at(-1)).toMatch(/^https:\/\/data\.example\/photos\/ok\.jpg\?check=\d+$/);
});

test("data sites refuse paths that leave the site", async () => {
  let calls = 0;
  const site = httpDataSite("https://data.example", async () => {
    calls += 1;
    return new Response("x", { status: 200 });
  });
  const dir = mkdtempSync(join(tmpdir(), "data-site-"));
  writeFileSync(join(dir, "a.jpg"), "x");
  const local = fsDataSite(join(dir, "sub"));
  for (const bad of ["../a.jpg", "/etc/passwd", "photos/../../a.jpg", ""]) {
    expect(await site.get(bad)).toBeNull();
    expect(await local.get(bad)).toBeNull();
  }
  expect(calls).toBe(0);
  expect(Array.from((await fsDataSite(dir).get("a.jpg")) ?? [])).toEqual([0x78]);
});

test("httpDataSite stops reading a body that grows past the limit", async () => {
  let pulled = 0;
  let cancelled = false;
  const endless = () =>
    new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelled = true;
      },
    });
  const site = httpDataSite("https://data.example", async () => new Response(endless()), {
    maxBytes: 4096,
  });
  expect(await site.get("photos/big.jpg")).toBeNull();
  expect(cancelled).toBe(true);
  expect(pulled).toBeLessThan(10);

  const small = httpDataSite(
    "https://data.example",
    async () => new Response(new Uint8Array(4096)),
    { maxBytes: 4096 },
  );
  expect((await small.get("photos/ok.jpg"))?.byteLength).toBe(4096);
});
