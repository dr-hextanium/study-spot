import { BundlePointer, parseBundle } from "@study-spot/core";
import { z } from "zod";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type CheckOptions = {
  apiBaseUrl: string;
  webOrigin: string;
  dataBaseUrl: string;
  fetch?: FetchLike;
  /** A Render free instance needs about a minute to wake; the default covers two. */
  maxHealthAttempts?: number;
  healthIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type CheckStep = "health" | "cors" | "pointer" | "bundle";

export type CheckResult =
  | { ok: true; hash: string; spots: number; healthAttempts: number }
  | { ok: false; step: CheckStep; detail: string };

const Health = z.object({ ok: z.literal(true) });
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
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const attempts = opts.maxHealthAttempts ?? 24;
  const interval = opts.healthIntervalMs ?? 5000;
  const api = trimSlash(opts.apiBaseUrl);
  const data = trimSlash(opts.dataBaseUrl);

  let healthAttempts = 0;
  let healthy = false;
  while (healthAttempts < attempts && !healthy) {
    healthAttempts += 1;
    try {
      const res = await doFetch(`${api}/health`, {});
      healthy = res.ok && Health.safeParse(await readJson(res)).success;
    } catch {
      healthy = false;
    }
    if (!healthy && healthAttempts < attempts) await sleep(interval);
  }
  if (!healthy) return fail("health", `no healthy /health answer after ${healthAttempts} attempts`);

  const preflight = (origin: string) =>
    doFetch(`${api}/survey/spots/x/identity`, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
  const own = await preflight(opts.webOrigin);
  const allowed = own.headers.get("access-control-allow-origin");
  if (allowed !== opts.webOrigin) {
    return fail(
      "cors",
      `WEB_ORIGIN ${opts.webOrigin} was answered with allow-origin ${allowed ?? "none"}; set WEB_ORIGIN on the API to the exact PWA origin`,
    );
  }
  if (!(own.headers.get("access-control-allow-methods") ?? "").includes("PUT")) {
    return fail("cors", "preflight does not allow PUT");
  }
  const foreign = (await preflight(FOREIGN_ORIGIN)).headers.get("access-control-allow-origin");
  if (foreign !== null) return fail("cors", `a foreign origin was allowed (${foreign})`);

  const pointerRes = await doFetch(`${data}/bundle-latest.json`, {});
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
  const pointer = BundlePointer.safeParse(await readJson(pointerRes));
  if (!pointer.success) return fail("pointer", z.prettifyError(pointer.error));

  const expectedUrl = `bundle.${pointer.data.hash}.json`;
  if (pointer.data.url !== expectedUrl) {
    return fail("pointer", `pointer url ${pointer.data.url} is not ${expectedUrl}`);
  }

  const bundleUrl = new URL(pointer.data.url, `${data}/`).toString();
  const bundleRes = await doFetch(bundleUrl, {});
  if (!bundleRes.ok) {
    return fail(
      "bundle",
      `${pointer.data.url} answered ${bundleRes.status}: the pointer names a file this deployment does not hold`,
    );
  }
  if (!(bundleRes.headers.get("cache-control") ?? "").includes("immutable")) {
    return fail("bundle", "the hashed bundle is not served as immutable");
  }
  const parsed = parseBundle(await readJson(bundleRes));
  if (!parsed.ok) return fail("bundle", `${parsed.reason}: ${parsed.detail}`);

  return { ok: true, hash: pointer.data.hash, spots: parsed.bundle.spots.length, healthAttempts };
}
