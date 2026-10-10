/** Escapes a string for use inside a RegExp, so the origin's dots match only dots. */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The service worker's rule for approved spot photos: only from the data site's own
 * origin, and only full 200 responses. Photos load with crossOrigin="anonymous" and the
 * data site sends Access-Control-Allow-Origin, so a response is never opaque.
 *
 * The pattern is a RegExp, not a function: Workbox writes it into sw.js as text, and a
 * function would lose the origin it closes over.
 */
export function photoCacheRule(dataOrigin: string) {
  const origin = dataOrigin.replace(/\/+$/, "");
  return {
    urlPattern: new RegExp(`^${escapeRegExp(origin)}/photos/[^/]+$`),
    handler: "CacheFirst" as const,
    options: {
      cacheName: "perch-photos",
      expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
      cacheableResponse: { statuses: [200] },
    },
  };
}
