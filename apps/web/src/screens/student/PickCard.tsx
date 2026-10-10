import { type PickCardView, t } from "@perch/ui-logic";
import { Link } from "@tanstack/react-router";
import { Navigation, Shuffle, Sparkles } from "lucide-react";
import { useId } from "react";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Pill } from "../../ui/Pill.tsx";
import { Row } from "../../ui/Row.tsx";
import { GroupHeading } from "../../ui/Screen.tsx";

const DOT = " · ";

/**
 * The one place to go: name, place, walk, seats and closing time, the typical busyness on
 * its own line (never cut short), why it fits, when it was checked, and what to do next.
 */
export function PickCard(props: {
  view: PickCardView;
  heading: string;
  directions: string;
  onDirections(): void;
  onSomethingElse(): void;
  onSurprise(): void;
}) {
  const { view } = props;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <GroupHeading id={headingId}>{props.heading}</GroupHeading>
      <article className="keep pick-card">
        <Link
          to="/spot/$slug"
          params={{ slug: view.slug }}
          search={{ via: "pick" }}
          className="keep__name pick-card__name"
        >
          {view.name}
        </Link>
        <span className="keep__next">{view.place}</span>
        <p className="pick-card__facts">{[view.walk, view.seat, view.closes].join(DOT)}</p>
        <p className="pick-card__busy">{view.busy}</p>
        {view.reasons.length === 0 ? null : (
          <ul className="pick-card__reasons">
            {view.reasons.map((r) => (
              <li key={r}>
                <Pill>{r}</Pill>
              </li>
            ))}
          </ul>
        )}
        {view.checked === null ? null : <span className="keep__next">{view.checked}</span>}
        <a
          className="btn btn--primary btn--wide pick-card__go"
          href={props.directions}
          target="_blank"
          rel="noopener noreferrer"
          onClick={props.onDirections}
        >
          <Icon icon={Navigation} />
          <span className="btn__label">{t("student.pick.directions")}</span>
        </a>
      </article>
      {/* Changing the pick sits under the card: Directions belongs to this spot, these do not. */}
      <div className="pick-card__more">
        <Button variant="quiet" icon={<Icon icon={Shuffle} />} onClick={props.onSomethingElse}>
          {t("student.pick.something_else")}
        </Button>
        <Button variant="quiet" icon={<Icon icon={Sparkles} />} onClick={props.onSurprise}>
          {t("student.pick.surprise")}
        </Button>
      </div>
    </section>
  );
}

/** Two more good options, each a row to its spot page. */
export function AltRows(props: { views: readonly PickCardView[] }) {
  const headingId = useId();
  if (props.views.length === 0) return null;
  return (
    <section aria-labelledby={headingId}>
      <GroupHeading id={headingId}>{t("student.pick.alternates")}</GroupHeading>
      <ul className="row-list pick-alts">
        {props.views.map((v) => (
          <Row
            key={v.id}
            title={v.name}
            sub={[v.walk, v.busy, ...(v.checked === null ? [] : [v.checked])].join(DOT)}
            link={{ to: "/spot/$slug", params: { slug: v.slug }, search: { via: "pick" } }}
          />
        ))}
      </ul>
    </section>
  );
}
