import { type BundleState, dataAgeView, t } from "@perch/ui-logic";
import { RotateCw } from "lucide-react";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Meta } from "../../ui/Screen.tsx";
import { Loading, Skel } from "../../ui/Skeleton.tsx";

/**
 * How old the spots are, under the title: one line with the age, and the offline word when
 * the last check failed. While loading, the query's shape in mist; with no spots at all,
 * the one sentence that explains. The longer notes are DataNotes, under the pick.
 */
export function DataState(props: { state: BundleState }) {
  const { state } = props;
  if (state.phase === "loading") {
    return (
      <Loading className="query">
        <span className="row skel-row">
          <Skel kind="icon" />
          <span className="row__text">
            <Skel w="40%" />
          </span>
        </span>
        {/* Two chip lines, How long and What for, then the More filters row. */}
        {[
          ["64px", "48px", "48px", "80px"],
          ["96px", "64px", "56px", "88px"],
        ].map((widths) => (
          <span key={widths.join()} className="chips">
            {widths.map((w, i) => (
              // Widths repeat inside a row, so the position is the stable key.
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list, never reordered
              <Skel key={i} kind="chip" w={w} />
            ))}
          </span>
        ))}
        <span className="row skel-row">
          <Skel kind="icon" />
          <span className="row__text">
            <Skel w="32%" />
          </span>
        </span>
        <span className="group-heading">
          <Skel kind="heading" w="32%" />
        </span>
        <Skel kind="photo" w="100%" />
      </Loading>
    );
  }
  if (state.phase === "unavailable") {
    return (
      <p className="lede" role="status">
        {state.reason === "offline_no_cache"
          ? t("student.data.unavailable")
          : t("student.data.update_required")}
      </p>
    );
  }
  const age = dataAgeView(state.load.ageDays, state.checkFailed);
  return (
    <Meta>
      <span>{age.line}</span>
      {age.offline ? (
        <>
          {" · "}
          <span>{t("student.data.offline")}</span>
        </>
      ) : null}
    </Meta>
  );
}

/**
 * The longer notes about the spots: over three days old, or a newer Perch to reload for.
 * Home puts them under the pick, so the pick and Directions stay above the tab bar.
 */
export function DataNotes(props: { state: BundleState }) {
  const { state } = props;
  if (state.phase !== "ready") return null;
  const age = dataAgeView(state.load.ageDays, state.checkFailed);
  return (
    <>
      {age.prominent === null ? null : <Banner tone="note">{age.prominent}</Banner>}
      {state.load.updateAvailable ? (
        <Banner
          tone="note"
          action={
            <Button
              variant="ink"
              icon={<Icon icon={RotateCw} />}
              onClick={() => window.location.reload()}
            >
              {t("student.data.reload")}
            </Button>
          }
        >
          {t("student.data.update_available")}
        </Banner>
      ) : null}
    </>
  );
}
