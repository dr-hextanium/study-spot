import { z } from "zod";

const Origin = z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, ""));

/**
 * The build-time contract with the deploy plan. The two origins are required.
 * VITE_PICK_PING turns the anonymous pick ping on; it is off unless set to "1".
 */
export const WebEnv = z.object({
  VITE_API_BASE_URL: Origin,
  VITE_DATA_BASE_URL: Origin,
  VITE_PICK_PING: z.enum(["0", "1"]).default("0"),
});
export type WebEnv = z.infer<typeof WebEnv>;

export type EnvResult = { ok: true; env: WebEnv } | { ok: false; error: string };

export function parseWebEnv(source: Readonly<Record<string, unknown>>): EnvResult {
  const parsed = WebEnv.safeParse(source);
  return parsed.success
    ? { ok: true, env: parsed.data }
    : { ok: false, error: z.prettifyError(parsed.error) };
}
