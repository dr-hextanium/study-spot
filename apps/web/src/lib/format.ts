import {
  type OverviewSection,
  type PlainCopyId,
  plural,
  type SyncHeader,
  t,
  type WriteRecord,
} from "@study-spot/ui-logic";
import type { PostmarkState } from "../ui/Postmark.tsx";

/** A check older than this reads as stale (dashed ring): about one term. */
export const STALE_AFTER_DAYS = 90;
const DAY_MS = 86_400_000;

export function postmarkState(verifiedAt: string | null, now: Date): PostmarkState {
  if (verifiedAt === null) return "never";
  return now.getTime() - Date.parse(verifiedAt) > STALE_AFTER_DAYS * DAY_MS ? "stale" : "fresh";
}

/** "Oct 5", in the campus time zone. */
export function shortDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(
    new Date(iso),
  );
}

/** "Oct 15, 3:40 PM", in the campus time zone. */
export function dateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

const SECTION_NAME = {
  identity: "section.identity.name",
  access: "section.access.name",
  hours: "section.hours.name",
  seating: "section.seating.name",
  power: "section.power.name",
  environment: "section.environment.name",
  use_fit: "section.use_fit.name",
  amenities: "section.amenities.name",
  accessibility: "section.accessibility.name",
  late_night: "section.late_night.name",
  estimates: "section.estimates.name",
  photos: "section.photos.name",
} as const satisfies Record<OverviewSection, PlainCopyId>;

export function sectionName(section: OverviewSection): string {
  return t(SECTION_NAME[section]);
}

/** The header postmark's short text; the sync sheet carries the long forms. */
export function headerText(h: SyncHeader): string {
  switch (h.kind) {
    case "signed_out":
      return t("sync.short.signed_out");
    case "failed":
      return t("sync.short.failed", { count: h.count });
    case "unreadable":
      return t("sync.short.unreadable", { count: h.count });
    case "offline":
      return t("sync.short.offline");
    case "syncing":
      return t("sync.syncing", { count: h.count });
    case "pending":
      return t("sync.short.pending", { count: h.count });
    case "all_synced":
      return t("sync.all_synced");
  }
}

/** The long form for the top of the sync sheet. */
export function headerLong(h: SyncHeader): string {
  switch (h.kind) {
    case "signed_out":
      return t("auth.expired.title");
    case "failed":
      return t("sync.failed", { count: h.count });
    case "unreadable":
      return plural(h.count, "sync.unreadable_one", "sync.unreadable");
    case "offline":
      return t("sync.offline");
    case "syncing":
      return t("sync.syncing", { count: h.count });
    case "pending":
      return t("sync.pending", { count: h.count });
    case "all_synced":
      return t("sync.all_synced");
  }
}

/** "Power and signal for SAC Lounge": what a queued write is, for the sync sheet. */
export function whatOf(r: WriteRecord, name: string): string {
  switch (r.kind) {
    case "spot.create":
      return t("sync.what.create", { name });
    case "spot.section":
      return t("sync.what.section", { section: sectionName(r.payload.section), name });
    case "spot.verify":
      return t("sync.what.verify", { name });
    case "spot.publish":
      return t("sync.what.publish", { name });
    case "spot.review":
      return t("sync.what.review", { name });
    case "photo.upload":
      return t("sync.what.photo", { name });
    case "photo.cover":
      return t("sync.what.cover", { name });
  }
}
