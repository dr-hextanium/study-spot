import type { KeyValueCache } from "@study-spot/ui-logic";

/**
 * Storage for the persisted query cache. The copy is a cache: a storage
 * failure (quota, timeout) costs only the copy. But a read that failed says
 * nothing about what is stored, and the query client would then save its empty
 * state over a good snapshot. So writes wait until a read succeeded (a stored
 * value, or nothing stored).
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
      if (!restored) return;
      await cache.set(key, value).catch(() => undefined);
    },
    removeItem: (key: string): Promise<void> => cache.delete(key).catch(() => undefined),
  };
}
