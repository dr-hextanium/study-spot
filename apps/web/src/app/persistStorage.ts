import type { KeyValueCache } from "@study-spot/ui-logic";

/**
 * Storage for the persisted query cache. The copy is a cache: a storage
 * failure (quota, timeout) costs only the copy. But a read that failed says
 * nothing about what is stored, and the query client would then save its empty
 * state over a good snapshot. So writes wait until a read succeeded (a stored
 * value, or nothing stored); a write retries the read itself, so one transient
 * failure does not block saves for the session. A snapshot with no queries is
 * never written either: it holds nothing worth keeping, and the query client
 * saves one after a sign-out has cleared it.
 */
export function createPersistStorage(cache: KeyValueCache) {
  let restored = false;
  return {
    getItem: async (key: string): Promise<string | null> => {
      try {
        const value = await cache.get(key);
        restored = true;
        return value;
      } catch {
        return null;
      }
    },
    setItem: async (key: string, value: string): Promise<void> => {
      if (!restored) {
        try {
          await cache.get(key);
          restored = true;
        } catch {
          return;
        }
      }
      if (hasNoQueries(value)) return;
      await cache.set(key, value).catch(() => undefined);
    },
    removeItem: (key: string): Promise<void> => cache.delete(key).catch(() => undefined),
  };
}

/** True for a persisted client whose dehydrated queries are empty. Unparseable text is not judged. */
function hasNoQueries(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || !("clientState" in parsed)) return false;
    const state = parsed.clientState;
    if (typeof state !== "object" || state === null || !("queries" in state)) return false;
    return Array.isArray(state.queries) && state.queries.length === 0;
  } catch {
    return false;
  }
}
