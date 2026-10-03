import type { term } from "../schema/index.ts";

export type TermRow = typeof term.$inferSelect;

/** Term containing today (inclusive), else the next term to start, else null. Dates are YYYY-MM-DD. */
export function pickTerm(terms: TermRow[], today: string): TermRow | null {
  const current = terms.find((t) => t.starts <= today && today <= t.ends);
  if (current) return current;
  const upcoming = terms
    .filter((t) => t.starts > today)
    .sort((a, b) => (a.starts < b.starts ? -1 : 1));
  return upcoming[0] ?? null;
}
