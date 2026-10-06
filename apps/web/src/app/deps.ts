import type { SurveySpot } from "@study-spot/core";
import {
  type BinaryCache,
  type Clock,
  createOutbox,
  createSessionStore,
  createSurveyApi,
  type GeolocationAdapter,
  type KeyValueCache,
  type NetworkStatus,
  type Outbox,
  type Share,
  type SurveyApi,
} from "@study-spot/ui-logic";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import {
  browserIds,
  browserTimers,
  createBroadcastSignal,
  createForeground,
  createGeolocation,
  createLocalStorage,
  createNetworkStatus,
  createShare,
  systemClock,
} from "../adapters/browser.ts";
import { createFetchHttp } from "../adapters/http.ts";
import { openStores } from "../adapters/idb.ts";
import { createWebLiveness, createWebLock, type LockApi } from "../adapters/locks.ts";
import { type AuthState, createAuthState } from "./authState.ts";
import { ApiFailure } from "./queries.ts";
import { applyServerSpot, sanitizePersisted } from "./serverCache.ts";
import { createSessionState, type SessionState } from "./sessionState.ts";

export type AppDeps = {
  api: SurveyApi;
  session: SessionState;
  auth: AuthState;
  outbox: Outbox;
  /** The outbox's start(): its first sync pass of this page load has ended once it resolves. */
  started: Promise<void>;
  queryClient: QueryClient;
  persister: Persister;
  cache: KeyValueCache;
  blobs: BinaryCache;
  network: NetworkStatus;
  geolocation: GeolocationAdapter;
  share: Share;
  clock: Clock;
  /** API origin, for the photo image route that the typed client does not cover. */
  apiBaseUrl: string;
  dataBaseUrl: string;
};

/** Thirty days, like a session: the persisted copy outlives a long weekend offline. */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Bump when a persisted query's shape changes; old snapshots are then dropped. */
export const CACHE_BUSTER = "survey-1";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Kept for the persisted 30 days. Not CACHE_MAX_AGE_MS: timers overflow past 2^31 ms
        // (24.8 days) and would collect at once; Infinity turns collection off.
        gcTime: Number.POSITIVE_INFINITY,
        // Always look again when a screen mounts; the cached copy shows meanwhile.
        staleTime: 0,
        // Serve the cached copy first; offline reads never block a screen.
        networkMode: "offlineFirst",
        // A refused read will be refused again; only network and server trouble is worth a retry.
        retry: (count, error) =>
          count < 2 &&
          !(
            error instanceof ApiFailure &&
            (error.kind === "unauthorized" || error.kind === "invalid")
          ),
      },
    },
  });
}

/**
 * The one AppDeps of this page. A second outbox would share this tab's id and
 * Web Lock name, so a hot reload of this module must hand back the first one:
 * `import.meta.hot.data` survives the reload, a plain module variable would not.
 */
const slot: { deps?: AppDeps } = import.meta.hot?.data ?? {};

/** Wires every browser adapter into the shared logic. Safe to call twice: it builds once. */
export function createAppDeps(env: { apiBaseUrl: string; dataBaseUrl: string }): AppDeps {
  if (slot.deps !== undefined) return slot.deps;
  const deps = buildAppDeps(env);
  slot.deps = deps;
  return deps;
}

function buildAppDeps(env: { apiBaseUrl: string; dataBaseUrl: string }): AppDeps {
  const stores = openStores();
  const session = createSessionState(createSessionStore(createLocalStorage()));
  const auth = createAuthState();
  const network = createNetworkStatus();
  const api = createSurveyApi({
    http: createFetchHttp(),
    baseUrl: env.apiBaseUrl,
    token: () => session.token(),
  });
  // Web Locks are in every browser Perch supports (Safari 15.4+). Without them the
  // outbox's own createLocalLock and createLocalLiveness apply. Those cover this tab
  // only and do not exclude other tabs; a duplicate send is left to the server's
  // idempotency on client_write_id. Lock and liveness are passed together or not at
  // all, and each outbox gets its own liveness.
  const locks: LockApi | undefined =
    typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined;
  const outbox = createOutbox({
    cache: stores.cache,
    blobs: stores.blobs,
    api,
    clock: systemClock,
    ids: browserIds,
    timers: browserTimers,
    network,
    foreground: createForeground(),
    ...(locks === undefined
      ? {}
      : { lock: createWebLock(locks), liveness: createWebLiveness(locks, browserIds) }),
    signal: createBroadcastSignal(),
  });
  const queryClient = createQueryClient();
  outbox.onApplied((spot: SurveySpot) => applyServerSpot(queryClient, spot));
  // The persisted copy is a cache: a storage failure (quota, timeout) costs only the copy.
  const persister = createAsyncStoragePersister({
    storage: {
      getItem: (key) => stores.cache.get(key).catch(() => null),
      setItem: (key, value) => stores.cache.set(key, value).catch(() => undefined),
      removeItem: (key) => stores.cache.delete(key).catch(() => undefined),
    },
    key: "query:survey",
    throttleTime: 250,
    deserialize: (raw) => {
      try {
        return sanitizePersisted(JSON.parse(raw));
      } catch {
        return sanitizePersisted(null);
      }
    },
  });
  return {
    api,
    session,
    auth,
    outbox,
    started: outbox.start(),
    queryClient,
    persister,
    cache: stores.cache,
    blobs: stores.blobs,
    network,
    geolocation: createGeolocation(),
    share: createShare(),
    clock: systemClock,
    apiBaseUrl: env.apiBaseUrl,
    dataBaseUrl: env.dataBaseUrl,
  };
}
