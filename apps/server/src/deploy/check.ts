import { BundlePointer, parseBundle } from "@study-spot/core";
import { z } from "zod";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type CheckOptions = {
  apiBaseUrl: string;
  webOrigin: string;
  dataBaseUrl: string;
  fetch?: FetchLike;
  /** Wall-clock budget for the health loop. A Render free instance needs about a minute to wake. */
  maxWaitMs?: number;
  /** Optional extra cap on health attempts; the deadline is the real bound. */
  maxHealthAttempts?: number;
  healthIntervalMs?: number;
  /** Per-request timeout, applied to every fetch and its body read. */
  requestTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Injectable for tests. */
  timeoutSignal?: (ms: number) => AbortSignal;
  /**
   * When set, /health must report this commit: the loop keeps polling while the
   * old deploy still answers, until the new one is live or the deadline passes.
   */
  expectedCommit?: string;
};

export type CheckStep = "health" | "cors" | "pointer" | "bundle";

export type CheckResult =
  | { ok: true; hash: string; spots: number; healthAttempts: number }
  | { ok: false; step: CheckStep; detail: string };

/** Older servers send no commit; that still counts as healthy when no commit is expected. */
const Health = z.object({ ok: z.literal(true), commit: z.string().nullable().optional() });

/** Render may report a full or short SHA; match on the shared prefix of at least 7 characters. */
function sameCommit(live: string, expected: string): boolean {
  const a = live.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 7 && long.startsWith(short);
}

const FOREIGN_ORIGIN = "https://not-the-web-origin.example";

function fail(step: CheckStep, detail: string): CheckResult {
  return { ok: false, step, detail };
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * Post-deploy checks, in order: the API answers (retrying through a cold start),
 * CORS allows exactly the PWA origin, the data pointer is valid and uncached, and
 * the hashed bundle it names parses with the core schema and is immutable.
 */
export async function checkDeploy(opts: CheckOptions): Promise<CheckResult> {
  const rawFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());
  const timeoutSignal = opts.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms));
  const requestTimeoutMs = opts.requestTimeoutMs ?? 20_000;
  const maxAttempts = opts.maxHealthAttempts ?? Number.POSITIVE_INFINITY;
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  const interval = opts.healthIntervalMs ?? 5000;
  const api = trimSlash(opts.apiBaseUrl);
  const data = trimSlash(opts.dataBaseUrl);

  /** Every request gets its own timeout signal. */
  const doFetch = (url: string, init: RequestInit = {}): Promise<Response> =>
    rawFetch(url, { ...init, signal: timeoutSignal(requestTimeoutMs) });

  /** Fetch and read the JSON body, turning network errors into a step failure. */
  const get = async (
    step: CheckStep,
    url: string,
    init?: RequestInit,
  ): Promise<{ res: Response; body: unknown } | CheckResult> => {
    try {
      const res = await doFetch(url, init);
      return { res, body: init?.method === "OPTIONS" ? undefined : await readJson(res) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(step, `could not reach ${url}: ${message}; check API_BASE_URL/DATA_BASE_URL`);
    }
  };

  const start = now();
  const deadline = start + maxWaitMs;
  let healthAttempts = 0;
  let healthy = false;
  let lastProblem = "no attempt made";
  while (healthAttempts < maxAttempts && !healthy) {
    healthAttempts += 1;
    try {
      const res = await doFetch(`${api}/health`);
      const health = Health.safeParse(await readJson(res));
      if (!res.ok) {
        lastProblem = `status ${res.status}`;
      } else if (!health.success) {
        lastProblem = "unexpected /health body";
      } else if (opts.expectedCommit === undefined) {
        healthy = true;
      } else {
        const live = health.data.commit ?? null;
        healthy = live !== null && sameCommit(live, opts.expectedCommit);
        if (!healthy) {
          lastProblem = `live commit ${live ?? "unknown (RENDER_GIT_COMMIT unset?)"}, expected ${opts.expectedCommit}`;
        }
      }
    } catch (error) {
      healthy = false;
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    if (healthy || healthAttempts >= maxAttempts || now() + interval >= deadline) break;
    await sleep(interval);
  }
  if (!healthy) {
    const elapsed = Math.round((now() - start) / 1000);
    return fail(
      "health",
      `no healthy /health answer after ${healthAttempts} attempts and ${elapsed}s; last: ${lastProblem}`,
    );
  }

  const preflight = (origin: string) =>
    get("cors", `${api}/survey/spots/x/identity`, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
  const own = await preflight(opts.webOrigin);
  if ("ok" in own) return own;
  const allowed = own.res.headers.get("access-control-allow-origin");
  if (allowed !== opts.webOrigin) {
    return fail(
      "cors",
      `WEB_ORIGIN ${opts.webOrigin} was answered with allow-origin ${allowed ?? "none"}; set WEB_ORIGIN on the API to the exact PWA origin`,
    );
  }
  if (!(own.res.headers.get("access-control-allow-methods") ?? "").includes("PUT")) {
    return fail("cors", "preflight does not allow PUT");
  }
  const allowedHeaders = (own.res.headers.get("access-control-allow-headers") ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase());
  if (!allowedHeaders.includes("authorization")) {
    return fail("cors", "preflight does not allow the authorization header");
  }
  const foreignRes = await preflight(FOREIGN_ORIGIN);
  if ("ok" in foreignRes) return foreignRes;
  const foreign = foreignRes.res.headers.get("access-control-allow-origin");
  if (foreign !== null) return fail("cors", `a foreign origin was allowed (${foreign})`);

  const pointerGot = await get("pointer", `${data}/bundle-latest.json`);
  if ("ok" in pointerGot) return pointerGot;
  const pointerRes = pointerGot.res;
  if (!pointerRes.ok) {
    return fail(
      "pointer",
      `bundle-latest.json answered ${pointerRes.status}; if nothing was published yet, run POST /admin/publish`,
    );
  }
  if (pointerRes.headers.get("access-control-allow-origin") !== "*") {
    return fail(
      "pointer",
      "bundle-latest.json lacks access-control-allow-origin: *; check the _headers file in the data site",
    );
  }
  if (!(pointerRes.headers.get("cache-control") ?? "").includes("no-cache")) {
    return fail("pointer", "bundle-latest.json is cacheable; clients would keep stale pointers");
  }
  const pointer = BundlePointer.safeParse(pointerGot.body);
  if (!pointer.success) return fail("pointer", z.prettifyError(pointer.error));

  const expectedUrl = `bundle.${pointer.data.hash}.json`;
  if (pointer.data.url !== expectedUrl) {
    return fail("pointer", `pointer url ${pointer.data.url} is not ${expectedUrl}`);
  }

  const bundleUrl = new URL(pointer.data.url, `${data}/`).toString();
  const bundleGot = await get("bundle", bundleUrl);
  if ("ok" in bundleGot) return bundleGot;
  const bundleRes = bundleGot.res;
  if (!bundleRes.ok) {
    return fail(
      "bundle",
      `${pointer.data.url} answered ${bundleRes.status}: the pointer names a file this deployment does not hold`,
    );
  }
  if (!(bundleRes.headers.get("cache-control") ?? "").includes("immutable")) {
    return fail("bundle", "the hashed bundle is not served as immutable");
  }
  const parsed = parseBundle(bundleGot.body);
  if (!parsed.ok) return fail("bundle", `${parsed.reason}: ${parsed.detail}`);

  return { ok: true, hash: pointer.data.hash, spots: parsed.bundle.spots.length, healthAttempts };
}
