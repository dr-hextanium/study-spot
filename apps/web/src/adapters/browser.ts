import type {
  Clock,
  Foreground,
  GeolocationAdapter,
  Ids,
  KeyValueStorage,
  NetworkStatus,
  QueueSignal,
  Share,
  Timers,
} from "@perch/ui-logic";

export const systemClock: Clock = { now: () => new Date() };

export const browserIds: Ids = { uuid: () => crypto.randomUUID() };

export const browserTimers: Timers = {
  after(ms, fn) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

/** Fires when the page becomes visible again (unlocking the phone, switching back to the app). */
export function createForeground(doc: Document = document): Foreground {
  return {
    subscribe(listener) {
      const onChange = () => {
        if (doc.visibilityState === "visible") listener();
      };
      doc.addEventListener("visibilitychange", onChange);
      return () => doc.removeEventListener("visibilitychange", onChange);
    },
  };
}

export function createNetworkStatus(win: Window = window): NetworkStatus {
  return {
    online: () => win.navigator.onLine,
    subscribe(listener) {
      const on = () => listener(true);
      const off = () => listener(false);
      win.addEventListener("online", on);
      win.addEventListener("offline", off);
      return () => {
        win.removeEventListener("online", on);
        win.removeEventListener("offline", off);
      };
    },
  };
}

/**
 * localStorage for the session token, falling back to memory when storage is
 * blocked (some private modes throw on access). setItem can still throw on a
 * full disk; callers handle that.
 */
export function createLocalStorage(win: Window = window): KeyValueStorage {
  return probedStorage(() => win.localStorage);
}

/** sessionStorage with the same probe and memory fallback as `createLocalStorage`. */
export function createSessionStorage(win: Window = window): KeyValueStorage {
  return probedStorage(() => win.sessionStorage);
}

function probedStorage(pick: () => Storage): KeyValueStorage {
  try {
    const storage = pick();
    // Probe key only; keeps the old project name, nothing to migrate.
    const probe = "study-spot:probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    };
  }
}

// Channel name. Keeps the old project name on purpose: tabs on the old and new build must hear each other.
export const OUTBOX_CHANNEL = "study-spot:outbox";

/** Wakes other tabs of this origin when the queue changes. A no-op where BroadcastChannel is missing. */
export function createBroadcastSignal(name: string = OUTBOX_CHANNEL): QueueSignal {
  const none: QueueSignal = { post: () => {}, subscribe: () => () => {} };
  if (typeof BroadcastChannel === "undefined") return none;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(name);
  } catch {
    return none;
  }
  return {
    post: () => channel.postMessage("changed"),
    subscribe(listener) {
      const onMessage = () => listener();
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
  };
}

export const GEO_TIMEOUT_MS = 15_000;

/** One fix, or null when location is off, denied, or slow. Never throws. */
export function createGeolocation(nav: Navigator = navigator): GeolocationAdapter {
  return {
    current: () =>
      new Promise((resolve) => {
        if (!("geolocation" in nav)) {
          resolve(null);
          return;
        }
        nav.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyMeters: pos.coords.accuracy,
            }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 30_000 },
        );
      }),
  };
}

/** Copies a link (the buttons say "Copy link"); the share sheet only when the clipboard is blocked. */
export function createShare(nav: Navigator = navigator): Share {
  return {
    async share(data) {
      try {
        await nav.clipboard.writeText(data.url);
        return "copied";
      } catch {
        // Clipboard blocked or missing (insecure context); try the share sheet.
      }
      if (typeof nav.share !== "function") return "failed";
      try {
        await nav.share(data);
        return "shared";
      } catch {
        return "failed";
      }
    },
  };
}

/**
 * Sends the pick ping. Fire and forget: no cookies, no preflight (text/plain), survives the
 * page closing, and a failure is dropped.
 */
export function sendPickPing(url: string, body: string): void {
  void fetch(url, {
    method: "POST",
    body,
    keepalive: true,
    credentials: "omit",
    headers: { "content-type": "text/plain" },
  }).catch(() => {});
}
