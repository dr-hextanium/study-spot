import { expect, test } from "bun:test";
import { buildBundle } from "@study-spot/db";
import { seed } from "@study-spot/db/seed";
import { createTestDb } from "@study-spot/db/testing";
import { type CheckResult, checkDeploy, type FetchLike } from "../src/deploy/check.ts";

const API = "https://study-spot-api.onrender.com";
const WEB = "https://study-spot.pages.dev";
const DATA = "https://study-spot-data.pages.dev";
const HASH = "0123456789abcdef";

const db = await createTestDb();
await seed(db);
const { bundle } = await buildBundle(db, "sbu", new Date("2026-10-13T18:00:00Z"));
const pointer = {
  schema_version: bundle.schema_version,
  hash: HASH,
  url: `bundle.${HASH}.json`,
  generated_at: "2026-10-13T18:00:00.000Z",
};

type Req = { url: string; method: string; origin: string | null };
type Handler = (req: Req) => Response;

function json(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A healthy deployment. Tests override one route at a time. */
const good: Handler = ({ url, method, origin }) => {
  if (url === `${API}/health`) return json({ ok: true });
  if (method === "OPTIONS" && url.startsWith(`${API}/survey/`)) {
    return origin === WEB
      ? new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": WEB,
            "access-control-allow-methods": "GET, POST, PUT",
          },
        })
      : new Response(null, { status: 204 });
  }
  if (url === `${DATA}/bundle-latest.json`) {
    return json(pointer, { "access-control-allow-origin": "*", "cache-control": "no-cache" });
  }
  if (url === `${DATA}/bundle.${HASH}.json`) {
    return json(bundle, { "cache-control": "public, max-age=31536000, immutable" });
  }
  return new Response("not found", { status: 404 });
};

function fakeFetch(handler: Handler): FetchLike {
  return async (url, init) =>
    handler({
      url,
      method: init?.method ?? "GET",
      origin: new Headers(init?.headers).get("origin"),
    });
}

const run = (handler: Handler, extra: { maxHealthAttempts?: number } = {}): Promise<CheckResult> =>
  checkDeploy({
    apiBaseUrl: API,
    webOrigin: WEB,
    dataBaseUrl: DATA,
    fetch: fakeFetch(handler),
    sleep: async () => {},
    ...extra,
  });

test("a healthy deployment passes and reports the bundle", async () => {
  const result = await run(good);
  expect(result).toEqual({ ok: true, hash: HASH, spots: bundle.spots.length, healthAttempts: 1 });
});

test("a cold start that answers on the third try passes", async () => {
  let calls = 0;
  const result = await run((req) => {
    if (req.url === `${API}/health` && ++calls < 3) return new Response("waking", { status: 503 });
    return good(req);
  });
  expect(result).toMatchObject({ ok: true, healthAttempts: 3 });
});

test("a service that never wakes fails at the health step", async () => {
  const result = await run(
    (req) => (req.url === `${API}/health` ? new Response("x", { status: 503 }) : good(req)),
    { maxHealthAttempts: 3 },
  );
  expect(result).toMatchObject({ ok: false, step: "health" });
});

test("a wrong allowed origin fails at the cors step", async () => {
  const result = await run((req) =>
    req.method === "OPTIONS"
      ? new Response(null, {
          status: 204,
          headers: { "access-control-allow-origin": "https://other.pages.dev" },
        })
      : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "cors" });
});

test("a server that allows any origin fails at the cors step", async () => {
  const result = await run((req) =>
    req.method === "OPTIONS"
      ? new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": req.origin ?? "*",
            "access-control-allow-methods": "PUT",
          },
        })
      : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "cors" });
});

test("a missing pointer fails at the pointer step with a publish hint", async () => {
  const result = await run((req) =>
    req.url === `${DATA}/bundle-latest.json` ? new Response("nope", { status: 404 }) : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "pointer" });
  if (!result.ok) expect(result.detail).toContain("publish");
});

test("a pointer without no-cache or cors fails at the pointer step", async () => {
  const result = await run((req) =>
    req.url === `${DATA}/bundle-latest.json` ? json(pointer) : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "pointer" });
});

test("a pointer whose url does not match its hash fails at the pointer step", async () => {
  const result = await run((req) =>
    req.url === `${DATA}/bundle-latest.json`
      ? json(
          { ...pointer, url: "https://elsewhere.example/bundle.json" },
          { "access-control-allow-origin": "*", "cache-control": "no-cache" },
        )
      : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "pointer" });
});

test("a pointer to a missing bundle fails at the bundle step", async () => {
  const result = await run((req) =>
    req.url === `${DATA}/bundle.${HASH}.json` ? new Response("gone", { status: 404 }) : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "bundle" });
});

test("an invalid bundle or a mutable hashed file fails at the bundle step", async () => {
  const invalid = await run((req) =>
    req.url === `${DATA}/bundle.${HASH}.json`
      ? json({ schema_version: bundle.schema_version })
      : good(req),
  );
  expect(invalid).toMatchObject({ ok: false, step: "bundle" });
  const mutable = await run((req) =>
    req.url === `${DATA}/bundle.${HASH}.json`
      ? json(bundle, { "cache-control": "no-cache" })
      : good(req),
  );
  expect(mutable).toMatchObject({ ok: false, step: "bundle" });
});
