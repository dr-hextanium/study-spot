export type HostCheck = { ok: true; host: string } | { ok: false; error: string };

const STRONG_SSL = new Set(["require", "verify-ca", "verify-full"]);

/** Neon's pooled hostname is the direct one with -pooler after the endpoint id. */
function normalize(host: string): string {
  return host.toLowerCase().replace(/-pooler(?=\.)/, "");
}

/**
 * Guards a migration or dump against the wrong database. Compares only the host,
 * and never puts the URL (which holds the password) in an error.
 */
export function checkDbHost(databaseUrl: string, expectedHost: string): HostCheck {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, error: "DATABASE_URL is not a valid URL" };
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return { ok: false, error: "DATABASE_URL is not a postgres:// URL" };
  }
  // postgres-js uses the last sslmode, so a repeated one could hide a weak value.
  const sslmodes = parsed.searchParams.getAll("sslmode");
  if (sslmodes.length > 1) {
    return { ok: false, error: "DATABASE_URL must set sslmode exactly once" };
  }
  if (!STRONG_SSL.has(sslmodes[0] ?? "")) {
    return { ok: false, error: "DATABASE_URL must set sslmode=require (or stronger)" };
  }
  const actual = normalize(parsed.hostname);
  const expected = normalize(expectedHost);
  if (actual !== expected) {
    return { ok: false, error: `database host ${actual} is not the expected ${expected}` };
  }
  return { ok: true, host: actual };
}
