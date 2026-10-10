import type { Bundle, EmptyHelp, Loosen, TimeChoice } from "@perch/core";
import { type PickPrefs, type PlainCopyId, spotName, t } from "@perch/ui-logic";
import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";

const LOOSEN = {
  group: "student.empty.loosen.group",
  time: "student.empty.loosen.time",
  from: "student.empty.loosen.from",
  preset: "student.empty.loosen.preset",
  access: "student.empty.loosen.access",
} as const satisfies Record<Loosen["kind"], PlainCopyId>;

const TIME_LABEL = {
  "30": "student.home.time.30",
  "60": "student.home.time.60",
  "120": "student.home.time.120",
  close: "student.home.time.close",
} as const satisfies Record<TimeChoice, PlainCopyId>;

/**
 * Nothing fits: say so, name the closest spot that was filtered out, and offer the one
 * change that core checked gives a pick. Spots that close too soon get no way out.
 */
export function EmptyPick(props: {
  help: EmptyHelp;
  bundle: Bundle;
  onSurprise(): void;
  onApply(next: Partial<PickPrefs>): void;
}) {
  const { closest, loosen } = props.help;
  const action = (icon: typeof Clock, label: string, onClick: () => void) => (
    <div className="inline-action">
      <Button variant="quiet" icon={<Icon icon={icon} />} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
  let button: ReactNode = null;
  if (loosen !== null) {
    switch (loosen.kind) {
      case "preset":
        button = action(Sparkles, t("student.pick.surprise"), props.onSurprise);
        break;
      case "group":
        button = action(Users, t("student.empty.try_group", { count: loosen.group }), () =>
          props.onApply({ group: loosen.group }),
        );
        break;
      case "time":
        button = action(
          Clock,
          t("student.empty.try_time", { time: t(TIME_LABEL[loosen.time]) }),
          () => props.onApply({ time: loosen.time }),
        );
        break;
      case "from": {
        const building = props.bundle.buildings.find((b) => b.id === loosen.from)?.name ?? "";
        button = action(MapPin, t("student.empty.try_from", { building }), () =>
          props.onApply({ from: loosen.from }),
        );
        break;
      }
      case "access":
        button = (
          <div className="inline-action">
            <Link to="/me" className="btn btn--ink">
              <span className="btn__label">{t("student.home.access.action")}</span>
            </Link>
          </div>
        );
        break;
    }
  }
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
      {loosen === null ? null : <p className="lede">{t(LOOSEN[loosen.kind])}</p>}
      {button}
    </section>
  );
}
