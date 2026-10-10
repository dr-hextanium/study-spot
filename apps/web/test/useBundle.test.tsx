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
