import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import "./map.css";
import type { Pin } from "./pin.ts";
import { diffPins, fitKey } from "./pinDiff.ts";
import { MAP_STYLE } from "./styles.ts";

type Props = {
  pins: readonly Pin[];
  /** Where the view starts: the From building, as plain numbers so a re-render is not a move. */
  centerLat: number;
  centerLng: number;
  /** The view may not leave campus: [[west, south], [east, north]]. */
  maxBounds: [[number, number], [number, number]] | null;
  selected: string | null;
  onSelect(id: string): void;
  theme: "light" | "dark";
  onError(): void;
  /** The map's accessible name. */
  label: string;
};

/**
 * The map: MapLibre GL on OpenFreeMap tiles, with one button pin per spot. This is
 * the only module that imports maplibre-gl, and it is loaded on demand, so the
 * library stays out of the main bundle and the offline precache.
 */
export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loaded = useRef(false);
  // The markers on the map by spot id, with the pin each one last drew.
  const markers = useRef<
    Map<string, { pin: Pin; marker: maplibregl.Marker; el: HTMLButtonElement }>
  >(new Map());
  const fitted = useRef<string | null>(null);
  // The latest callbacks and first theme, so the map is built once.
  const latest = useRef(props);
  latest.current = props;
  const firstTheme = useRef(props.theme);

  useEffect(() => {
    const el = container.current;
    if (el === null) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: el,
        style: MAP_STYLE[firstTheme.current],
        center: [latest.current.centerLng, latest.current.centerLat],
        zoom: 16,
        ...(latest.current.maxBounds === null ? {} : { maxBounds: latest.current.maxBounds }),
        attributionControl: { compact: false },
      });
    } catch {
      latest.current.onError();
      return;
    }
    mapRef.current = map;
    map.on("load", () => {
      loaded.current = true;
    });
    // A failed style or worker before the first paint means there is no map to show.
    map.on("error", () => {
      if (!loaded.current) latest.current.onError();
    });
    const placed = markers.current;
    return () => {
      loaded.current = false;
      mapRef.current = null;
      placed.clear();
      fitted.current = null;
      map.remove();
    };
  }, []);

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    mapRef.current?.setStyle(MAP_STYLE[props.theme]);
  }, [props.theme]);

  const { pins, centerLat, centerLng } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const placed = markers.current;
    const prev = new Map([...placed].map(([id, m]) => [id, m.pin]));
    const diff = diffPins(prev, pins);
    for (const id of diff.remove) {
      placed.get(id)?.marker.remove();
      placed.delete(id);
    }
    for (const pin of diff.update) {
      const m = placed.get(pin.id);
      if (m === undefined) continue;
      // Patched in place: the same button stays in the page, so focus stays on it.
      m.el.className = `pin pin--${pin.bucket}`;
      m.el.setAttribute("aria-label", pin.label);
      m.marker.setLngLat([pin.lng, pin.lat]);
      m.pin = pin;
    }
    for (const pin of diff.add) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `pin pin--${pin.bucket}`;
      el.setAttribute("aria-label", pin.label);
      el.setAttribute("aria-pressed", String(pin.id === latest.current.selected));
      el.addEventListener("click", () => latest.current.onSelect(pin.id));
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      placed.set(pin.id, { pin, marker, el });
    }
    // Fit only when the set of spots or the From changes, never on a tap.
    const key = fitKey(pins, { lat: centerLat, lng: centerLng });
    if (key !== fitted.current) {
      fitted.current = key;
      if (pins.length > 1) {
        const bounds = new maplibregl.LngLatBounds([centerLng, centerLat], [centerLng, centerLat]);
        for (const pin of pins) bounds.extend([pin.lng, pin.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 0 });
      }
    }
  }, [pins, centerLat, centerLng]);

  useEffect(() => {
    for (const [id, m] of markers.current)
      m.el.setAttribute("aria-pressed", String(id === props.selected));
  }, [props.selected]);

  return <section className="map" ref={container} aria-label={props.label} />;
}
