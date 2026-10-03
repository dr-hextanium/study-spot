export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const ROUTE_FACTOR = 1.3;
const WALK_SPEED_MPS = 1.3;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Walking minutes when no footpath route exists: straight line times 1.3 at 1.3 m/s. */
export function fallbackWalkMinutes(a: LatLng, b: LatLng): number {
  const seconds = (haversineMeters(a, b) * ROUTE_FACTOR) / WALK_SPEED_MPS;
  return Math.ceil(seconds / 60);
}
