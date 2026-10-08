import { type HomeFact, type HomeRow, t } from "@study-spot/ui-logic";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Pill } from "../ui/Pill.tsx";
import { shortDate } from "./format.ts";

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
      return <span className="fact">{t("home.fact.unreviewed", { name: fact.editor })}</span>;
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
