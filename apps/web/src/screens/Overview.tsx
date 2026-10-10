import type { SurveySpot } from "@perch/core";
import {
  fieldLabel,
  plural,
  REQUIRED_SECTIONS,
  type SpotView,
  t,
  type WriteRecord,
} from "@perch/ui-logic";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Ellipsis,
  Eye,
  ListChecks,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { adoptServerSpot } from "../app/serverCache.ts";
import { useOnline } from "../hooks/useOnline.ts";
import { useCampus } from "../hooks/useQueries.ts";
import { useSession } from "../hooks/useSession.ts";
import { type SpotViewState, useSpotView } from "../hooks/useSpotView.ts";
import { useToasts } from "../hooks/useToasts.tsx";
import { sectionEnd, sectionFact } from "../lib/facts.tsx";
import { sectionName, shortDate } from "../lib/format.ts";
import { SECTION_ICON } from "../lib/icons.ts";
import { Banner } from "../ui/Banner.tsx";
import { Button, IconButton } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Pill } from "../ui/Pill.tsx";
import { Row } from "../ui/Row.tsx";
import { GroupHeading, Meta, Screen } from "../ui/Screen.tsx";
import { ConfirmSheet, Sheet } from "../ui/Sheet.tsx";
import { StepBar } from "../ui/StepBar.tsx";
import { NotFound } from "./NotFound.tsx";
import { OverviewSkeletonBody, SkelBar } from "./SpotSkeleton.tsx";
import { SyncStatus } from "./SyncStatus.tsx";
import { ConflictSheet, FailedSheet } from "./WriteSheets.tsx";

const GROUPS = [
  { group: "required", title: "spot.group.required" },
  { group: "extras", title: "spot.group.extras" },
  { group: "optional", title: "spot.group.optional" },
] as const;

/** The oldest check across the attribute groups; null when nothing was ever checked. */
function oldestCheck(spot: SurveySpot): string | null {
  const dates = Object.values(spot.verified).filter((d): d is string => d !== undefined);
  return dates.length === 0
    ? null
    : dates.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
}

/** Status, review and last-check facts under the large title. Every spot shows when it was last checked. */
function SpotMeta(props: { view: SpotView; tz: string }) {
  const { view } = props;
  const { spot } = view;
  const campus = useCampus();
  const building =
    campus.data?.buildings.find((b) => b.id === spot.building_id)?.name ?? spot.building_id;
  const place =
    spot.floor === "" ? building : t("spot.meta.place", { building, floor: spot.floor });
  const checked = oldestCheck(spot);
  return (
    <Meta>
      {spot.status === "published" ? (
        <Pill icon={Check}>{t("spot.status.published")}</Pill>
      ) : (
        <Pill>{t("spot.status.draft")}</Pill>
      )}
      {view.publishQueued ? <Pill>{t("spot.publish.queued_chip")}</Pill> : null}
      {spot.review_state === "reviewed" && spot.reviewed_by_name !== null ? (
        <Pill>{t("spot.status.reviewed", { name: spot.reviewed_by_name })}</Pill>
      ) : view.reviewQueued ? (
        <Pill>{t("spot.review.queued")}</Pill>
      ) : view.localOnly ? null : (
        <Pill icon={Eye}>{t("spot.status.unreviewed")}</Pill>
      )}
      <span>{place}</span>
      <span className="meta__item">
        <Icon icon={CalendarCheck} size={15} />
        {checked === null
          ? t("home.stale.never")
          : t("spot.section.verified", { date: shortDate(checked, props.tz) })}
      </span>
    </Meta>
  );
}

/**
 * One screen per spot: what is filled in, what is missing, what is checked, and
 * what to do next (contract). The step bar counts the sections needed to publish.
 */
export function Overview(props: { id: string; write: string | undefined }) {
  const state = useSpotView(props.id);
  const navigate = useNavigate();
  useEffect(() => {
    if (state.kind === "redirect") {
      // The same screen under its real id: no cross-fade.
      void navigate({
        to: "/survey/spots/$id",
        params: { id: state.to },
        replace: true,
        viewTransition: false,
      });
    }
  }, [state, navigate]);
  if (state.kind === "missing") return <NotFound message={t("spot.not_found")} sync />;
  return <Ready id={props.id} write={props.write} state={state} />;
}

/**
 * The overview, or its skeleton while the spot is on its way. Both are this one
 * component's Screen, so the screen (and focus on it) stays when the spot arrives.
 */
function Ready(props: {
  id: string;
  write: string | undefined;
  state: Exclude<SpotViewState, { kind: "missing" }>;
}) {
  const { outbox, api, queryClient } = useDeps();
  const { me } = useSession();
  const online = useOnline();
  const toasts = useToasts();
  const navigate = useNavigate();
  const reasonId = useId();
  const [unpublishing, setUnpublishing] = useState(false);
  const [blockersOpen, setBlockersOpen] = useState(false);
  const [actions, setActions] = useState(false);
  // A second tap while the first is being queued must not queue or announce anything.
  const [queuing, setQueuing] = useState(false);
  if (props.state.kind !== "ready") {
    return (
      <Screen
        title={t("app.name")}
        titleHidden
        back={{ to: "/survey" }}
        trailing={<SyncStatus variant="icon" />}
        action={<SkelBar />}
      >
        <OverviewSkeletonBody />
      </Screen>
    );
  }
  const { view, statuses, readiness, review, tz, progress } = props.state;
  const { spot } = view;
  const conflicts = view.records.filter((r) => r.state === "conflict");
  const failed = view.records.filter((r) => r.state === "failed");
  const open = view.records.find((r) => r.client_write_id === props.write);
  const show = (r: WriteRecord | undefined) =>
    void navigate({
      to: "/survey/spots/$id",
      params: { id: props.id },
      search: r === undefined ? {} : { write: r.client_write_id },
      // Closing a sheet replaces its entry, so Back leaves the screen instead of reopening it.
      replace: r === undefined,
    });

  async function queue(
    kind: "spot.publish" | "spot.review",
    copy: {
      done: "spot.publish.done" | "spot.review.done";
      waiting: "spot.publish.queued" | "spot.review.queued";
    },
  ) {
    if (queuing) return;
    setQueuing(true);
    try {
      const id = await outbox.enqueue({ kind, spot_id: spot.id, payload: {} }, view.serverVersion);
      toasts.track(id, copy);
    } finally {
      setQueuing(false);
    }
  }
  const publish = () =>
    queue("spot.publish", { done: "spot.publish.done", waiting: "spot.publish.queued" });
  const markReviewed = () =>
    queue("spot.review", { done: "spot.review.done", waiting: "spot.review.queued" });
  async function unpublish() {
    setUnpublishing(false);
    const res = await api.unpublish(spot.id, { client_write_id: crypto.randomUUID() });
    if (res.kind === "ok") await adoptServerSpot(queryClient, outbox, res.value);
    else toasts.show(t("error.generic"));
  }

  const next = progress.next;
  const canUnpublish = me?.role === "admin" && spot.status === "published" && !view.localOnly;
  const lookRightInBar = review === "button" && readiness.kind !== "blocked";
  const lookRightInSheet = review === "button" && !lookRightInBar;
  const looksRight = (variant: "quiet" | "ink") => (
    <Button
      variant={variant}
      grow={variant === "ink"}
      disabled={queuing}
      onClick={() => void markReviewed()}
    >
      {t("spot.review")}
    </Button>
  );

  let bar: ReactNode = null;
  if (readiness.kind === "ready") {
    bar = (
      <>
        {review === "button" ? looksRight("quiet") : null}
        <Button variant="primary" disabled={queuing} onClick={() => void publish()} grow>
          {t("spot.publish")}
        </Button>
      </>
    );
  } else if (readiness.kind === "blocked") {
    bar = (
      <>
        {next === null ? null : (
          <Link
            to="/survey/spots/$id/$section"
            params={{ id: spot.id, section: next }}
            className="btn btn--ink actionbar__main"
          >
            <span className="btn__label">{t("spot.next", { section: sectionName(next) })}</span>
            <Icon icon={ArrowRight} />
          </Link>
        )}
        <Button
          variant="primary"
          aria-disabled="true"
          aria-describedby={reasonId}
          onClick={() => setBlockersOpen(true)}
          grow={next === null}
        >
          {t("spot.publish")}
        </Button>
      </>
    );
  } else if (review === "button") {
    bar = looksRight("ink");
  }

  return (
    <Screen
      title={spot.official_name}
      back={{ to: "/survey" }}
      trailing={<SyncStatus variant="icon" />}
      meta={<SpotMeta view={view} tz={tz} />}
      action={
        <>
          {bar}
          <IconButton
            label={t("common.actions")}
            icon={Ellipsis}
            onClick={() => setActions(true)}
          />
          {readiness.kind === "blocked" ? (
            <p id={reasonId} className="visually-hidden">
              {t("spot.publish.blocked.reason", { count: readiness.missing.length })}
            </p>
          ) : null}
        </>
      }
    >
      <StepBar
        steps={progress.steps}
        label={t("progress.label", { done: progress.done, total: progress.total })}
      />
      <p className="progress-line">
        {next === null
          ? t("spot.progress.complete", { done: progress.done, total: progress.total })
          : t("spot.progress.next", {
              done: progress.done,
              total: progress.total,
              section: sectionName(next),
            })}
      </p>
      {conflicts.length > 0 ? (
        <Banner
          icon={TriangleAlert}
          action={
            <Button
              variant="quiet"
              aria-label={t("spot.conflict.open")}
              onClick={() => show(conflicts[0])}
            >
              {t("common.open")}
            </Button>
          }
        >
          {t("spot.conflict.banner")}
        </Banner>
      ) : null}
      {failed.length > 0 ? (
        <Banner
          icon={CircleAlert}
          action={
            <Button
              variant="quiet"
              aria-label={t("spot.failed.open")}
              onClick={() => show(failed[0])}
            >
              {t("common.open")}
            </Button>
          }
        >
          {plural(failed.length, "spot.failed.banner", "spot.failed.banner_many")}
        </Banner>
      ) : null}
      {review === "own" ? <p className="lede">{t("spot.review.own")}</p> : null}
      {GROUPS.map(({ group, title }) => (
        <section key={group} aria-labelledby={`group-${group}`}>
          <GroupHeading id={`group-${group}`}>{t(title)}</GroupHeading>
          <ul className="row-list">
            {statuses
              .filter((s) => s.group === group)
              .map((s) => (
                <Row
                  key={s.section}
                  compact
                  title={sectionName(s.section)}
                  lead={
                    <Icon
                      icon={SECTION_ICON[s.section]}
                      className={
                        s.group === "required" && s.fill === "missing" ? "icon--red" : "icon--ink"
                      }
                    />
                  }
                  end={sectionEnd(s, sectionFact(view, s.section, spot.term))}
                  link={{
                    to: "/survey/spots/$id/$section",
                    params: { id: spot.id, section: s.section },
                  }}
                />
              ))}
          </ul>
        </section>
      ))}
      <Sheet
        open={blockersOpen}
        title={t("spot.publish.blocked.title")}
        onClose={() => setBlockersOpen(false)}
      >
        {readiness.kind === "blocked" ? (
          <ul className="row-list blockers">
            {readiness.missing.map(({ field, section }) => {
              const text = t("spot.publish.blocked.item", { field: fieldLabel(field) });
              return section === null ? (
                <Row key={field} title={text} lead={<Icon icon={CalendarCheck} />} />
              ) : (
                <Row
                  key={field}
                  title={text}
                  lead={<Icon icon={SECTION_ICON[section]} />}
                  end={<Icon icon={ChevronRight} />}
                  link={{ to: "/survey/spots/$id/$section", params: { id: spot.id, section } }}
                />
              );
            })}
          </ul>
        ) : null}
      </Sheet>
      <Sheet open={actions} title={t("common.actions")} onClose={() => setActions(false)}>
        <ul className="row-list">
          {next === null ? null : (
            <Row
              title={t("spot.actions.next_missing", { section: sectionName(next) })}
              lead={<Icon icon={ArrowRight} />}
              link={{ to: "/survey/spots/$id/$section", params: { id: spot.id, section: next } }}
            />
          )}
          <Row
            title={t("spot.actions.add_photo")}
            lead={<Icon icon={Camera} />}
            link={{ to: "/survey/spots/$id/$section", params: { id: spot.id, section: "photos" } }}
          />
          <Row
            title={t("spot.actions.walk")}
            sub={t("spot.actions.walk.hint")}
            lead={<Icon icon={ListChecks} />}
            link={{
              to: "/survey/spots/$id/$section",
              params: { id: spot.id, section: REQUIRED_SECTIONS[0] ?? "identity" },
              search: { walk: 1 },
            }}
          />
          {lookRightInSheet ? (
            <Row
              title={t("spot.review")}
              lead={<Icon icon={CircleCheck} />}
              disabled={queuing}
              onClick={() => {
                setActions(false);
                void markReviewed();
              }}
            />
          ) : null}
        </ul>
        {canUnpublish ? (
          <div className="sheet-danger">
            <Button
              variant="danger"
              wide
              icon={<Icon icon={Trash2} />}
              disabled={!online}
              onClick={() => {
                setActions(false);
                setUnpublishing(true);
              }}
            >
              {t("spot.unpublish")}
            </Button>
            {online ? null : <p className="field__helper">{t("error.network_admin")}</p>}
          </div>
        ) : null}
      </Sheet>
      {open?.state === "conflict" ? (
        <ConflictSheet
          record={open}
          spotName={spot.official_name}
          onClose={() => show(undefined)}
        />
      ) : null}
      {open?.state === "failed" ? (
        <FailedSheet record={open} spotName={spot.official_name} onClose={() => show(undefined)} />
      ) : null}
      <ConfirmSheet
        open={unpublishing}
        title={t("spot.unpublish.confirm.title", { name: spot.official_name })}
        body={t("spot.unpublish.confirm.body")}
        action={t("spot.unpublish.confirm.action")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setUnpublishing(false)}
        onConfirm={() => void unpublish()}
      />
    </Screen>
  );
}
