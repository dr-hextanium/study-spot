import type { SurveySpot } from "@perch/core";
import {
  type BinaryCache,
  type BundleStore,
  type Clock,
  createBundleStore,
  createOutbox,
  createPickPing,
  createSessionStore,
  createSurveyApi,
  type GeolocationAdapter,
  type KeyValueCache,
  type KeyValueStorage,
  type NetworkStatus,
  type Outbox,
  type PickPing,
  type Share,
  type SurveyApi,
} from "@perch/ui-logic";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import { z } from "zod";
import {
  browserIds,
  browserTimers,
  createBroadcastSignal,
  createForeground,
  createGeolocation,
  createLocalStorage,
  createNetworkStatus,
  createSessionStorage,
  createShare,
  sendPickPing,
  systemClock,
} from "../adapters/browser.ts";
import { createFetch } from "../adapters/fetch.ts";
import { createFetchHttp } from "../adapters/http.ts";
import { openStores } from "../adapters/idb.ts";
import { createWebLiveness, createWebLock, type LockApi } from "../adapters/locks.ts";
import { browserImageKit, type ImageKit } from "../lib/photo.ts";
import { type AuthState, createAuthState } from "./authState.ts";
import { createPersistStorage } from "./persistStorage.ts";
import { ApiFailure } from "./queries.ts";
import { applyServerSpot, sanitizePersisted } from "./serverCache.ts";
import { createSessionState, type SessionState } from "./sessionState.ts";

export type AppDeps = {
  api: SurveyApi;
  /**
   * The session store. buildAppDeps subscribes `resumeOnNewSession` to it, and
   * that subscription is what makes `join()` resume the outbox and reads, in this
   * tab and others. Any other way to build AppDeps must do the same.
   */
  session: SessionState;
  auth: AuthState;
  outbox: Outbox;
  /**
   * Signs this phone out, no UI yet: stops the outbox (no send starts after it),
   * clears the survey query cache in memory and on disk, then clears the session.
   * Queued writes stay in IndexedDB for the next sign-in to send.
   */
  signOut(): Promise<void>;
  /** The outbox's start(): its first sync pass of this page load has ended once it resolves. */
  started: Promise<void>;
  queryClient: QueryClient;
  persister: Persister;
  cache: KeyValueCache;
  blobs: BinaryCache;
  network: NetworkStatus;
  geolocation: GeolocationAdapter;
  /** Decoding and encoding for the photo resize; a seam so tests need no canvas. */
  imageKit: ImageKit;
  share: Share;
  clock: Clock;
  /** API origin, for the photo image route that the typed client does not cover. */
  apiBaseUrl: string;
  dataBaseUrl: string;
  /** The static campus bundle, cache first then revalidated. Student screens read only this. */
  bundle: BundleStore;
  /** Student preferences: localStorage, or memory when it is blocked. */
  prefs: KeyValueStorage;
  /** Per-tab student state: sessionStorage, or memory when it is blocked. */
  tab: KeyValueStorage;
  /** Random numbers in [0, 1), injected so picks are testable. */
  rand: () => number;
  /** Reports a chosen spot to the anonymous pick counter. A no-op unless VITE_PICK_PING=1. */
  pickPing: PickPing;
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
 * Signing in again with a new token, in this tab or another, resumes this tab: reads and the
 * outbox leave their signed-out state and the survey queries load again. The
 * session store is the one place all tabs agree on, so this listens there.
 */
export function resumeOnNewSession(deps: {
  session: SessionState;
  auth: AuthState;
  outbox: Outbox;
  queryClient: QueryClient;
}): () => void {
  const { session, auth, outbox, queryClient } = deps;
  let last = session.token();
  return session.subscribe(() => {
    const token = session.token();
    const changed = token !== last;
    last = token;
    // A save of the same token proves nothing new: the server refused it, so a
    // re-login hands out a fresh one. Resuming on it would only fail again.
    if (token === null || !changed) return;
    auth.reset();
    outbox.resume();
    void queryClient.invalidateQueries();
  });
}

/**
 * Who the queued writes belong to after a sign-out cleared the session. Written only
 * when the queue is not empty; the invite flow compares it with the next surveyor.
 */
export const OWNER_KEY = "outbox:owner";
export const QueueOwner = z.object({ id: z.string(), display_name: z.string() });
export type QueueOwner = z.infer<typeof QueueOwner>;

/** Signs out: stop sending, drop cached server data, then drop the session. */
export function createSignOut(deps: {
  cache: KeyValueCache;
  session: SessionState;
  outbox: Outbox;
  queryClient: QueryClient;
  persister: Persister;
}): () => Promise<void> {
  return async () => {
    deps.outbox.stop();
    const me = deps.session.current();
    if (me !== null && deps.outbox.getSnapshot().records.length > 0) {
      const owner: QueueOwner = { id: me.surveyor.id, display_name: me.surveyor.display_name };
      try {
        await deps.cache.set(OWNER_KEY, JSON.stringify(owner));
      } catch {
        // Without the note the next join is not asked; the queue itself is untouched.
      }
    }
    deps.queryClient.clear();
    // The copy is a cache: a failed removal costs only a stale snapshot.
    try {
      await deps.persister.removeClient();
    } catch {
      // Nothing to do: the in-memory copy is already gone.
    }
    deps.session.clear();
  };
}

/** The persisted survey query cache, kept in `cache` (IndexedDB on the phone). */
export function createSurveyPersister(cache: KeyValueCache): Persister {
  // The persisted copy is a cache: a storage failure (quota, timeout) costs only the copy.
  return createAsyncStoragePersister({
    storage: createPersistStorage(cache),
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
}

/**
 * The one AppDeps of this page. A second outbox would share this tab's id and
 * Web Lock name, so a hot reload of this module must hand back the first one:
 * `import.meta.hot.data` survives the reload, a plain module variable would not.
 */
const slot: { deps?: AppDeps } = import.meta.hot?.data ?? {};

/** Wires every browser adapter into the shared logic. Safe to call twice: it builds once. */
export type AppEnv = { apiBaseUrl: string; dataBaseUrl: string; pickPing: boolean };

export function createAppDeps(env: AppEnv): AppDeps {
  if (slot.deps !== undefined) return slot.deps;
  const deps = buildAppDeps(env);
  slot.deps = deps;
  return deps;
}

function buildAppDeps(env: AppEnv): AppDeps {
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
  resumeOnNewSession({ session, auth, outbox, queryClient });
  outbox.onApplied((spot: SurveySpot) => applyServerSpot(queryClient, spot));
  const persister = createSurveyPersister(stores.cache);
  return {
    api,
    session,
    auth,
    outbox,
    signOut: createSignOut({ cache: stores.cache, session, outbox, queryClient, persister }),
    started: outbox.start(),
    queryClient,
    persister,
    cache: stores.cache,
    blobs: stores.blobs,
    network,
    geolocation: createGeolocation(),
    imageKit: browserImageKit,
    share: createShare(),
    clock: systemClock,
    apiBaseUrl: env.apiBaseUrl,
    dataBaseUrl: env.dataBaseUrl,
    bundle: createBundleStore(
      {
        fetch: createFetch(),
        cache: stores.cache,
        clock: systemClock,
        foreground: createForeground(),
        network,
      },
      env.dataBaseUrl,
    ),
    prefs: createLocalStorage(),
    tab: createSessionStorage(),
    rand: Math.random,
    pickPing: createPickPing(
      { send: sendPickPing, tab: createSessionStorage(), enabled: env.pickPing },
      env.apiBaseUrl,
    ),
  };
}
