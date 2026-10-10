import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import "./map.css";
import type { Pin } from "./pin.ts";
import { MAP_STYLE } from "./styles.ts";

type Props = {
  pins: Pin[];
  center: { lat: number; lng: number };
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
  const pinEls = useRef<Map<string, HTMLButtonElement>>(new Map());
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
        center: [latest.current.center.lng, latest.current.center.lat],
        zoom: 16,
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
    return () => {
      loaded.current = false;
      mapRef.current = null;
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

  const { pins, center } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const markers: maplibregl.Marker[] = [];
    const els = new Map<string, HTMLButtonElement>();
    const bounds = new maplibregl.LngLatBounds([center.lng, center.lat], [center.lng, center.lat]);
    for (const pin of pins) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `pin pin--${pin.bucket}`;
      element.setAttribute("aria-label", pin.label);
      element.setAttribute("aria-pressed", String(pin.id === latest.current.selected));
      element.addEventListener("click", () => latest.current.onSelect(pin.id));
      markers.push(
        new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map),
      );
      els.set(pin.id, element);
      bounds.extend([pin.lng, pin.lat]);
    }
    pinEls.current = els;
    if (pins.length > 1) map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 0 });
    return () => {
      for (const m of markers) m.remove();
      pinEls.current = new Map();
    };
  }, [pins, center]);

  useEffect(() => {
    for (const [id, el] of pinEls.current)
      el.setAttribute("aria-pressed", String(id === props.selected));
  }, [props.selected]);

  return <section className="map" ref={container} aria-label={props.label} />;
}
