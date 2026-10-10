import { type BundleState, dataAgeView, t } from "@perch/ui-logic";
import { RotateCw } from "lucide-react";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Meta } from "../../ui/Screen.tsx";
import { Loading, Skel } from "../../ui/Skeleton.tsx";

/**
 * How old the spots are, under the title: always the age, the offline line when the last
 * check failed, a note when they are over three days old, and the update note. While
 * loading, the query's shape in mist; with no spots at all, the one sentence that explains.
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
        <Skel kind="control" w="100%" />
        <span className="chips">
          {["96px", "72px", "64px", "88px"].map((w) => (
            <Skel key={w} kind="chip" w={w} />
          ))}
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
    <>
      <Meta>{age.line}</Meta>
      {age.offline ? <Meta>{t("student.data.offline")}</Meta> : null}
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
