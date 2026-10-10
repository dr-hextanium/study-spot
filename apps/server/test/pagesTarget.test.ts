import { expect, test } from "bun:test";
import { z } from "zod";
import { CF_API, type FetchLike, pagesHash, pagesTarget } from "../src/publish/pagesTarget.ts";
import type { PublishFile } from "../src/publish/target.ts";

const PROJECT = `${CF_API}/accounts/acc/pages/projects/perch-data`;

test("pagesHash matches wrangler's blake3 asset key", () => {
  // Reference values from blake3-wasm, the library wrangler uses.
  expect(pagesHash(new TextEncoder().encode("hello"), "bundle.json")).toBe(
    "91e633a7905596f6e3107c1d8b6773dd",
  );
  expect(pagesHash(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "photos/a.jpg")).toBe(
    "6b7f62ff0a112b83df345ec6ed64f020",
  );
  expect(pagesHash(new TextEncoder().encode("hello"), "_redirects")).toBe(
    "324ea05bea4d7f75b8d9ed695e65b2ca",
  );
});

type Call = { url: string; auth: string | null; body: RequestInit["body"] };

/** Fake Cloudflare API: records calls; check-missing reports `missing` as absent. */
function fakeCloudflare(missing: (hashes: string[]) => string[]) {
  const calls: Call[] = [];
  const ok = (result: unknown) =>
    new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 });
  const fake: FetchLike = async (url, init) => {
    const headers = new Headers(init.headers);
    calls.push({ url, auth: headers.get("authorization"), body: init.body });
    if (url === `${PROJECT}/upload-token`) return ok({ jwt: "jwt-1" });
    if (url === `${CF_API}/pages/assets/check-missing`) {
      const { hashes } = z
        .object({ hashes: z.array(z.string()) })
        .parse(JSON.parse(String(init.body)));
      return ok(missing(hashes));
    }
    if (url === `${CF_API}/pages/assets/upload`) return ok(null);
    if (url === `${CF_API}/pages/assets/upsert-hashes`) return ok(null);
    if (url === `${PROJECT}/deployments`) return ok({ id: "dep-1" });
    return new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 7003, message: "no route" }],
        result: null,
      }),
      { status: 404 },
    );
  };
  return { calls, fetch: fake };
}

function files(reads: { photo: number }): PublishFile[] {
  const text = (s: string) => async () => new TextEncoder().encode(s);
  return [
    {
      path: "photos/abc.jpg",
      contentType: "image/jpeg",
      bytes: async () => {
        reads.photo += 1;
        return new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
      },
    },
    { path: "bundle.0123456789abcdef.json", contentType: "application/json", bytes: text("{}") },
    { path: "_headers", contentType: "text/plain", bytes: text("/*\n  X: y\n") },
    { path: "bundle-latest.json", contentType: "application/json", bytes: text('{"p":1}') },
  ];
}

test("deploy uploads only missing assets and sends a full manifest", async () => {
  const photoHash = "6b7f62ff0a112b83df345ec6ed64f020";
  const cf = fakeCloudflare((hashes) => hashes.filter((h) => h !== photoHash));
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "api-token",
    project: "perch-data",
    fetch: cf.fetch,
  });
  const reads = { photo: 0 };
  const result = await target.deploy(files(reads));
  expect(result).toEqual({
    uploaded: ["bundle.0123456789abcdef.json", "bundle-latest.json"],
    skipped: ["photos/abc.jpg"],
  });

  expect(cf.calls.map((c) => c.url)).toEqual([
    `${PROJECT}/upload-token`,
    `${CF_API}/pages/assets/check-missing`,
    `${CF_API}/pages/assets/upload`,
    `${CF_API}/pages/assets/upsert-hashes`,
    `${PROJECT}/deployments`,
  ]);
  expect(cf.calls.map((c) => c.auth)).toEqual([
    "Bearer api-token",
    "Bearer jwt-1",
    "Bearer jwt-1",
    "Bearer jwt-1",
    "Bearer api-token",
  ]);

  const uploadBody = z
    .array(z.object({ key: z.string(), value: z.string(), base64: z.literal(true) }))
    .parse(JSON.parse(String(cf.calls[2]?.body)));
  expect(uploadBody.map((u) => u.key)).not.toContain(photoHash);
  expect(uploadBody).toHaveLength(2);

  const form = cf.calls[4]?.body;
  if (!(form instanceof FormData)) throw new Error("deployment body is not FormData");
  const manifest = z.record(z.string(), z.string()).parse(JSON.parse(String(form.get("manifest"))));
  expect(Object.keys(manifest).sort()).toEqual([
    "/bundle-latest.json",
    "/bundle.0123456789abcdef.json",
    "/photos/abc.jpg",
  ]);
  expect(manifest["/photos/abc.jpg"]).toBe(photoHash);
  const headers = form.get("_headers");
  expect(headers instanceof Blob ? await headers.text() : null).toBe("/*\n  X: y\n");
  expect(form.get("branch")).toBeNull();
});

test("immutable files are hashed once per process", async () => {
  const cf = fakeCloudflare(() => []);
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: cf.fetch,
  });
  const reads = { photo: 0 };
  await target.deploy(files(reads));
  await target.deploy(files(reads));
  expect(reads.photo).toBe(1);
});

test("a Cloudflare error is thrown with its code and message", async () => {
  const fail: FetchLike = async () =>
    new Response(
      JSON.stringify({
        success: false,
        errors: [{ code: 8000013, message: "bad token" }],
        result: null,
      }),
      { status: 403 },
    );
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: fail,
  });
  await expect(target.deploy(files({ photo: 0 }))).rejects.toThrow("8000013 bad token");
});

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const PHOTO_HASH = "6b7f62ff0a112b83df345ec6ed64f020";

function manifestOf(call: Call | undefined): Record<string, string> {
  const form = call?.body;
  if (!(form instanceof FormData)) throw new Error("deployment body is not FormData");
  return z.record(z.string(), z.string()).parse(JSON.parse(String(form.get("manifest"))));
}

test("a precomputed asset hash goes into the manifest without reading the bytes", async () => {
  const cf = fakeCloudflare((hashes) => hashes.filter((h) => h !== PHOTO_HASH));
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: cf.fetch,
  });
  const result = await target.deploy([
    {
      path: "photos/abc.jpg",
      contentType: "image/jpeg",
      pagesHash: PHOTO_HASH,
      bytes: async () => {
        throw new Error("bytes must not be read");
      },
    },
    { path: "bundle-latest.json", contentType: "application/json", bytes: async () => PHOTO },
  ]);
  expect(result.skipped).toEqual(["photos/abc.jpg"]);
  expect(manifestOf(cf.calls.at(-1))["/photos/abc.jpg"]).toBe(PHOTO_HASH);
});

test("a precomputed hash that Cloudflare lacks is uploaded from the bytes", async () => {
  const cf = fakeCloudflare((hashes) => hashes);
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: cf.fetch,
  });
  const result = await target.deploy([
    {
      path: "photos/abc.jpg",
      contentType: "image/jpeg",
      pagesHash: PHOTO_HASH,
      bytes: async () => PHOTO,
    },
  ]);
  expect(result.uploaded).toEqual(["photos/abc.jpg"]);
  const upload = cf.calls.find((c) => c.url === `${CF_API}/pages/assets/upload`);
  const keys = z.array(z.object({ key: z.string() })).parse(JSON.parse(String(upload?.body)));
  expect(keys.map((k) => k.key)).toEqual([PHOTO_HASH]);
});

test("bytes that do not match the precomputed hash fail before any deployment", async () => {
  const cf = fakeCloudflare((hashes) => hashes);
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: cf.fetch,
  });
  await expect(
    target.deploy([
      {
        path: "photos/abc.jpg",
        contentType: "image/jpeg",
        pagesHash: PHOTO_HASH,
        bytes: async () => new Uint8Array([1, 2, 3]),
      },
    ]),
  ).rejects.toThrow("do not match");
  expect(cf.calls.some((c) => c.url === `${PROJECT}/deployments`)).toBe(false);
});

test("a file whose bytes cannot be read when needed fails before any deployment", async () => {
  const cf = fakeCloudflare((hashes) => hashes);
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: cf.fetch,
  });
  await expect(
    target.deploy([
      {
        path: "photos/abc.jpg",
        contentType: "image/jpeg",
        pagesHash: PHOTO_HASH,
        bytes: async () => {
          throw new Error("photo abc is gone");
        },
      },
    ]),
  ).rejects.toThrow("photo abc is gone");
  expect(cf.calls.some((c) => c.url === `${PROJECT}/deployments`)).toBe(false);
});

test("a failing beforeDeployment hook stops the deploy before the deployment POST", async () => {
  const cf = fakeCloudflare((hashes) => hashes);
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: cf.fetch,
  });
  await expect(
    target.deploy(files({ photo: 0 }), {
      beforeDeployment: async () => {
        throw new Error("publish lease lost");
      },
    }),
  ).rejects.toThrow("publish lease lost");
  expect(cf.calls.some((c) => c.url === `${PROJECT}/deployments`)).toBe(false);
  expect(cf.calls.some((c) => c.url === `${CF_API}/pages/assets/upsert-hashes`)).toBe(true);
});

/** A Cloudflare that never answers, except by honoring the abort signal. */
const hung: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });

test("every Cloudflare call has a timeout", async () => {
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: hung,
    callTimeoutMs: 20,
  });
  await expect(target.deploy(files({ photo: 0 }))).rejects.toThrow();
});

test("a deploy past its total budget stops before the deployment POST", async () => {
  const cf = fakeCloudflare((hashes) => hashes);
  let now = 0;
  const slow: FetchLike = async (url, init) => {
    now += 400;
    return cf.fetch(url, init);
  };
  const target = pagesTarget({
    accountId: "acc",
    apiToken: "t",
    project: "perch-data",
    fetch: slow,
    budgetMs: 1000,
    now: () => now,
  });
  await expect(target.deploy(files({ photo: 0 }))).rejects.toThrow("budget");
  expect(cf.calls.some((c) => c.url === `${PROJECT}/deployments`)).toBe(false);
});

test("the default budget leaves room inside the publish lease", async () => {
  const { PAGES_DEPLOY_BUDGET_MS, PAGES_CALL_TIMEOUT_MS } = await import(
    "../src/publish/pagesTarget.ts"
  );
  const { PUBLISH_LEASE_MS } = await import("../src/publish/publisher.ts");
  expect(PAGES_DEPLOY_BUDGET_MS + PAGES_CALL_TIMEOUT_MS).toBeLessThanOrEqual(PUBLISH_LEASE_MS / 2);
});
