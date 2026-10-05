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
} from "@study-spot/ui-logic";

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
  try {
    const probe = "study-spot:probe";
    win.localStorage.setItem(probe, "1");
    win.localStorage.removeItem(probe);
    return win.localStorage;
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

export const OUTBOX_CHANNEL = "study-spot:outbox";

/** Wakes other tabs of this origin when the queue changes. A no-op where BroadcastChannel is missing. */
export function createBroadcastSignal(name: string = OUTBOX_CHANNEL): QueueSignal {
  if (typeof BroadcastChannel === "undefined") {
    return { post: () => {}, subscribe: () => () => {} };
  }
  const channel = new BroadcastChannel(name);
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
