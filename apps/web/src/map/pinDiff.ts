import type { Pin } from "./pin.ts";

/** What to do to the markers on the map so they match the next pins. No map library here. */
export type PinDiff = { add: Pin[]; update: Pin[]; remove: string[] };

const same = (a: Pin, b: Pin): boolean =>
  a.slug === b.slug &&
  a.lat === b.lat &&
  a.lng === b.lng &&
  a.bucket === b.bucket &&
  a.label === b.label;

/**
 * Markers are kept by spot id: a pin already on the map is patched in place (so a focused
 * pin keeps focus), never removed and drawn again.
 */
export function diffPins(prev: ReadonlyMap<string, Pin>, next: readonly Pin[]): PinDiff {
  const add: Pin[] = [];
  const update: Pin[] = [];
  const seen = new Set<string>();
  for (const p of next) {
    seen.add(p.id);
    const old = prev.get(p.id);
    if (old === undefined) add.push(p);
    else if (!same(old, p)) update.push(p);
  }
  const remove = [...prev.keys()].filter((id) => !seen.has(id));
  return { add, update, remove };
}

/**
 * The view is fitted again only when this changes: the set of spots (a filter, a search)
 * or the From building. A tap, a new busyness hour or a re-render leaves the view alone.
 */
export function fitKey(pins: readonly Pin[], center: { lat: number; lng: number }): string {
  return `${center.lat},${center.lng}|${pins
    .map((p) => p.id)
    .sort()
    .join(",")}`;
}

/** About 2 km at campus latitude: room to pan a little past the outermost building. */
export const CAMPUS_MARGIN_DEG = 0.02;

/** The map may not pan away from campus: every building plus a margin, as [[w, s], [e, n]]. */
export function campusBounds(
  points: readonly { lat: number; lng: number }[],
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  const m = CAMPUS_MARGIN_DEG;
  return [
    [west - m, south - m],
    [east + m, north + m],
  ];
}
