import { expect, test, vi } from "vitest";
import {
  createBroadcastSignal,
  createForeground,
  createGeolocation,
  createLocalStorage,
  createNetworkStatus,
  createShare,
} from "../src/adapters/browser.ts";

// The fakes below implement only what each adapter reads, so they are cast to the DOM types.

test("the network status follows online and offline events", () => {
  const network = createNetworkStatus();
  const seen: boolean[] = [];
  const stop = network.subscribe((online) => seen.push(online));
  window.dispatchEvent(new Event("offline"));
  window.dispatchEvent(new Event("online"));
  stop();
  window.dispatchEvent(new Event("offline"));
  expect(seen).toEqual([false, true]);
});

test("foreground fires only when the page becomes visible", () => {
  const foreground = createForeground();
  const fired = vi.fn();
  foreground.subscribe(fired);
  const state = vi.spyOn(document, "visibilityState", "get");
  state.mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  state.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(fired).toHaveBeenCalledTimes(1);
});

test("storage falls back to memory when localStorage throws", () => {
  const blocked = {
    get localStorage(): Storage {
      throw new DOMException("blocked", "SecurityError");
    },
  } as unknown as Window;
  const storage = createLocalStorage(blocked);
  storage.setItem("k", "v");
  expect(storage.getItem("k")).toBe("v");
  storage.removeItem("k");
  expect(storage.getItem("k")).toBeNull();
});

test("the broadcast signal reaches another channel of the same name", async () => {
  const a = createBroadcastSignal("test-signal");
  const b = createBroadcastSignal("test-signal");
  const got = new Promise<void>((resolve) => b.subscribe(resolve));
  a.post();
  await expect(got).resolves.toBeUndefined();
});

test("geolocation resolves a fix, or null when denied", async () => {
  const fix = {
    geolocation: {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 40.9, longitude: -73.1, accuracy: 12 } } as GeolocationPosition),
    },
  } as unknown as Navigator;
  expect(await createGeolocation(fix).current()).toEqual({
    lat: 40.9,
    lng: -73.1,
    accuracyMeters: 12,
  });
  const denied = {
    geolocation: {
      getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
        fail({ code: 1 } as GeolocationPositionError),
    },
  } as unknown as Navigator;
  expect(await createGeolocation(denied).current()).toBeNull();
});

test("share copies the link, or opens the share sheet when the clipboard is blocked", async () => {
  const writeText = vi.fn(async () => {});
  expect(
    await createShare({ clipboard: { writeText } } as unknown as Navigator).share({
      title: "Perch",
      url: "u",
    }),
  ).toBe("copied");
  const share = vi.fn(async () => {});
  const blocked = {
    clipboard: { writeText: async () => Promise.reject(new Error("denied")) },
    share,
  } as unknown as Navigator;
  expect(await createShare(blocked).share({ title: "Perch", url: "u" })).toBe("shared");
  expect(share).toHaveBeenCalledWith({ title: "Perch", url: "u" });
});
