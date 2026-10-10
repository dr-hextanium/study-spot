import { DAY_TYPE, type TermRef, TIME_BLOCK } from "@perch/core";
import {
  COPY,
  type HomeFact,
  type HomeRow,
  type OverviewSection,
  plural,
  type SectionStatus,
  type SpotView,
  t,
} from "@perch/ui-logic";
import { CircleAlert, Eye, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Pill } from "../ui/Pill.tsx";
import { ELIGIBILITY_COPY, FOOD_COPY, NOISE_COPY } from "./fields.ts";
import { shortDate } from "./format.ts";

/** Cells in the busyness grid: two day types by four time blocks. */
const ESTIMATE_BLOCKS = DAY_TYPE.length * TIME_BLOCK.length;

/** The end slot of a Home row: one fact, red only where something needs a look. */
export function homeFactEnd(fact: HomeFact, tz: string): ReactNode {
  switch (fact.kind) {
    case "conflict":
      return (
        <Pill tone="red" icon={TriangleAlert}>
          {t("home.fact.conflict")}
        </Pill>
      );
    case "failed":
      return (
        <Pill tone="red" icon={CircleAlert}>
          {t("home.fact.failed")}
        </Pill>
      );
    case "unreviewed":
      return (
        <Pill icon={Eye}>
          {t("home.fact.unreviewed")}
          <span className="visually-hidden">
            {", "}
            {t("home.fact.unreviewed_by", { name: fact.editor })}
          </span>
        </Pill>
      );
    case "hours_unconfirmed":
      return <span className="fact">{t("home.fact.hours", { term: fact.term })}</span>;
    case "progress":
      return (
        <span className="fact fact--num">
          {t("home.fact.progress", { done: fact.done, total: fact.total })}
        </span>
      );
    case "draft":
      return <Pill>{t("home.fact.draft")}</Pill>;
    case "checked":
      return <span className="fact fact--num">{shortDate(fact.at, tz)}</span>;
    case "never_checked":
      return <span className="fact">{t("home.stale.never")}</span>;
  }
}

/**
 * The row subtitle: every published spot shows when it was checked. A row whose
 * end already is the check date needs no second line.
 */
export function homeFactSub(row: HomeRow, tz: string): string | undefined {
  if (row.checked === null) return undefined;
  if (row.fact.kind === "checked" || row.fact.kind === "never_checked") return undefined;
  return row.checked.at === null
    ? t("home.stale.never")
    : t("home.checked", { date: shortDate(row.checked.at, tz) });
}

/**
 * The one thing a section row says on the right when it is filled in, taken from
 * the same labels the editors show. Null when there is nothing worth saying.
 */
export function sectionFact(
  view: SpotView,
  section: OverviewSection,
  term: TermRef | null,
): string | null {
  const s = view.spot;
  switch (section) {
    case "identity":
      return s.floor === "" ? null : t("spot.meta.floor", { floor: s.floor });
    case "access":
      return s.eligibility === null ? null : COPY[ELIGIBILITY_COPY[s.eligibility]];
    case "seating":
      return s.seat_count === null ? null : t("spot.fact.seats", { count: s.seat_count });
    case "power":
      return s.outlet_coverage_pct === null
        ? null
        : t("spot.fact.outlets", { percent: Math.round(s.outlet_coverage_pct * 100) });
    case "environment":
      return s.noise_policy === null ? null : COPY[NOISE_COPY[s.noise_policy]];
    case "use_fit":
      return s.food_policy === null ? null : COPY[FOOD_COPY[s.food_policy]];
    case "hours":
      return s.hours.length === 0 || term === null
        ? null
        : t("spot.fact.hours", { term: term.name });
    case "estimates":
      return s.estimates.length === 0
        ? null
        : t("spot.fact.blocks", { count: s.estimates.length, total: ESTIMATE_BLOCKS });
    case "photos": {
      const n = s.photos.length + view.pendingPhotos.length;
      return n === 0 ? null : plural(n, "spot.fact.photos_one", "spot.fact.photos");
    }
    default:
      return null;
  }
}

/** The end slot of a section row: sync trouble beats missing, missing beats the fact. */
export function sectionEnd(status: SectionStatus, fact: string | null): ReactNode {
  switch (status.sync) {
    case "conflict":
      return (
        <Pill tone="red" icon={TriangleAlert}>
          {t("spot.section.conflict")}
        </Pill>
      );
    case "failed":
      return (
        <Pill tone="red" icon={CircleAlert}>
          {t("spot.section.failed")}
        </Pill>
      );
    case "syncing":
      return <span className="fact">{t("spot.section.syncing")}</span>;
    case "saved_on_phone":
      return <span className="fact">{t("spot.section.on_phone")}</span>;
    case "synced":
      break;
  }
  if (status.fill === "missing") {
    // Only the required sections block publishing, so only they ask for attention.
    if (status.group === "required") return <Pill tone="red">{t("spot.section.missing")}</Pill>;
    return (
      <span className="fact">
        {t(status.section === "estimates" ? "spot.section.not_set" : "spot.section.none")}
      </span>
    );
  }
  if (status.fill === "partial") return <span className="fact">{t("spot.section.partial")}</span>;
  return <span className="fact truncate">{fact ?? t("spot.section.done")}</span>;
}
