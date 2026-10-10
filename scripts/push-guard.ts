import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pre-push guard for the free tiers: every push to main builds the PWA on
 * Cloudflare Pages (500 builds a month), so main takes at most MAX_PER_DAY
 * pushes per local calendar day. Batch commits and push once. The owner can
 * override one push with PERCH_PUSH_OVERRIDE=1. Pushes to other branches are free.
 */
export const MAX_PER_DAY = 10;

export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Remote refs this push updates, from git's pre-push stdin lines. */
export function pushesMain(stdin: string): boolean {
  return stdin
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .some((parts) => parts[2] === "refs/heads/main");
}

export function pushesToday(log: string, day: string): number {
  return log.split("\n").filter((line) => line.startsWith(day)).length;
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  if (!pushesMain(Buffer.concat(chunks).toString("utf8"))) return;

  const gitDir = process.env.GIT_DIR ?? ".git";
  const logPath = join(gitDir, "perch-pushes.log");
  const now = new Date();
  const day = localDay(now);
  const used = existsSync(logPath) ? pushesToday(readFileSync(logPath, "utf8"), day) : 0;

  if (used >= MAX_PER_DAY && process.env.PERCH_PUSH_OVERRIDE !== "1") {
    console.error(
      `push-guard: ${used} pushes to main today, the limit is ${MAX_PER_DAY} (Cloudflare Pages builds). ` +
        "Batch your commits and push tomorrow, or set PERCH_PUSH_OVERRIDE=1 for one owner-approved push.",
    );
    process.exit(1);
  }
  appendFileSync(logPath, `${day} ${now.toISOString()}\n`);
  console.log(`push-guard: push ${used + 1} of ${MAX_PER_DAY} to main today`);
}

if (process.argv[1]?.endsWith("push-guard.ts") === true) {
  await main();
}
