import type { AttentionRow, DraftRow, StaleRow, SurveyHome } from "./view.ts";

export const DUE_AFTER_DAYS = 90;

/** Never checked, unreadable, or last checked more than 90 days before `now`. */
export function isDue(oldestVerifiedAt: string | null, now: Date): boolean {
  if (oldestVerifiedAt === null) return true;
  const at = Date.parse(oldestVerifiedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at > DUE_AFTER_DAYS * 86_400_000;
}

/** The Keep going card: the draft with the newest write on this phone, else my most recent server edit. */
export function keepGoing(drafts: readonly DraftRow[]): DraftRow | null {
  let best: DraftRow | null = null;
  for (const d of drafts) {
    if (d.lastSeq !== null && (best?.lastSeq ?? -1) < d.lastSeq) best = d;
  }
  if (best !== null) return best;
  for (const d of drafts) {
    if (!d.editedByMe || d.updatedAt === null) continue;
    if (best === null || (best.updatedAt ?? "") < d.updatedAt) best = d;
  }
  return best;
}

export const HOME_FILTER = ["all", "attention", "drafts", "due"] as const;
export type HomeFilter = (typeof HOME_FILTER)[number];
export const HOME_FILTERS: readonly HomeFilter[] = HOME_FILTER;

export type HomeFact =
  | { kind: "conflict" }
  | { kind: "failed"; count: number }
  | { kind: "unreviewed"; editor: string }
  | { kind: "hours_unconfirmed"; term: string }
  | { kind: "progress"; done: number; total: number }
  | { kind: "draft" }
  | { kind: "checked"; at: string }
  | { kind: "never_checked" };

/** `checked` is null for a draft; for a published spot `at` is its oldest check, null when never checked. */
export type HomeRow = {
  spotId: string;
  name: string;
  coverPhotoId: string | null;
  fact: HomeFact;
  checked: { at: string | null } | null;
};

function attentionFact(r: AttentionRow): HomeFact {
  switch (r.reason) {
    case "conflict":
      return { kind: "conflict" };
    case "failed":
      return { kind: "failed", count: r.count };
    case "unreviewed":
      return { kind: "unreviewed", editor: r.editor };
    case "hours_unconfirmed":
      return { kind: "hours_unconfirmed", term: r.term };
  }
}

const draftFact = (d: DraftRow): HomeFact =>
  d.progress === null
    ? { kind: "draft" }
    : { kind: "progress", done: d.progress.done, total: d.progress.total };

const staleFact = (s: StaleRow): HomeFact =>
  s.oldestVerifiedAt === null
    ? { kind: "never_checked" }
    : { kind: "checked", at: s.oldestVerifiedAt };

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Home's one list. "all" has one row per spot with its most urgent fact;
 * "due" is published spots never checked or checked over 90 days ago.
 * Counts are distinct spots and follow the search.
 */
export function homeList(
  home: SurveyHome,
  opts: { filter: HomeFilter; query: string; now: Date },
): { rows: HomeRow[]; counts: Record<HomeFilter, number> } {
  const q = normalize(opts.query.trim());
  const match = (r: { name: string }) => q === "" || normalize(r.name).includes(q);
  const checkedOf = new Map(home.stale.map((s) => [s.spotId, { at: s.oldestVerifiedAt }]));
  const row = (
    r: { spotId: string; name: string; coverPhotoId: string | null },
    fact: HomeFact,
  ): HomeRow => ({
    spotId: r.spotId,
    name: r.name,
    coverPhotoId: r.coverPhotoId,
    fact,
    checked: checkedOf.get(r.spotId) ?? null,
  });
  const attention = home.attention.filter(match).map((r) => row(r, attentionFact(r)));
  const drafts = home.drafts.filter(match).map((d) => row(d, draftFact(d)));
  const published = home.stale.filter(match);
  const due = published
    .filter((s) => isDue(s.oldestVerifiedAt, opts.now))
    .map((s) => row(s, staleFact(s)));
  const seen = new Set<string>();
  const all: HomeRow[] = [];
  for (const r of [...attention, ...drafts, ...published.map((s) => row(s, staleFact(s)))]) {
    if (seen.has(r.spotId)) continue;
    seen.add(r.spotId);
    all.push(r);
  }
  const lists: Record<HomeFilter, HomeRow[]> = { all, attention, drafts, due };
  const distinct = (rows: HomeRow[]) => new Set(rows.map((r) => r.spotId)).size;
  return {
    rows: lists[opts.filter],
    counts: {
      all: all.length,
      attention: distinct(attention),
      drafts: distinct(drafts),
      due: distinct(due),
    },
  };
}
