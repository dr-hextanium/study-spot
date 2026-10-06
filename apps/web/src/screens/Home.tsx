import type { AttentionRow, DraftRow, StaleRow } from "@study-spot/ui-logic";
import { plural, t } from "@study-spot/ui-logic";
import { type ReactNode, useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useOnline } from "../hooks/useOnline.ts";
import { useCampusTz } from "../hooks/useQueries.ts";
import { useSurveyHome } from "../hooks/useSurveyHome.ts";
import { shortDate } from "../lib/format.ts";
import { Banner } from "../ui/Banner.tsx";
import { RuledRow } from "../ui/RuledRow.tsx";
import { GroupHeading, Screen } from "../ui/Screen.tsx";
import { SurveyHeader } from "./SurveyHeader.tsx";
import type { SpotLinkFor } from "./spotLink.ts";

function attentionText(row: AttentionRow): string {
  switch (row.reason) {
    case "conflict":
      return t("home.attention.conflict");
    case "failed":
      return plural(row.count, "home.attention.failed_one", "home.attention.failed");
    case "unreviewed":
      return t("home.attention.unreviewed", { name: row.editor });
    case "hours_unconfirmed":
      return t("home.attention.hours_unconfirmed", { term: row.term });
  }
}

function staleText(row: StaleRow, tz: string): string {
  return row.oldestVerifiedAt === null
    ? t("home.stale.never")
    : t("home.stale.row", { date: shortDate(row.oldestVerifiedAt, tz) });
}

/** No count when this phone has never loaded the draft's details. */
function draftText(row: DraftRow): string | undefined {
  return row.requiredDone === null ? undefined : t("home.drafts.row", { count: row.requiredDone });
}

/** Writes still queued once this page load's first sync pass ended (journey edge 9). */
function usePendingAfterOpen(): number {
  const { started, outbox } = useDeps();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    void started.then(() => {
      const left = outbox
        .getSnapshot()
        .records.filter((r) => r.state === "pending" || r.state === "syncing").length;
      if (live) setCount(left);
    });
    return () => {
      live = false;
    };
  }, [started, outbox]);
  return count;
}

function List(props: { title: string; children: ReactNode; empty: string | null }) {
  return (
    <section aria-label={props.title}>
      <GroupHeading>{props.title}</GroupHeading>
      {props.empty === null ? (
        <ul className="ruled-list">{props.children}</ul>
      ) : (
        <p className="empty">{props.empty}</p>
      )}
    </section>
  );
}

/**
 * What to do next and whether data is safe. `spotLink` turns a row into a link
 * to the spot (wired once the overview exists); `action` is the pinned button.
 */
export function Home(props: { spotLink?: SpotLinkFor; action?: ReactNode; admin?: ReactNode }) {
  const online = useOnline();
  const tz = useCampusTz();
  const { home, noList } = useSurveyHome();
  const pendingAtOpen = usePendingAfterOpen();
  const link = props.spotLink;
  const rows = home ?? { attention: [], stale: [], drafts: [], unreadable: 0 };
  const firstRun = !noList && rows.stale.length === 0 && rows.drafts.length === 0;

  return (
    <>
      <SurveyHeader title={t("home.title")} />
      <Screen action={props.action}>
        {props.admin === undefined ? null : <nav className="home-admin">{props.admin}</nav>}
        {pendingAtOpen > 0 ? (
          <Banner tone="note">
            {plural(pendingAtOpen, "sync.leave_warning_one", "sync.leave_warning")}
          </Banner>
        ) : null}
        {noList && !online ? <p className="lede">{t("home.offline_first")}</p> : null}
        {firstRun ? (
          <section className="first-run">
            <h2 className="title">{t("home.empty.title")}</h2>
            <p className="lede">{t("home.empty.body")}</p>
          </section>
        ) : null}
        <List
          title={t("home.attention.title")}
          empty={
            rows.attention.length === 0 && rows.unreadable === 0 ? t("home.attention.empty") : null
          }
        >
          {rows.unreadable > 0 ? (
            <RuledRow
              label={plural(rows.unreadable, "home.unreadable_one", "home.unreadable")}
              tone="missing"
            />
          ) : null}
          {rows.attention.map((row) => (
            <RuledRow
              key={`${row.spotId}:${row.reason}`}
              label={row.name}
              value={attentionText(row)}
              tone={row.reason === "conflict" || row.reason === "failed" ? "missing" : "muted"}
              {...(link === undefined ? {} : { link: link(row.spotId) })}
            />
          ))}
        </List>
        <List
          title={t("home.drafts.title")}
          empty={rows.drafts.length === 0 ? t("home.drafts.empty") : null}
        >
          {rows.drafts.map((row) => (
            <RuledRow
              key={row.spotId}
              label={row.name}
              value={draftText(row)}
              tone="muted"
              {...(link === undefined ? {} : { link: link(row.spotId) })}
            />
          ))}
        </List>
        <List
          title={t("home.stale.title")}
          empty={rows.stale.length === 0 ? t("home.stale.empty") : null}
        >
          {rows.stale.map((row) => (
            <RuledRow
              key={row.spotId}
              label={row.name}
              value={staleText(row, tz)}
              tone={row.oldestVerifiedAt === null ? "missing" : "muted"}
              {...(link === undefined ? {} : { link: link(row.spotId) })}
            />
          ))}
        </List>
      </Screen>
    </>
  );
}
