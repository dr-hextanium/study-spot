/** Walking directions to the spot. Only the spot's coordinates are in the link. */
export function directionsUrl(spot: { lat: number; lng: number }, ios: boolean): string {
  const point = encodeURIComponent(`${spot.lat},${spot.lng}`);
  return ios
    ? `https://maps.apple.com/?daddr=${point}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=walking`;
}
