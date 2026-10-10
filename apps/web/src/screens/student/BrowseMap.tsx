import { type BundleBuilding, FULLNESS, type Fullness } from "@perch/core";
import { type BrowseView, resolveScheme, t } from "@perch/ui-logic";
import { Link } from "@tanstack/react-router";
import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";
import { useOnline } from "../../hooks/useOnline.ts";
import type { Pin } from "../../map/pin.ts";
import { useThemePref } from "../../ui/themePref.ts";

// The only import of the map: its own chunk, fetched when Map is chosen, never precached.
const MapView = lazy(() => import("../../map/MapView.tsx"));

const BUCKET_WORD = {
  empty: "student.bucket.empty",
  some: "student.bucket.some",
  filling: "student.bucket.filling",
  nearly_full: "student.bucket.nearly_full",
  full: "student.bucket.full",
} as const satisfies Record<Fullness, Parameters<typeof t>[0]>;

const DARK = "(prefers-color-scheme: dark)";
function subscribeDark(listener: () => void): () => void {
  if (typeof matchMedia !== "function") return () => undefined;
  const mq = matchMedia(DARK);
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}
const systemDark = (): boolean => typeof matchMedia === "function" && matchMedia(DARK).matches;

/** Catches a map chunk that failed to load, so the list is still there. */
class MapBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Legend() {
  const words: [Fullness | "none", string][] = [
    ...FULLNESS.map((b): [Fullness, string] => [b, t(BUCKET_WORD[b])]),
    ["none", t("student.bucket.none")],
  ];
  return (
    <div className="map-legend">
      <p className="field__helper">{t("student.map.legend")}</p>
      <ul className="map-legend__list">
        {words.map(([bucket, word]) => (
          <li key={bucket} className="map-legend__item">
            <span className={`pin pin--${bucket}`} aria-hidden="true" />
            {word}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Browse map: pins by busyness bucket, a legend, and a card for the chosen pin. */
export function BrowseMap(props: { view: BrowseView; from: BundleBuilding | null }) {
  const online = useOnline();
  const [pref] = useThemePref();
  const dark = useSyncExternalStore(subscribeDark, systemDark, () => false);
  const theme = resolveScheme(pref, dark);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);

  const rows = props.view.rows;
  const pins: Pin[] = rows.map((r) => ({
    id: r.spot.id,
    slug: r.spot.slug,
    lat: r.spot.lat,
    lng: r.spot.lng,
    bucket: r.bucket,
    label: t("student.map.pin_label", { spot: r.name, busy: r.busyLong }),
  }));
  const first = pins[0];
  const center = props.from ?? first;
  const chosen = rows.find((r) => r.spot.id === selected) ?? null;

  const note = (text: string) => <p className="lede">{text}</p>;
  if (!online) return note(t("student.map.offline"));
  if (failed || center === undefined) return note(t("student.map.failed"));

  return (
    <>
      <MapBoundary fallback={note(t("student.map.failed"))}>
        <Suspense
          fallback={
            <div className="map map--loading" aria-busy="true">
              <p role="status">{t("student.map.loading")}</p>
            </div>
          }
        >
          <MapView
            pins={pins}
            center={{ lat: center.lat, lng: center.lng }}
            selected={selected}
            onSelect={setSelected}
            theme={theme}
            onError={onError}
            label={t("student.map.label")}
          />
        </Suspense>
      </MapBoundary>
      <Legend />
      {chosen === null ? null : (
        <div className="keep map-card">
          <span className="keep__text">
            <span className="keep__name">{chosen.name}</span>
            <span className="keep__next">{chosen.busyLong}</span>
            <span className="keep__next">{chosen.sub}</span>
            <span className="keep__next">{chosen.checked}</span>
          </span>
          <Link className="btn btn--ink" to="/spot/$slug" params={{ slug: chosen.spot.slug }}>
            <span className="btn__label">{t("student.map.open")}</span>
          </Link>
        </div>
      )}
    </>
  );
}
