export type HostCheck = { ok: true; host: string } | { ok: false; error: string };

export type HostCheckOptions = {
  /** Migrations and dumps need a session, which Neon's pooler (PgBouncer) does not give. */
  requireDirect?: boolean;
};

const STRONG_SSL = new Set(["require", "verify-ca", "verify-full"]);

/**
 * libpq (psql, pg_dump) honors query keys such as host, hostaddr, port, service, and
 * dbname over the authority, so only the two keys Neon's strings carry are allowed.
 */
const ALLOWED_KEYS = new Set(["sslmode", "channel_binding"]);

/** Neon's pooled hostname is the direct one with -pooler after the endpoint id. */
function normalize(host: string): string {
  return host.toLowerCase().replace(/-pooler(?=\.)/, "");
}

/** libpq expands a database name holding = or a URL into a whole connection string. */
function plainDbName(pathname: string): boolean {
  let name: string;
  try {
    name = decodeURIComponent(pathname.slice(1));
  } catch {
    return false;
  }
  return /^[A-Za-z0-9_.-]+$/.test(name);
}

/**
 * Guards a migration or dump against the wrong database. Compares only the host,
 * and never puts the URL (which holds the password) in an error.
 */
export function checkDbHost(
  databaseUrl: string,
  expectedHost: string,
  options: HostCheckOptions = {},
): HostCheck {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, error: "DATABASE_URL is not a valid URL" };
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, error: "DATABASE_URL is not a postgres:// URL" };
  }
  for (const key of new Set(parsed.searchParams.keys())) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, error: `DATABASE_URL must not set the ${key} parameter` };
    }
    // postgres-js uses the last value, so a repeated key could hide a weak one.
    if (parsed.searchParams.getAll(key).length > 1) {
      return { ok: false, error: `DATABASE_URL must set ${key} exactly once` };
    }
  }
  if (!plainDbName(parsed.pathname)) {
    return { ok: false, error: "DATABASE_URL database name must be a plain name" };
  }
  const sslmodes = parsed.searchParams.getAll("sslmode");
  if (!STRONG_SSL.has(sslmodes[0] ?? "")) {
    return { ok: false, error: "DATABASE_URL must set sslmode=require (or stronger)" };
  }
  if (options.requireDirect === true && parsed.hostname.toLowerCase().includes("-pooler")) {
    return { ok: false, error: "DATABASE_URL must use the direct host, not the -pooler one" };
  }
  const actual = normalize(parsed.hostname);
  const expected = normalize(expectedHost);
  if (actual !== expected) {
    return { ok: false, error: `database host ${actual} is not the expected ${expected}` };
  }
  return { ok: true, host: actual };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * For scripts that write test rows (smoke-publish): only a database on this machine
 * or the CI service container. No query keys, so nothing can point the driver at
 * another host. Never puts the URL in an error.
 */
export function checkLocalDb(databaseUrl: string): HostCheck {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, error: "DATABASE_URL is not a valid URL" };
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, error: "DATABASE_URL is not a postgres:// URL" };
  }
  const host = parsed.hostname.toLowerCase();
  if (!LOOPBACK.has(host)) {
    return { ok: false, error: "DATABASE_URL must point at localhost for this script" };
  }
  if ([...parsed.searchParams.keys()].length > 0) {
    return { ok: false, error: "DATABASE_URL for a local database takes no query parameters" };
  }
  return { ok: true, host };
}
