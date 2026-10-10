import type { EmptyHelp, Loosen } from "@perch/core";
import { type PlainCopyId, spotName, t } from "@perch/ui-logic";
import { Link } from "@tanstack/react-router";
import { Clock, Sparkles } from "lucide-react";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";

const LOOSEN = {
  preset: "student.empty.loosen.preset",
  group: "student.empty.loosen.group",
  time: "student.empty.loosen.time",
  access: "student.empty.loosen.access",
} as const satisfies Record<Loosen, PlainCopyId>;

/** Nothing fits: say so, name the closest spot that was filtered out, and offer one way out. */
export function EmptyPick(props: { help: EmptyHelp; onSurprise(): void; onShortTime(): void }) {
  const { closest, loosen } = props.help;
  return (
    <section className="pick-empty">
      <Banner tone="note">{t("student.empty.title")}</Banner>
      <p className="lede">
        {closest === null
          ? t("student.empty.none_open")
          : t("student.empty.closest", {
              spot: spotName(closest.spot),
              minutes: closest.walkMinutes,
            })}
      </p>
      {loosen === null ? null : <p className="lede">{t(LOOSEN[loosen])}</p>}
      {loosen === "preset" ? (
        <div className="inline-action">
          <Button variant="quiet" icon={<Icon icon={Sparkles} />} onClick={props.onSurprise}>
            {t("student.pick.surprise")}
          </Button>
        </div>
      ) : loosen === "time" ? (
        <div className="inline-action">
          <Button variant="quiet" icon={<Icon icon={Clock} />} onClick={props.onShortTime}>
            {t("student.empty.try_short")}
          </Button>
        </div>
      ) : loosen === "access" ? (
        <div className="inline-action">
          <Link to="/me" className="btn btn--ink">
            <span className="btn__label">{t("student.home.access.action")}</span>
          </Link>
        </div>
      ) : null}
    </section>
  );
}
