import { expect, test } from "bun:test";
import { buildBundle } from "@study-spot/db";
import { seed } from "@study-spot/db/seed";
import { createTestDb } from "@study-spot/db/testing";
import {
  type CheckOptions,
  type CheckResult,
  checkDeploy,
  type FetchLike,
} from "../src/deploy/check.ts";

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
            "access-control-allow-headers": "authorization, content-type",
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

const run = (
  handler: Handler,
  extra: Partial<Omit<CheckOptions, "apiBaseUrl" | "webOrigin" | "dataBaseUrl">> = {},
): Promise<CheckResult> =>
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
            "access-control-allow-headers": "authorization, content-type",
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

test("a preflight that omits authorization fails at the cors step", async () => {
  const result = await run((req) =>
    req.method === "OPTIONS" && req.origin === WEB
      ? new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": WEB,
            "access-control-allow-methods": "PUT",
            "access-control-allow-headers": "content-type",
          },
        })
      : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "cors" });
  if (!result.ok) expect(result.detail).toContain("authorization");
});

test("allow-headers match is case-insensitive", async () => {
  const result = await run((req) =>
    req.method === "OPTIONS" && req.origin === WEB
      ? new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": WEB,
            "access-control-allow-methods": "PUT",
            "access-control-allow-headers": "Content-Type,Authorization",
          },
        })
      : good(req),
  );
  expect(result).toMatchObject({ ok: true });
});

test("every request carries an abort signal", async () => {
  const signals: Array<AbortSignal | null | undefined> = [];
  const result = await checkDeploy({
    apiBaseUrl: API,
    webOrigin: WEB,
    dataBaseUrl: DATA,
    sleep: async () => {},
    fetch: async (url, init) => {
      signals.push(init?.signal);
      return good({
        url,
        method: init?.method ?? "GET",
        origin: new Headers(init?.headers).get("origin"),
      });
    },
  });
  expect(result).toMatchObject({ ok: true });
  expect(signals.length).toBe(5);
  expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
});

test("the health loop stops at the wall-clock deadline and reports why", async () => {
  let clock = 0;
  let calls = 0;
  const result = await checkDeploy({
    apiBaseUrl: API,
    webOrigin: WEB,
    dataBaseUrl: DATA,
    maxWaitMs: 30_000,
    healthIntervalMs: 5_000,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetch: async () => {
      calls += 1;
      clock += 2_000;
      return new Response("waking", { status: 503 });
    },
  });
  expect(result).toMatchObject({ ok: false, step: "health" });
  if (!result.ok) {
    expect(result.detail).toContain("503");
    expect(result.detail).toMatch(/\d+s/);
  }
  expect(calls).toBeGreaterThan(1);
  expect(calls).toBeLessThan(10);
});

test("a health fetch error is named in the detail", async () => {
  const result = await run(
    () => {
      throw new Error("ECONNRESET");
    },
    { maxHealthAttempts: 2 },
  );
  expect(result).toMatchObject({ ok: false, step: "health" });
  if (!result.ok) expect(result.detail).toContain("ECONNRESET");
});

const failing =
  (matches: (url: string) => boolean): Handler =>
  (req) => {
    if (matches(req.url)) throw new Error("socket hang up");
    return good(req);
  };

for (const [step, matches] of [
  ["cors", (u: string) => u.startsWith(`${API}/survey/`)],
  ["pointer", (u: string) => u === `${DATA}/bundle-latest.json`],
  ["bundle", (u: string) => u === `${DATA}/bundle.${HASH}.json`],
] as const) {
  test(`a network error at the ${step} step returns a failure instead of throwing`, async () => {
    const result = await run(failing(matches));
    expect(result).toMatchObject({ ok: false, step });
    if (!result.ok) {
      expect(result.detail).toContain("could not reach");
      expect(result.detail).toContain("socket hang up");
    }
  });
}

test("a body read that throws at the bundle step returns a failure", async () => {
  const result = await run((req) =>
    req.url === `${DATA}/bundle.${HASH}.json`
      ? new Response("not json", { headers: { "cache-control": "immutable" } })
      : good(req),
  );
  expect(result).toMatchObject({ ok: false, step: "bundle" });
});

const OLD = "1111111111111111111111111111111111111111";
const NEW = "2222222222222222222222222222222222222222";
const withCommit = (commitFor: (attempt: number) => unknown): Handler =>
  (() => {
    let attempt = 0;
    return (req: Req) =>
      req.url === `${API}/health` ? json({ ok: true, commit: commitFor(++attempt) }) : good(req);
  })();

test("with an expected commit, the health loop waits until that commit is live", async () => {
  const result = await run(
    withCommit((n) => (n < 3 ? OLD : NEW)),
    { expectedCommit: NEW },
  );
  expect(result).toMatchObject({ ok: true, healthAttempts: 3 });
});

test("an old commit that never rolls over fails at health and names both commits", async () => {
  const result = await run(
    withCommit(() => OLD),
    { expectedCommit: NEW, maxHealthAttempts: 4 },
  );
  expect(result).toMatchObject({ ok: false, step: "health" });
  if (!result.ok) {
    expect(result.detail).toContain(`live commit ${OLD}`);
    expect(result.detail).toContain(NEW);
  }
});

test("a server that reports no commit fails when a commit is expected", async () => {
  for (const handler of [withCommit(() => null), good]) {
    const result = await run(handler, { expectedCommit: NEW, maxHealthAttempts: 2 });
    expect(result).toMatchObject({ ok: false, step: "health" });
    if (!result.ok) expect(result.detail).toContain("unknown");
  }
});

test("without an expected commit, any reported commit passes", async () => {
  const result = await run(withCommit(() => OLD));
  expect(result).toMatchObject({ ok: true, healthAttempts: 1 });
});

test("a short live sha matches the full expected sha", async () => {
  const result = await run(
    withCommit(() => NEW.slice(0, 12)),
    { expectedCommit: NEW.toUpperCase() },
  );
  expect(result).toMatchObject({ ok: true });
});
