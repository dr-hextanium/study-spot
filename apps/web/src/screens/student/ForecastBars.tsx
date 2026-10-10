import { type ForecastView, t } from "@perch/ui-logic";

const TICKS = [0, 6, 12, 18] as const;

/**
 * Today's 24 hours as bars. Counted hours are solid, estimated hours are hatched, hours
 * with no data are outlined. Nothing here says live: the caption says typical and not live,
 * and the current hour is labelled "This hour". The bars are for the eye; a hidden line
 * carries the current hour's sentence for screen readers.
 */
export function ForecastBars(props: { view: ForecastView }) {
  const { view } = props;
  if (view.kind === "none") return <p className="empty">{view.caption}</p>;
  return (
    <figure className="forecast">
      <p className="visually-hidden">{view.nowLine}</p>
      <div className="forecast__plot" aria-hidden="true">
        <div className="forecast__bars">
          {view.bars.map((bar) => (
            <span
              key={bar.hour}
              className={`forecast__bar forecast__bar--${bar.confidence}${bar.current ? " forecast__bar--current" : ""}`}
              style={{ height: bar.confidence === "none" ? "8%" : `max(6%, ${bar.ratio * 100}%)` }}
            />
          ))}
          {view.bars.map((bar) =>
            bar.current ? (
              <span
                key={`now-${bar.hour}`}
                className="forecast__now"
                style={{ "--hour": bar.hour } as React.CSSProperties}
              >
                {t("student.spot.this_hour")}
              </span>
            ) : null,
          )}
        </div>
        <div className="forecast__axis">
          {TICKS.map((hour) => (
            <span
              key={hour}
              className="forecast__tick"
              style={{ "--hour": hour } as React.CSSProperties}
            >
              {view.bars[hour]?.label}
            </span>
          ))}
        </div>
      </div>
      <ul className="forecast__legend">
        <li>
          <span className="forecast__swatch forecast__bar--measured" aria-hidden="true" />
          {t("student.spot.legend.measured")}
        </li>
        <li>
          <span className="forecast__swatch forecast__bar--estimated" aria-hidden="true" />
          {t("student.spot.legend.estimate")}
        </li>
        <li>
          <span className="forecast__swatch forecast__bar--none" aria-hidden="true" />
          {t("student.spot.legend.none")}
        </li>
      </ul>
      <figcaption className="forecast__caption">{view.caption}</figcaption>
    </figure>
  );
}
