import {
  ARRIVE,
  type Arrive,
  BROWSE_FILTER_GROUP,
  BROWSE_FILTERS,
  dataAgeView,
  hiddenLockedText,
  searchBrowse,
  t,
} from "@perch/ui-logic";
import { Lock, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useBrowse } from "../../hooks/useBrowse.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Check } from "../../ui/Check.tsx";
import { FilterChips } from "../../ui/FilterChips.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Row } from "../../ui/Row.tsx";
import { Meta, Screen } from "../../ui/Screen.tsx";
import { Search } from "../../ui/Search.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Loading, Skel, SkelRows } from "../../ui/Skeleton.tsx";
import { BrowseMap } from "./BrowseMap.tsx";
import { FiltersSheet } from "./FiltersSheet.tsx";
import "./browse.css";

const ARRIVE_LABEL = {
  now: "student.browse.arrive.now",
  "1": "student.browse.arrive.1",
  "2": "student.browse.arrive.2",
  "4": "student.browse.arrive.4",
  tonight: "student.browse.arrive.tonight",
} as const satisfies Record<Arrive, Parameters<typeof t>[0]>;

/** Browse: every spot read at a chosen arrival time, as a list or a map. */
export function Browse() {
  const b = useBrowse();
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(false);
  const title = t("student.browse.title");

  if (b.state === "loading") {
    return (
      <Screen title={title} busy>
        <Loading>
          <SkelRows count={6} />
          <Skel kind="line" w="40%" />
        </Loading>
      </Screen>
    );
  }
  if (b.state === "unavailable" || b.view === null || b.bundle === null) {
    return (
      <Screen title={title}>
        <p className="lede" role="status">
          {b.unavailable === "update_required"
            ? t("student.data.update_required")
            : t("student.data.unavailable")}
        </p>
      </Screen>
    );
  }

  const age = dataAgeView(b.ageDays, b.checkFailed);
  const shown = searchBrowse(b.view, query);
  const hidden = hiddenLockedText(b.view.hiddenLocked);
  const filterCount =
    b.prefs.extra.length + (b.prefs.openOnly ? 1 : 0) + (b.prefs.showLocked ? 1 : 0);
  const building = b.bundle.buildings.find((x) => x.id === b.from) ?? null;
  const clear = () => {
    setQuery("");
    b.set({ extra: [], openOnly: false });
  };

  return (
    <Screen
      title={title}
      meta={
        <Meta>
          <span className="meta__item">{shown.count}</span>
          <span className="meta__item">{age.line}</span>
          {age.offline ? <span className="meta__item">{t("student.data.offline")}</span> : null}
        </Meta>
      }
    >
      {age.prominent === null ? null : <Banner tone="note">{age.prominent}</Banner>}
      <Segmented
        label={t("student.browse.view.label")}
        hideLabel
        options={[
          { value: "list", label: t("student.browse.view.list") },
          { value: "map", label: t("student.browse.view.map") },
        ]}
        value={b.prefs.view}
        onChange={(view) => b.set({ view })}
      />
      <Search label={t("student.browse.search.label")} value={query} onChange={setQuery} />
      <FilterChips
        label={t("student.browse.arrive.label")}
        options={ARRIVE.map((value) => ({ value, label: t(ARRIVE_LABEL[value]) }))}
        value={b.prefs.arrive}
        onChange={(arrive) => b.set({ arrive })}
      />
      <div className="browse__tools">
        <Button
          variant="quiet"
          icon={<Icon icon={SlidersHorizontal} />}
          onClick={() => setSheet(true)}
        >
          {filterCount === 0
            ? t("student.browse.filters")
            : t("student.browse.filters_count", { count: filterCount })}
        </Button>
      </div>
      <p className="field__helper browse__caption">{b.view.caption}</p>

      {shown.rows.length > 0 && b.prefs.view === "map" ? (
        <BrowseMap view={shown} from={building} buildings={b.bundle.buildings} />
      ) : shown.rows.length === 0 ? (
        <div className="browse__empty">
          <p className="empty">{t("student.browse.empty")}</p>
          <Button variant="quiet" onClick={clear}>
            {t("student.browse.clear")}
          </Button>
        </div>
      ) : (
        <ul className="row-list">
          {shown.rows.map((row) => (
            <Row
              key={row.spot.id}
              title={row.name}
              sub={row.sub}
              muted={row.locked}
              {...(row.locked
                ? { lead: <Icon icon={Lock} size={18} className="browse__lock" /> }
                : {})}
              end={
                <span className="browse__end">
                  <span>{row.busy}</span>
                  <span>{row.checked}</span>
                </span>
              }
              link={{ to: "/spot/$slug", params: { slug: row.spot.slug } }}
            />
          ))}
        </ul>
      )}

      {hidden === null ? null : (
        <Button variant="ghost" onClick={() => b.set({ showLocked: true })}>
          {hidden}
        </Button>
      )}

      <FiltersSheet
        open={sheet}
        title={t("student.browse.filters.title")}
        groups={BROWSE_FILTER_GROUP}
        filters={BROWSE_FILTERS}
        extra={b.prefs.extra}
        onChange={(extra) => b.set({ extra })}
        onClear={() => b.set({ extra: [], openOnly: false, showLocked: false })}
        onClose={() => setSheet(false)}
      >
        <Check
          label={t("student.browse.open_only")}
          checked={b.prefs.openOnly}
          onChange={(openOnly) => b.set({ openOnly })}
        />
        <Check
          label={t("student.browse.show_locked")}
          checked={b.prefs.showLocked}
          onChange={(showLocked) => b.set({ showLocked })}
        />
      </FiltersSheet>
    </Screen>
  );
}
