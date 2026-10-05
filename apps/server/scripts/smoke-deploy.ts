import { z } from "zod";
import { checkDeploy } from "../src/deploy/check.ts";

/**
 * Post-deploy smoke against the live stack. Usage:
 * API_BASE_URL=... WEB_ORIGIN=... DATA_BASE_URL=... node apps/server/scripts/smoke-deploy.ts
 * SMOKE_WAIT_SECONDS (default 120) is how long to wait for a sleeping API to wake.
 * EXPECTED_COMMIT (optional) makes the smoke wait until /health reports that commit.
 */
const Url = z.url({ protocol: /^https?$/ });
const Args = z.object({
  API_BASE_URL: Url,
  WEB_ORIGIN: Url.refine((u) => new URL(u).origin === u, "must be an origin with no path"),
  DATA_BASE_URL: Url,
  SMOKE_WAIT_SECONDS: z.coerce.number().int().min(5).max(600).default(120),
  EXPECTED_COMMIT: z
    .string()
    .regex(/^[0-9a-fA-F]{7,40}$/, "must be a git commit sha")
    .optional(),
});

const cleaned: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && value !== "") cleaned[key] = value;
}
const parsed = Args.safeParse(cleaned);
if (!parsed.success) {
  console.error(
    `smoke:deploy needs API_BASE_URL, WEB_ORIGIN, DATA_BASE_URL:\n${z.prettifyError(parsed.error)}`,
  );
  process.exit(1);
}
const env = parsed.data;
const result = await checkDeploy({
  apiBaseUrl: env.API_BASE_URL,
  webOrigin: env.WEB_ORIGIN,
  dataBaseUrl: env.DATA_BASE_URL,
  maxWaitMs: env.SMOKE_WAIT_SECONDS * 1000,
  ...(env.EXPECTED_COMMIT === undefined ? {} : { expectedCommit: env.EXPECTED_COMMIT }),
});
if (!result.ok) {
  console.error(`deploy smoke failed at ${result.step}: ${result.detail}`);
  process.exit(1);
}
console.log(
  `deploy smoke ok: ${result.spots} spots, bundle ${result.hash}, health after ${result.healthAttempts} attempt(s)`,
);
