import type { SurveySpot } from "@study-spot/core";
import {
  fieldLabel,
  plural,
  type SectionStatus,
  type SpotView,
  t,
  type WriteRecord,
} from "@study-spot/ui-logic";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { applyServerSpot } from "../app/serverCache.ts";
import { useOnline } from "../hooks/useOnline.ts";
import { useSession } from "../hooks/useSession.ts";
import { type SpotViewState, useSpotView } from "../hooks/useSpotView.ts";
import { useToasts } from "../hooks/useToasts.tsx";
import { postmarkState, sectionName, shortDate } from "../lib/format.ts";
import { Banner } from "../ui/Banner.tsx";
import { Button } from "../ui/Button.tsx";
import { Postmark } from "../ui/Postmark.tsx";
import { RuledRow } from "../ui/RuledRow.tsx";
import { GroupHeading, Screen } from "../ui/Screen.tsx";
import { ConfirmSheet } from "../ui/Sheet.tsx";
import { StampChip } from "../ui/StampChip.tsx";
import { SurveyHeader } from "./SurveyHeader.tsx";
import { ConflictSheet, FailedSheet } from "./WriteSheets.tsx";

/** What a section row says: trouble and sync first, then how filled and when checked. */
function rowValue(
  s: SectionStatus,
  tz: string,
): { text: string; tone: "value" | "missing" | "muted" } {
  switch (s.sync) {
    case "conflict":
      return { text: t("spot.section.conflict"), tone: "missing" };
    case "failed":
      return { text: t("spot.section.failed"), tone: "missing" };
    case "syncing":
      return { text: t("spot.section.syncing"), tone: "muted" };
    case "saved_on_phone":
      return { text: t("spot.section.on_phone"), tone: "muted" };
    case "synced":
      break;
  }
  if (s.fill === "missing") return { text: t("spot.section.missing"), tone: "missing" };
  if (s.fill === "partial") return { text: t("spot.section.partial"), tone: "value" };
  if (s.checkedToday) return { text: t("spot.section.verified_today"), tone: "value" };
  if (s.verifiedAt !== null) {
    return {
      text: t("spot.section.verified", { date: shortDate(s.verifiedAt, tz) }),
      tone: "value",
    };
  }
  return { text: t("spot.section.done"), tone: "value" };
}

function postmarkFor(s: SectionStatus, tz: string, now: Date): ReactNode {
  if (s.section === "photos" || s.section === "estimates") return null;
  const state = postmarkState(s.verifiedAt, now);
  const date = s.verifiedAt === null ? "" : shortDate(s.verifiedAt, tz).toUpperCase();
  const label =
    s.verifiedAt === null
      ? t("home.stale.never")
      : s.checkedToday
        ? t("spot.section.verified_today")
        : t("spot.section.verified", { date: shortDate(s.verifiedAt, tz) });
  return <Postmark state={state} date={date} label={label} />;
}

const GROUPS = [
  { group: "required", title: "spot.group.required" },
  { group: "extras", title: "spot.group.extras" },
  { group: "optional", title: "spot.group.optional" },
] as const;

function Stamps({ spot, view }: { spot: SurveySpot; view: SpotView }) {
  return (
    <div className="stamp-row">
      {spot.status === "published" ? (
        <StampChip tone="green" filled>
          {t("spot.status.published")}
        </StampChip>
      ) : (
        <StampChip tone="ink">{t("spot.status.draft")}</StampChip>
      )}
      {view.publishQueued ? (
        <StampChip tone="blue">{t("spot.publish.queued_chip")}</StampChip>
      ) : null}
      {spot.review_state === "reviewed" && spot.reviewed_by_name !== null ? (
        <StampChip tone="green">
          {t("spot.status.reviewed", { name: spot.reviewed_by_name })}
        </StampChip>
      ) : view.reviewQueued ? (
        <StampChip tone="blue">{t("spot.review.queued")}</StampChip>
      ) : view.localOnly ? null : (
        <StampChip tone="amber">{t("spot.status.unreviewed")}</StampChip>
      )}
    </div>
  );
}

/** One ruled sheet per spot: what is filled in, what is missing, what is checked (contract). */
export function Overview(props: { id: string; write: string | undefined }) {
  const state = useSpotView(props.id);
  const navigate = useNavigate();
  useEffect(() => {
    if (state.kind === "redirect") {
      void navigate({ to: "/survey/spots/$id", params: { id: state.to }, replace: true });
    }
  }, [state, navigate]);
  if (state.kind !== "ready") {
    return (
      <>
        <SurveyHeader title={t("app.name")} back={{ to: "/survey" }} />
        <Screen>
          <p className="lede">
            {state.kind === "missing" ? t("spot.not_found") : t("common.loading")}
          </p>
        </Screen>
      </>
    );
  }
  return <Ready id={props.id} write={props.write} state={state} />;
}

function Ready(props: {
  id: string;
  write: string | undefined;
  state: Extract<SpotViewState, { kind: "ready" }>;
}) {
  const { outbox, clock, api, queryClient } = useDeps();
  const { me } = useSession();
  const online = useOnline();
  const toasts = useToasts();
  const navigate = useNavigate();
  const [unpublishing, setUnpublishing] = useState(false);
  const { view, statuses, readiness, review, tz } = props.state;
  const { spot } = view;
  const now = clock.now();
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

  // A second tap while the first is being queued must not queue or announce anything.
  const [queuing, setQueuing] = useState(false);
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
    if (res.kind === "ok") applyServerSpot(queryClient, res.value);
    else toasts.show(t("error.generic"));
  }

  const reviewButton =
    review === "button" ? (
      <Button
        variant={readiness.kind === "ready" ? "secondary" : "primary"}
        wide
        disabled={queuing}
        onClick={() => void markReviewed()}
      >
        {t("spot.review")}
      </Button>
    ) : null;
  let action: ReactNode = reviewButton;
  if (readiness.kind === "ready") {
    action = (
      <>
        <Button variant="primary" wide disabled={queuing} onClick={() => void publish()}>
          {t("spot.publish")}
        </Button>
        {reviewButton}
      </>
    );
  } else if (readiness.kind === "blocked") {
    action = (
      <>
        <p className="label">{t("spot.publish.blocked.title")}</p>
        <ul className="blockers">
          {readiness.missing.map(({ field, section }) => {
            const text = t("spot.publish.blocked.item", { field: fieldLabel(field) });
            return (
              <li key={field}>
                {section === null ? (
                  text
                ) : (
                  <Link to="/survey/spots/$id/$section" params={{ id: spot.id, section }}>
                    {text}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <Button variant="primary" wide disabled>
          {t("spot.publish")}
        </Button>
      </>
    );
  }

  return (
    <>
      <SurveyHeader title={spot.official_name} back={{ to: "/survey" }} />
      <Screen action={action}>
        <Stamps spot={spot} view={view} />
        {conflicts.length > 0 ? (
          <Banner
            action={
              <Button variant="quiet" onClick={() => show(conflicts[0])}>
                {t("common.open")}
              </Button>
            }
          >
            {t("spot.conflict.banner")}
          </Banner>
        ) : null}
        {failed.length > 0 ? (
          <Banner
            action={
              <Button variant="quiet" onClick={() => show(failed[0])}>
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
            <ul className="ruled-list">
              {statuses
                .filter((s) => s.group === group)
                .map((s) => {
                  const value = rowValue(s, tz);
                  return (
                    <RuledRow
                      key={s.section}
                      label={sectionName(s.section)}
                      value={value.text}
                      tone={value.tone}
                      trailing={postmarkFor(s, tz, now)}
                      link={{
                        to: "/survey/spots/$id/$section",
                        params: { id: spot.id, section: s.section },
                      }}
                    />
                  );
                })}
            </ul>
          </section>
        ))}
        {me?.role === "admin" && spot.status === "published" && !view.localOnly ? (
          <section className="admin-actions">
            <Button variant="danger" disabled={!online} onClick={() => setUnpublishing(true)}>
              {t("spot.unpublish")}
            </Button>
            {online ? null : <p className="field__helper">{t("error.network_admin")}</p>}
          </section>
        ) : null}
      </Screen>
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
    </>
  );
}
