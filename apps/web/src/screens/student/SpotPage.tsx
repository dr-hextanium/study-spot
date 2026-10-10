import { type AccessProfile, accessFor, type Bundle, type BundleSpot } from "@perch/core";
import {
  checkedView,
  dayForecast,
  directionsUrl,
  lockText,
  notePickAction,
  placeText,
  readAccess,
  spotName,
  t,
  weekHours,
} from "@perch/ui-logic";
import { Link } from "@tanstack/react-router";
import { Lock, Navigation, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import { useBundle } from "../../hooks/useBundle.ts";
import { useCampusNow } from "../../hooks/useCampusNow.ts";
import { useIsIos } from "../../hooks/useIsIos.ts";
import { useToasts } from "../../hooks/useToasts.tsx";
import { spotFacts } from "../../lib/spotFacts.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Row } from "../../ui/Row.tsx";
import { GroupHeading, Screen } from "../../ui/Screen.tsx";
import { Loading, Skel } from "../../ui/Skeleton.tsx";
import { ForecastBars } from "./ForecastBars.tsx";
import { SpotPhoto } from "./SpotPhoto.tsx";
import "./spotPage.css";

/** The access profile Me stores on this phone. A bad value reads as no profile. */
function useAccessProfile(): AccessProfile {
  const { prefs } = useDeps();
  return useMemo(() => readAccess(prefs).value, [prefs]);
}

/** `/spot/$slug`: one spot, from the offline bundle only. */
export function SpotPage(props: { slug: string; via: "pick" | undefined }) {
  const state = useBundle();
  if (state.phase === "loading") {
    return (
      <Screen title={t("app.name")} titleHidden busy>
        <Loading>
          <Skel kind="title" w="60%" />
          <Skel kind="photo" />
          <Skel kind="line" />
          <Skel kind="line" w="80%" />
        </Loading>
      </Screen>
    );
  }
  if (state.phase === "unavailable") {
    return (
      <Screen title={t("app.name")}>
        <p className="lede" role="status">
          {state.reason === "update_required"
            ? t("student.data.update_required")
            : t("student.data.unavailable")}
        </p>
      </Screen>
    );
  }
  const { bundle } = state.load;
  const spot = bundle.spots.find((s) => s.slug === props.slug);
  if (spot === undefined) {
    return (
      <Screen title={t("student.spot.not_found")} back={{ to: "/browse" }}>
        <Link to="/browse" className="btn btn--quiet">
          {t("student.spot.back_to_browse")}
        </Link>
      </Screen>
    );
  }
  return <SpotBody bundle={bundle} spot={spot} via={props.via} />;
}

function SpotBody(props: { bundle: Bundle; spot: BundleSpot; via: "pick" | undefined }) {
  const { bundle, spot, via } = props;
  const { webShare, pickPing, prefs, tab } = useDeps();
  const toasts = useToasts();
  const now = useCampusNow();
  const ios = useIsIos();
  const profile = useAccessProfile();
  const tz = bundle.campus.tz;

  // The pick ping: once when this page opens from a pick card, never on a plain render.
  const pinged = useRef<string | null>(null);
  useEffect(() => {
    if (via !== "pick" || pinged.current === spot.id) return;
    pinged.current = spot.id;
    pickPing(spot.id);
    // Opening a pick is a pick action: it counts this tab's visit for the install note.
    notePickAction(prefs, tab);
  }, [via, spot.id, pickPing, prefs, tab]);

  const name = spotName(spot);
  const checked = checkedView(spot, tz);
  const lock = lockText(accessFor(spot, profile, bundle.buildings));
  const forecast = dayForecast(bundle, spot.id, now);
  const hours = weekHours(bundle, spot, now);
  const facts = spotFacts(spot);
  const photos = [...spot.photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover));
  const cover = photos[0] ?? null;
  const others = photos.slice(1);

  async function share(): Promise<void> {
    const result = await webShare.share({
      title: name,
      url: `${location.origin}/spot/${spot.slug}`,
    });
    if (result === "copied") toasts.show(t("student.spot.shared"));
    if (result === "failed") toasts.show(t("student.spot.share_failed"));
  }

  return (
    <Screen
      title={name}
      back={via === "pick" ? { to: "/" } : { to: "/browse" }}
      meta={<p className="meta">{`${placeText(spot, bundle)} · ${checked.latest}`}</p>}
    >
      {lock === null ? null : (
        <Banner tone="note" icon={Lock}>
          {lock}
        </Banner>
      )}
      <div className="spot-cover">
        <SpotPhoto photo={cover} alt={name} />
      </div>
      {others.length === 0 ? null : (
        <ul className="photos">
          {others.map((p) => (
            <li key={p.url} className="photo">
              <SpotPhoto photo={p} alt={name} />
            </li>
          ))}
        </ul>
      )}
      <div className="spot-actions">
        <a
          className="btn btn--primary"
          href={directionsUrl(spot, ios)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            // Only a spot reached from a pick counts; Browse and shared links send nothing.
            if (via === "pick") pickPing(spot.id);
          }}
        >
          <Icon icon={Navigation} />
          <span className="btn__label">{t("student.spot.directions")}</span>
        </a>
        <Button variant="quiet" icon={<Icon icon={Share2} />} onClick={() => void share()}>
          {t("student.spot.share")}
        </Button>
      </div>

      <section aria-labelledby="spot-there">
        <GroupHeading id="spot-there">{t("student.spot.getting_there")}</GroupHeading>
        <p className="spot-body">{spot.directions}</p>
      </section>

      <section aria-labelledby="spot-busy">
        <GroupHeading id="spot-busy">{t("student.spot.busy_heading")}</GroupHeading>
        <ForecastBars view={forecast} />
      </section>

      <section aria-labelledby="spot-hours">
        <GroupHeading id="spot-hours">{hours.heading}</GroupHeading>
        {hours.unconfirmed ? <p className="lede">{t("student.spot.hours_unconfirmed")}</p> : null}
        <ul className="row-list">
          {hours.days.map((d) => (
            <Row
              key={d.dow}
              compact
              title={d.name}
              end={d.text}
              {...(d.today ? { sub: t("student.spot.today") } : {})}
            />
          ))}
        </ul>
      </section>

      {facts.length === 0 ? null : (
        <section aria-labelledby="spot-details">
          <GroupHeading id="spot-details">{t("student.spot.details")}</GroupHeading>
          <ul className="row-list">
            {facts.map((f) => (
              <Row key={f.label} compact title={f.label} end={f.value} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="spot-checked">
        <GroupHeading id="spot-checked">{t("student.spot.last_checked")}</GroupHeading>
        <ul className="row-list">
          {checked.groups.map((g) => (
            <Row key={g.group} compact title={g.name} end={g.date} />
          ))}
        </ul>
      </section>

      <p className="spot-license">
        {t("student.spot.license", {
          license: bundle.data_license,
          attribution: bundle.attribution,
        })}
      </p>
    </Screen>
  );
}
