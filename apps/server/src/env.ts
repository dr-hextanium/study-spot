import { z } from "zod";

/** An origin such as https://study-spot.pages.dev: scheme, host, port, no path or trailing slash. */
const Origin = z
  .url({ protocol: /^https?$/ })
  .refine((u) => new URL(u).origin === u, "must be an origin with no path");

const Base = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  WEB_ORIGIN: Origin,
  /**
   * Public base URL of the data site. Must pass the bundle's httpUrl check (a dotted
   * host), so local dev uses http://data.localhost:8788. Trailing slashes are removed.
   */
  DATA_BASE_URL: z.httpUrl().transform((u) => u.replace(/\/+$/, "")),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  CAMPUS_ID: z.string().min(1).default("sbu"),
});

const PagesEnv = Base.extend({
  PUBLISH_TARGET: z.literal("pages"),
  CF_ACCOUNT_ID: z.string().min(1),
  CF_API_TOKEN: z.string().min(1),
  CF_DATA_PROJECT: z.string().min(1),
});

const FsEnv = Base.extend({
  PUBLISH_TARGET: z.literal("fs"),
  FS_PUBLISH_DIR: z.string().min(1),
});

export const Env = z.discriminatedUnion("PUBLISH_TARGET", [PagesEnv, FsEnv]);
export type Env = z.infer<typeof Env>;

export type EnvResult = { ok: true; env: Env } | { ok: false; error: string };

/** Validates the process environment. Empty strings count as unset. */
export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") cleaned[key] = value;
  }
  const parsed = Env.safeParse(cleaned);
  if (parsed.success) return { ok: true, env: parsed.data };
  return { ok: false, error: z.prettifyError(parsed.error) };
}
