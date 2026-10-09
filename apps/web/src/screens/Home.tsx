import {
  HOME_FILTERS,
  type HomeFilter,
  type HomeRow,
  homeList,
  keepGoing,
  type OutboxSnapshot,
  plural,
  t,
} from "@study-spot/ui-logic";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Ellipsis, History, Plus, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useOnline } from "../hooks/useOnline.ts";
import { useOutboxSnapshot } from "../hooks/useOutbox.ts";
import { useCampusTz } from "../hooks/useQueries.ts";
import { useSurveyHome } from "../hooks/useSurveyHome.ts";
import { homeFactEnd, homeFactSub } from "../lib/facts.tsx";
import { sectionName } from "../lib/format.ts";
import { useHomeState } from "../lib/homeState.ts";
import { Banner } from "../ui/Banner.tsx";
import { IconButton } from "../ui/Button.tsx";
import { CoverThumb } from "../ui/CoverThumb.tsx";
import { FilterChips } from "../ui/FilterChips.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Row } from "../ui/Row.tsx";
import { GroupHeading, Screen } from "../ui/Screen.tsx";
import { Search } from "../ui/Search.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import { Loading, Skel, SkelRows } from "../ui/Skeleton.tsx";
import { StepBar } from "../ui/StepBar.tsx";
import { ThemeSwitch } from "../ui/ThemeSwitch.tsx";
import { SyncSheet } from "./SyncSheet.tsx";
import { SyncStatus } from "./SyncStatus.tsx";
import type { SpotLinkFor } from "./spotLink.ts";

/**
 * Writes still waiting, shown only when some were queued when this screen first
 * saw the loaded queue (journey edge 9). The decision is made once, on the first
 * snapshot with `loaded` true: before that, an empty queue is a default, not a
 * fact. It follows the live queue after that, so it goes away once they sync.
 */
function usePendingAfterOpen(): number {
  const snapshot = useOutboxSnapshot();
  const [leftAtOpen, setLeftAtOpen] = useState<boolean | null>(null);
  const loaded = snapshot.loaded;
  const left = waiting(snapshot) > 0;
  useEffect(() => {
    if (loaded) setLeftAtOpen((decided) => decided ?? left);
  }, [loaded, left]);
  return leftAtOpen === true ? waiting(snapshot) : 0;
}

function waiting(snapshot: OutboxSnapshot): number {
  return snapshot.records.filter((r) => r.state === "pending" || r.state === "syncing").length;
}

const EMPTY: Record<
  Exclude<HomeFilter, "all">,
  "home.empty.attention" | "home.drafts.empty" | "home.empty.due"
> = {
  attention: "home.empty.attention",
  drafts: "home.drafts.empty",
  due: "home.empty.due",
};

/**
 * The first screen: where to pick up (Keep going), then one searchable,
 * filterable list of spots with one fact each. `spotLink` turns a row into a
 * link to the spot.
 */
export function Home(props: { spotLink?: SpotLinkFor; isAdmin: boolean }) {
  const online = useOnline();
  const tz = useCampusTz();
  const { home, noList, loading } = useSurveyHome();
  const pendingAtOpen = usePendingAfterOpen();
  const [state, setState] = useHomeState();
  const [actions, setActions] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const link = props.spotLink;
  const data = home ?? { attention: [], stale: [], drafts: [], unreadable: 0 };
  const firstRun = !noList && data.stale.length === 0 && data.drafts.length === 0;
  const { rows, counts } = homeList(data, { ...state, now: new Date() });
  const keep = keepGoing(data.drafts);
  const keepProgress = keep?.progress ?? null;
  const options = HOME_FILTERS.map((value) => ({
    value,
    label: t(`home.filter.${value}`),
    count: counts[value],
  }));
  const listHeadingId = "home-list-heading";
  const empty =
    state.query.trim() !== ""
      ? t("home.empty.search")
      : state.filter === "all"
        ? null
        : t(EMPTY[state.filter]);

  return (
    <Screen
      title={t("home.title")}
      {...(props.isAdmin
        ? {
            trailing: (
              <IconButton label={t("home.admin")} icon={Shield} link={{ to: "/survey/admin" }} />
            ),
          }
        : {})}
      action={
        <>
          <SyncStatus variant="bar" />
          <Link to="/survey/spots/new" className="btn btn--primary actionbar__main">
            <Icon icon={Plus} />
            <span className="btn__label">{t("home.new_spot")}</span>
          </Link>
          <IconButton
            label={t("common.actions")}
            icon={Ellipsis}
            onClick={() => setActions(true)}
          />
        </>
      }
    >
      {pendingAtOpen > 0 ? (
        <Banner tone="note">
          {plural(pendingAtOpen, "sync.leave_warning_one", "sync.leave_warning")}
        </Banner>
      ) : null}
      {noList && !online && !loading ? <p className="lede">{t("home.offline_first")}</p> : null}
      {firstRun ? (
        <section className="first-run">
          <h2 className="group-heading">{t("home.empty.title")}</h2>
          <p className="lede">{t("home.empty.body")}</p>
        </section>
      ) : null}
      {keep !== null && link !== undefined ? (
        <Link {...link(keep.spotId)} className="keep">
          {keep.coverPhotoId === null ? null : (
            <CoverThumb photoId={keep.coverPhotoId} size="card" />
          )}
          <span className="keep__text">
            <span className="keep__name truncate">{keep.name}</span>
            {keepProgress === null ? null : (
              <StepBar
                steps={keepProgress.steps}
                label={t("progress.label", {
                  done: keepProgress.done,
                  total: keepProgress.total,
                })}
              />
            )}
            <span className="keep__next">
              {keepProgress === null
                ? t("home.keep_going")
                : keepProgress.next === null
                  ? t("home.keep_going.ready")
                  : t("home.keep_going.next", {
                      section: sectionName(keepProgress.next),
                      count: keepProgress.total - keepProgress.done,
                    })}
            </span>
          </span>
          <Icon icon={ArrowRight} />
        </Link>
      ) : null}
      <Search
        label={t("home.search.label")}
        value={state.query}
        onChange={(query) => setState({ ...state, query })}
      />
      {loading ? (
        <Loading>
          <span className="chips">
            {["64px", "112px", "92px", "72px"].map((w) => (
              <Skel key={w} kind="chip" w={w} />
            ))}
          </span>
          <span className="group-heading">
            <Skel kind="heading" w="32%" />
          </span>
          <SkelRows count={5} compact />
        </Loading>
      ) : (
        <FilterChips
          label={t("home.filter.label")}
          options={options}
          value={state.filter}
          onChange={(filter) => setState({ ...state, filter })}
        />
      )}
      {data.unreadable > 0 ? (
        <Banner tone="note">
          {plural(data.unreadable, "home.unreadable_one", "home.unreadable")}
        </Banner>
      ) : null}
      {loading ? null : (
        <section {...(firstRun ? {} : { "aria-labelledby": listHeadingId })}>
          {firstRun ? null : (
            <GroupHeading id={listHeadingId}>{t(`home.group.${state.filter}`)}</GroupHeading>
          )}
          {empty === null || rows.length > 0 ? null : <p className="empty">{empty}</p>}
          {rows.length === 0 ? null : (
            <ul className="row-list">
              {rows.map((row: HomeRow) => (
                <Row
                  key={row.spotId}
                  title={row.name}
                  compact
                  {...(row.coverPhotoId === null
                    ? {}
                    : { lead: <CoverThumb photoId={row.coverPhotoId} size="row" /> })}
                  end={homeFactEnd(row.fact, tz)}
                  {...(homeFactSub(row, tz) === undefined ? {} : { sub: homeFactSub(row, tz) })}
                  {...(link === undefined ? {} : { link: link(row.spotId) })}
                />
              ))}
            </ul>
          )}
        </section>
      )}
      <Sheet open={actions} title={t("common.actions")} onClose={() => setActions(false)}>
        <ul className="row-list">
          <Row
            title={t("sync.sheet.title")}
            lead={<Icon icon={History} />}
            onClick={() => {
              setActions(false);
              setSyncOpen(true);
            }}
          />
          {props.isAdmin ? (
            <Row
              title={t("home.admin")}
              lead={<Icon icon={Shield} />}
              link={{ to: "/survey/admin" }}
            />
          ) : null}
        </ul>
        <ThemeSwitch />
      </Sheet>
      <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
    </Screen>
  );
}
