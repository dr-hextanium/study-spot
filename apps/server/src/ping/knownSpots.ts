import { building, type Db, spot } from "@perch/db";
import { and, eq } from "drizzle-orm";
import type { Clock } from "../clock.ts";

export const KNOWN_SPOTS_TTL_MS = 600_000;

export type KnownSpots = {
  has(spotId: string): Promise<boolean>;
  /** Forces a reload on the next `has`, for a caller that knows spots just changed. */
  invalidate(): void;
};

/**
 * The published spot ids of the campus, held in memory so a random uuid cannot force a
 * flush or wake the database. Loaded on first use and reloaded at most every ttl. A failed
 * reload keeps the old set and waits out the interval; with no set yet, nothing is known.
 */
export function createKnownSpots(deps: {
  clock: Clock;
  load(): Promise<readonly string[]>;
  ttlMs?: number;
}): KnownSpots {
  const ttl = deps.ttlMs ?? KNOWN_SPOTS_TTL_MS;
  let ids = new Set<string>();
  let loadedAt: number | null = null;
  let inflight: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    try {
      ids = new Set(await deps.load());
    } catch {
      // Keep the old set.
    }
    loadedAt = deps.clock.now().getTime();
  }

  return {
    async has(spotId) {
      const stale = loadedAt === null || deps.clock.now().getTime() - loadedAt >= ttl;
      if (stale) {
        inflight ??= refresh().finally(() => {
          inflight = null;
        });
        await inflight;
      }
      return ids.has(spotId);
    },
    invalidate() {
      loadedAt = null;
    },
  };
}

export function dbKnownSpots(db: Db, campusId: string, clock: Clock): KnownSpots {
  return createKnownSpots({
    clock,
    load: async () => {
      const rows = await db
        .select({ id: spot.id })
        .from(spot)
        .innerJoin(building, eq(spot.building_id, building.id))
        .where(and(eq(building.campus_id, campusId), eq(spot.status, "published")));
      return rows.map((r) => r.id);
    },
  });
}
