import { act, renderHook, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProvider } from "../src/app/AppProvider.tsx";
import { useBundle } from "../src/hooks/useBundle.ts";
import { useCampusNow } from "../src/hooks/useCampusNow.ts";
import { renderApp, testApp } from "./harness.tsx";

function Phase() {
  return <p>{useBundle().phase}</p>;
}

test("useBundle shows the store's phase and starts it once", () => {
  const app = testApp({ me: null });
  const start = vi.spyOn(app.deps.bundle, "start");
  renderApp(app, <Phase />);
  expect(screen.getByText("ready")).toBeTruthy();
  expect(start).toHaveBeenCalledTimes(1);
});

test("useBundle reports an unavailable bundle", () => {
  const app = testApp({ me: null, bundle: { phase: "unavailable", reason: "offline_no_cache" } });
  renderApp(app, <Phase />);
  expect(screen.getByText("unavailable")).toBeTruthy();
});

test("useCampusNow ticks every minute and when the page returns", () => {
  vi.useFakeTimers();
  try {
    const app = testApp({ me: null, now: "2026-10-13T18:00:00Z" });
    const { result, unmount } = renderHook(() => useCampusNow(), {
      wrapper: ({ children }) => <AppProvider deps={app.deps}>{children}</AppProvider>,
    });
    expect(result.current.toISOString()).toBe("2026-10-13T18:00:00.000Z");
    app.clock.set("2026-10-13T18:01:00Z");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.toISOString()).toBe("2026-10-13T18:01:00.000Z");
    app.clock.set("2026-10-13T20:00:00Z");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.toISOString()).toBe("2026-10-13T20:00:00.000Z");
    unmount();
    app.clock.set("2026-10-13T21:00:00Z");
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current.toISOString()).toBe("2026-10-13T20:00:00.000Z");
  } finally {
    vi.useRealTimers();
  }
});

test("useCampusNow takes the corrected time as soon as the store learns the skew", () => {
  const app = testApp({ me: null, now: "2026-10-10T09:00:00Z" });
  let skewMs = 0;
  const listeners = new Set<() => void>();
  app.deps.bundle = {
    ...app.deps.bundle,
    now: () => new Date(app.clock.now().getTime() + skewMs),
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
  const { result } = renderHook(() => useCampusNow(), {
    wrapper: ({ children }) => <AppProvider deps={app.deps}>{children}</AppProvider>,
  });
  expect(result.current.toISOString()).toBe("2026-10-10T09:00:00.000Z");
  skewMs = 3 * 24 * 3_600_000;
  act(() => {
    for (const l of listeners) l();
  });
  expect(result.current.toISOString()).toBe("2026-10-13T09:00:00.000Z");
});
