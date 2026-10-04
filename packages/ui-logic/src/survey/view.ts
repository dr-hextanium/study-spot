import {
  ATTRIBUTE_GROUP,
  type AttributeGroup,
  campusDate,
  type IdentitySection,
  missingV0Fields,
  type SpotList,
  SURVEY_SECTION,
  type SurveyorPublic,
  type SurveySection,
  type SurveySpot,
  type TermRef,
  V0_FIELD,
  V0_FIELD_SECTION,
  type V0Field,
  v0InputOf,
} from "@study-spot/core";
import type { OutboxSnapshot } from "./outbox.ts";
import { bySeq, isLocalId, type WriteRecord, type WriteState } from "./writes.ts";

/** Fields that count toward "{count} of 7 required parts": every v0 field filled by a section. */
export const REQUIRED_PARTS: readonly V0Field[] = V0_FIELD.filter(
  (f) => V0_FIELD_SECTION[f] !== null,
);

export type PendingPhoto = { client_write_id: string; taken_at: string; state: WriteState };

/**
 * A spot as this phone sees it: the server's copy with queued writes applied.
 * `spot` is never parsed with SurveySpot: a local draft has a local id and version 0.
 */
export type SpotView = {
  spot: SurveySpot;
  /** Version of the server copy; null for a draft that only exists on this phone. */
  serverVersion: number | null;
  localOnly: boolean;
  publishQueued: boolean;
  reviewQueued: boolean;
  pendingPhotos: PendingPhoto[];
  /** This spot's queued writes, oldest first. */
  records: WriteRecord[];
};

function isGroup(section: string): section is AttributeGroup {
  return (ATTRIBUTE_GROUP as readonly string[]).includes(section);
}

/** The server shape for a draft created on this phone. */
export function draftSpot(
  localId: string,
  identity: IdentitySection,
  createdAt: string,
  term: TermRef | null,
): SurveySpot {
  return {
    ...identity,
    id: localId,
    status: "draft",
    review_state: "unreviewed",
    version: 0,
    last_edited_by: null,
    last_edited_by_name: null,
    reviewed_by: null,
    reviewed_by_name: null,
    updated_at: createdAt,
    eligibility: null,
    eligibility_scope: null,
    eligibility_verified: false,
    entry_method: null,
    reservable: false,
    reservation_system: null,
    reservation_url: null,
    seat_count: null,
    seat_types: [],
    table_configs: [],
    effective_capacity: null,
    max_group_size: null,
    spread_out_room: null,
    outlet_coverage_pct: null,
    usb_outlets: null,
    wifi_mbps: null,
    cell_signal: null,
    noise_policy: null,
    natural_light: null,
    lighting: null,
    temperature: null,
    temperature_consistent: null,
    windows_view: null,
    calls_ok: null,
    group_work_ok: null,
    whiteboard: null,
    food_policy: null,
    amenities: [],
    step_free: null,
    elevator: null,
    accessible_seating: null,
    open_past_midnight: null,
    staffed_late: null,
    lit_route_to_residences: null,
    term,
    hours: [],
    estimates: [],
    verified: { identity: createdAt },
    photos: [],
    missing: [],
  };
}

/** Still on its way to the server: pending or mid-send. */
function isLive(r: Pick<WriteRecord, "state">): boolean {
  return r.state === "pending" || r.state === "syncing";
}

function applyWrite(spot: SurveySpot, r: WriteRecord): SurveySpot {
  const stamp = (groups: readonly AttributeGroup[]) => {
    const verified = { ...spot.verified };
    for (const g of groups) verified[g] = r.created_at;
    return verified;
  };
  switch (r.kind) {
    case "spot.section": {
      const w = r.payload;
      switch (w.section) {
        case "hours":
          if (spot.term?.id !== w.data.term_id) return spot;
          return { ...spot, hours: w.data.rows, verified: stamp(["hours"]) };
        case "estimates": {
          const kept = spot.estimates.filter(
            (e) => !w.data.cells.some((c) => c.day_type === e.day_type && c.block === e.block),
          );
          const added = w.data.cells.map((c) => ({ ...c, created_at: r.created_at }));
          return { ...spot, estimates: [...kept, ...added] };
        }
        default:
          return { ...spot, ...w.data, verified: stamp([w.section]) };
      }
    }
    case "spot.verify":
      return { ...spot, verified: stamp(r.payload.groups) };
    case "photo.cover":
      return {
        ...spot,
        photos: spot.photos.map((p) => ({ ...p, is_cover: p.id === r.payload.photo_id })),
      };
    default:
      return spot;
  }
}

/**
 * Applies this spot's queued writes (all states: they are still on this phone)
 * to the server copy, or to a draft built from the queued create.
 */
export function buildSpotView(
  server: SurveySpot | null,
  allRecords: readonly WriteRecord[],
  spotId: string,
  term: TermRef | null,
): SpotView | null {
  const records = allRecords.filter((r) => r.spot_id === spotId).sort(bySeq);
  const create = records.find((r) => r.kind === "spot.create");
  const base =
    server ??
    (create?.kind === "spot.create"
      ? draftSpot(spotId, create.payload.identity, create.created_at, term)
      : null);
  if (base === null) return null;
  // The user's values show whatever the write's state, so nothing they typed vanishes.
  let spot = base;
  for (const r of records) spot = applyWrite(spot, r);
  // Readiness and check dates count only writes that can still land. A failed or
  // conflicted write is shown (its section's `sync` says so) but is not "done" to the server.
  let landing = base;
  for (const r of records) if (isLive(r)) landing = applyWrite(landing, r);
  spot = {
    ...spot,
    verified: landing.verified,
    missing: missingV0Fields(v0InputOf(landing)),
  };
  return {
    spot,
    serverVersion: server?.version ?? null,
    localOnly: server === null,
    publishQueued: records.some((r) => r.kind === "spot.publish" && isLive(r)),
    reviewQueued: records.some((r) => r.kind === "spot.review" && isLive(r)),
    pendingPhotos: records.flatMap((r) =>
      r.kind === "photo.upload"
        ? [{ client_write_id: r.client_write_id, taken_at: r.payload.taken_at, state: r.state }]
        : [],
    ),
    records,
  };
}

export type OverviewSection = SurveySection | "photos";
export type SectionGroup = "required" | "extras" | "optional";
export type SectionFill = "missing" | "partial" | "done";
export type SectionSync = "synced" | "saved_on_phone" | "syncing" | "failed" | "conflict";

export type SectionStatus = {
  section: OverviewSection;
  group: SectionGroup;
  fill: SectionFill;
  /** Last check of this attribute group; null for estimates and photos. */
  verifiedAt: string | null;
  checkedToday: boolean;
  sync: SectionSync;
};

const REQUIRED_SECTIONS: readonly SurveySection[] = SURVEY_SECTION.filter((s) =>
  REQUIRED_PARTS.some((f) => V0_FIELD_SECTION[f] === s),
);

/** Overview order: needed to publish, then photos and busyness, then optional (hours first). */
export const OVERVIEW_ORDER: readonly OverviewSection[] = [
  ...REQUIRED_SECTIONS,
  "photos",
  "estimates",
  ...SURVEY_SECTION.filter((s) => s !== "estimates" && !REQUIRED_SECTIONS.includes(s)),
];

function groupOf(section: OverviewSection): SectionGroup {
  if (section === "photos" || section === "estimates") return "extras";
  return REQUIRED_SECTIONS.includes(section) ? "required" : "optional";
}

function touches(r: WriteRecord, section: OverviewSection): boolean {
  switch (r.kind) {
    case "spot.create":
      return section === "identity";
    case "spot.section":
      return r.payload.section === section;
    case "spot.verify":
      return r.payload.groups.some((g) => g === section);
    case "photo.upload":
    case "photo.cover":
      return section === "photos";
    default:
      return false;
  }
}

const SYNC_RANK: Record<WriteState, SectionSync> = {
  conflict: "conflict",
  failed: "failed",
  syncing: "syncing",
  pending: "saved_on_phone",
};
const SYNC_ORDER: readonly SectionSync[] = ["conflict", "failed", "syncing", "saved_on_phone"];

function syncOf(records: readonly WriteRecord[], section: OverviewSection): SectionSync {
  const states = records.filter((r) => touches(r, section)).map((r) => SYNC_RANK[r.state]);
  return SYNC_ORDER.find((s) => states.includes(s)) ?? "synced";
}

const OPTIONAL_FIELDS = {
  amenities: ["amenities"],
  accessibility: ["step_free", "elevator", "accessible_seating"],
  late_night: ["open_past_midnight", "staffed_late", "lit_route_to_residences"],
} as const satisfies Partial<Record<SurveySection, readonly (keyof SurveySpot)[]>>;

function filled(value: unknown): boolean {
  return value !== null && !(Array.isArray(value) && value.length === 0);
}

function fillOf(view: SpotView, section: OverviewSection): SectionFill {
  const { spot } = view;
  switch (section) {
    case "photos":
      // A failed upload is listed for retry but is not a photo yet.
      return spot.photos.length + view.pendingPhotos.filter(isLive).length > 0 ? "done" : "missing";
    case "estimates":
      return spot.estimates.length === 0
        ? "missing"
        : spot.estimates.length < 8
          ? "partial"
          : "done";
    case "hours":
      return spot.hours.length > 0 ? "done" : "missing";
    case "amenities":
    case "accessibility":
    case "late_night":
      return OPTIONAL_FIELDS[section].some((f) => filled(spot[f])) ? "done" : "missing";
    default: {
      const required = REQUIRED_PARTS.filter((f) => V0_FIELD_SECTION[f] === section);
      const gaps = required.filter((f) => spot.missing.includes(f)).length;
      return gaps === 0 ? "done" : gaps < required.length ? "partial" : "missing";
    }
  }
}

/** Every overview row, in display order, with fill, check date, and sync state. */
export function sectionStatuses(view: SpotView, opts: { now: Date; tz: string }): SectionStatus[] {
  const today = campusDate(opts.now, opts.tz);
  return OVERVIEW_ORDER.map((section) => {
    const verifiedAt = isGroup(section) ? (view.spot.verified[section] ?? null) : null;
    return {
      section,
      group: groupOf(section),
      fill: fillOf(view, section),
      verifiedAt,
      checkedToday: verifiedAt !== null && campusDate(new Date(verifiedAt), opts.tz) === today,
      sync: syncOf(view.records, section),
    };
  });
}

export type PublishReadiness =
  | { kind: "published" }
  | { kind: "queued" }
  | { kind: "ready" }
  | { kind: "blocked"; missing: { field: V0Field; section: AttributeGroup | null }[] };

/** Same rule as the server (missingV0Fields), applied to this phone's view. */
export function publishReadiness(view: SpotView): PublishReadiness {
  if (view.spot.status === "published") return { kind: "published" };
  if (view.publishQueued) return { kind: "queued" };
  if (view.spot.missing.length === 0) return { kind: "ready" };
  return {
    kind: "blocked",
    missing: view.spot.missing.map((field) => ({ field, section: V0_FIELD_SECTION[field] })),
  };
}

/** "button": show Looks right. "own": show spot.review.own. "none": show nothing. */
export function reviewAction(view: SpotView, me: SurveyorPublic): "button" | "own" | "none" {
  if (view.spot.review_state === "reviewed" || view.reviewQueued) return "none";
  if (me.role === "admin") return "button";
  const editedHere = view.localOnly || view.records.some((r) => r.kind === "spot.section");
  return editedHere || view.spot.last_edited_by === me.id ? "own" : "button";
}

export type SyncHeader =
  | { kind: "signed_out" }
  | { kind: "failed"; count: number }
  | { kind: "unreadable"; count: number }
  | { kind: "offline" }
  | { kind: "syncing"; count: number }
  | { kind: "pending"; count: number }
  | { kind: "all_synced" };

/** The header line: what needs the surveyor first, then connectivity, then progress. */
export function syncHeader(s: OutboxSnapshot): SyncHeader {
  if (s.signedOut) return { kind: "signed_out" };
  const stuck = s.records.filter((r) => r.state === "failed" || r.state === "conflict").length;
  if (stuck > 0) return { kind: "failed", count: stuck };
  if (s.unreadable > 0) return { kind: "unreadable", count: s.unreadable };
  if (!s.online) return { kind: "offline" };
  const waiting = s.records.length;
  if (waiting === 0) return { kind: "all_synced" };
  return s.syncing ? { kind: "syncing", count: waiting } : { kind: "pending", count: waiting };
}

type Row = { spotId: string; name: string };
export type AttentionRow = Row &
  (
    | { reason: "conflict" }
    | { reason: "failed"; count: number }
    | { reason: "unreviewed"; editor: string }
    | { reason: "hours_unconfirmed"; term: string }
  );
export type StaleRow = Row & { oldestVerifiedAt: string | null };
export type DraftRow = Row & { localOnly: boolean; requiredDone: number | null };
export type SurveyHome = {
  attention: AttentionRow[];
  stale: StaleRow[];
  drafts: DraftRow[];
  /** Stored writes that could not be read (OutboxSnapshot.unreadable); show as a line in Needs attention. */
  unreadable: number;
};

const REASON_ORDER = ["conflict", "failed", "unreviewed", "hours_unconfirmed"] as const;
const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);

/**
 * Home lists. `details` holds cached full spots (for the drafts' required-part
 * counts); a draft without a cached detail shows no count.
 */
export function surveyHome(
  list: SpotList | null,
  records: readonly WriteRecord[],
  me: SurveyorPublic,
  details: ReadonlyMap<string, SurveySpot>,
  unreadable = 0,
): SurveyHome {
  const term = list?.term ?? null;
  const ordered = [...records].sort(bySeq);
  const nameOf = (spotId: string, fallback: string): string => {
    let name = fallback;
    for (const r of ordered) {
      if (r.spot_id !== spotId) continue;
      if (r.kind === "spot.create") name = r.payload.identity.official_name;
      if (r.kind === "spot.section" && r.payload.section === "identity") {
        name = r.payload.data.official_name;
      }
    }
    return name;
  };
  const attention: AttentionRow[] = [];
  const stale: StaleRow[] = [];
  const drafts: DraftRow[] = [];
  const requiredDone = (view: SpotView | null) =>
    view === null ? null : REQUIRED_PARTS.filter((f) => !view.spot.missing.includes(f)).length;
  const flag = (spotId: string, name: string): boolean => {
    const mine = records.filter((r) => r.spot_id === spotId);
    if (mine.some((r) => r.state === "conflict")) {
      attention.push({ spotId, name, reason: "conflict" });
      return true;
    }
    const failed = mine.filter((r) => r.state === "failed").length;
    if (failed > 0) attention.push({ spotId, name, reason: "failed", count: failed });
    return failed > 0;
  };

  for (const s of list?.spots ?? []) {
    const name = nameOf(s.id, s.official_name);
    if (!flag(s.id, name)) {
      if (
        s.review_state === "unreviewed" &&
        s.last_edited_by !== null &&
        s.last_edited_by !== me.id &&
        s.last_edited_by_name !== null
      ) {
        attention.push({ spotId: s.id, name, reason: "unreviewed", editor: s.last_edited_by_name });
      } else if (s.status === "published" && !s.hours_confirmed && term !== null) {
        attention.push({ spotId: s.id, name, reason: "hours_unconfirmed", term: term.name });
      }
    }
    if (s.status === "published") {
      stale.push({ spotId: s.id, name, oldestVerifiedAt: s.oldest_verified_at });
    } else {
      const detail = details.get(s.id) ?? null;
      drafts.push({
        spotId: s.id,
        name,
        localOnly: false,
        requiredDone: requiredDone(buildSpotView(detail, records, s.id, term)),
      });
    }
  }
  for (const r of records) {
    if (r.kind !== "spot.create" || !isLocalId(r.spot_id)) continue;
    const name = nameOf(r.spot_id, r.payload.identity.official_name);
    flag(r.spot_id, name);
    drafts.push({
      spotId: r.spot_id,
      name,
      localOnly: true,
      requiredDone: requiredDone(buildSpotView(null, records, r.spot_id, term)),
    });
  }

  attention.sort(
    (a, b) => REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason) || byName(a, b),
  );
  stale.sort(
    (a, b) => (a.oldestVerifiedAt ?? "").localeCompare(b.oldestVerifiedAt ?? "") || byName(a, b),
  );
  drafts.sort(byName);
  return { attention, stale, drafts, unreadable };
}
