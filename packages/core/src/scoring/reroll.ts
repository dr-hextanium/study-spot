import { z } from "zod";
import type { Candidate } from "./rank.ts";

export const RECENT_LIMIT = 5;
export const REROLL_MIN_POOL = 5;
export const REROLL_POOL_SHARE = 0.3;
export const REROLL_FLOOR = 0.4;
const ALTERNATES = 2;

export const RecentPicks = z.array(z.uuid()).max(RECENT_LIMIT);
export type RecentPicks = z.infer<typeof RecentPicks>;

/** Newest first, at most 5, no duplicates. */
export function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
}

export function weightedSample<T>(
  items: readonly T[],
  weight: (item: T) => number,
  rand: () => number,
): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
  if (total <= 0) return items[0] ?? null;
  let x = rand() * total;
  for (const item of items) {
    x -= Math.max(0, weight(item));
    if (x < 0) return item;
  }
  return items[items.length - 1] ?? null;
}

/** Top max(5, 30%) by score, at least 40% of the top score, minus recent picks. */
export function rerollPool(ranked: readonly Candidate[], recent: readonly string[]): Candidate[] {
  const top = ranked[0];
  if (top === undefined) return [];
  const size = Math.max(REROLL_MIN_POOL, Math.ceil(ranked.length * REROLL_POOL_SHARE));
  const pool = ranked.slice(0, size).filter((c) => c.score >= REROLL_FLOOR * top.score);
  const fresh = pool.filter((c) => !recent.includes(c.spot.id));
  if (fresh.length > 0) return fresh;
  // Everything good was shown lately: bring back the one shown longest ago.
  const oldest = [...pool].sort((a, b) => recent.indexOf(b.spot.id) - recent.indexOf(a.spot.id))[0];
  return oldest === undefined ? [] : [oldest];
}

export type Pick = { primary: Candidate; alternates: Candidate[] };

function withAlternates(primary: Candidate, ranked: readonly Candidate[]): Pick {
  return {
    primary,
    alternates: ranked.filter((c) => c.spot.id !== primary.spot.id).slice(0, ALTERNATES),
  };
}

export function topPick(ranked: readonly Candidate[]): Pick | null {
  const first = ranked[0];
  return first === undefined ? null : withAlternates(first, ranked);
}

/**
 * One weighted draw. Something else passes rankSpots().ranked; Surprise me passes
 * surpriseRank().ranked. `current` (the spot on screen) is avoided like the
 * newest recent pick, so a tap never re-shows it while anything else qualifies.
 */
export function draw(
  ranked: readonly Candidate[],
  recent: readonly string[],
  rand: () => number,
  current: string | null = null,
): Pick | null {
  const avoid = current === null ? recent : [current, ...recent.filter((id) => id !== current)];
  const primary = weightedSample(rerollPool(ranked, avoid), (c) => c.score, rand);
  return primary === null ? null : withAlternates(primary, ranked);
}
