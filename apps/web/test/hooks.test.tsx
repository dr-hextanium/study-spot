import { buildSpotView } from "@perch/ui-logic";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { identity, POWER, SPOT_A } from "../../../packages/ui-logic/test/builders.ts";
import { AppProvider } from "../src/app/AppProvider.tsx";
import { useCalmSyncHeader, useSyncHeader } from "../src/hooks/useOutbox.ts";
import { fieldsCleared, useSectionForm } from "../src/hooks/useSectionForm.ts";
import { useSpotView } from "../src/hooks/useSpotView.ts";
import { ME, testApp } from "./harness.tsx";

const wrap = (app: ReturnType<typeof testApp>) =>
  function Wrapper(props: { children: ReactNode }) {
    return <AppProvider deps={app.deps}>{props.children}</AppProvider>;
  };

test("a spot this phone never loaded is missing offline, and ready once fetched", async () => {
  const spot = surveySpotFixture();
  const offline = testApp({ spots: [spot] });
  offline.network.set(false);
  offline.server.offline = true;
  const missing = renderHook(() => useSpotView(spot.id), { wrapper: wrap(offline) });
  await waitFor(() => expect(missing.result.current.kind).toBe("missing"));

  const online = testApp({ spots: [spot] });
  const ready = renderHook(() => useSpotView(spot.id), { wrapper: wrap(online) });
  await waitFor(() => expect(ready.result.current.kind).toBe("ready"));
  const state = ready.result.current;
  if (state.kind !== "ready") throw new Error("not ready");
  expect(state.readiness).toEqual({ kind: "ready" });
  expect(state.tz).toBe("America/New_York");
  expect(state.statuses.find((s) => s.section === "identity")?.checkedToday).toBe(false);
});

test("a draft made on this phone shows at once, offers no review, and redirects once created", async () => {
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity({ official_name: "Stairwell Desk" }));
  const view = renderHook(() => useSpotView(local), { wrapper: wrap(app) });
  await waitFor(() => expect(view.result.current.kind).toBe("ready"));
  const state = view.result.current;
  expect(state.kind === "ready" && state.review).toBe("none");
  expect(state.kind === "ready" && state.view.localOnly).toBe(true);

  app.network.set(true);
  await act(() => app.deps.outbox.idle());
  await waitFor(() => expect(view.result.current.kind).toBe("redirect"));
});

test("fieldsCleared names required fields a write would empty on a published spot only", () => {
  const published = buildSpotView(
    surveySpotFixture({ status: "published" }),
    [],
    surveySpotFixture().id,
    null,
  );
  if (published === null) throw new Error("no view");
  const clearing = { section: "identity" as const, data: { ...identity(), directions: null } };
  expect(fieldsCleared(published, clearing)).toEqual(["directions"]);
  const draft = buildSpotView(
    surveySpotFixture({ status: "draft" }),
    [],
    surveySpotFixture().id,
    null,
  );
  if (draft === null) throw new Error("no view");
  expect(fieldsCleared(draft, clearing)).toEqual([]);
});

test("the section form validates with the shared schema, then queues the write", async () => {
  const spot = surveySpotFixture({ seat_count: null, missing: ["seat_count"] });
  const app = testApp({ spots: [spot], me: ME });
  const view = buildSpotView(spot, [], spot.id, null);
  if (view === null) throw new Error("no view");
  const form = renderHook(() => useSectionForm("seating", view), { wrapper: wrap(app) });
  let outcome = await act(() => form.result.current.save());
  expect(outcome).toEqual({ kind: "invalid" });
  expect(form.result.current.form.errors.seat_count).toBeDefined();
  act(() => form.result.current.set("seat_count", 25));
  outcome = await act(() => form.result.current.save());
  expect(outcome.kind).toBe("saved");
  await waitFor(() => expect(app.server.inner.spot(spot.id).seat_count).toBe(25));
  expect(form.result.current.verify).not.toBeNull();
});

test("before the queue is read from disk the view is loading, not missing", async () => {
  const app = testApp();
  await app.deps.started;
  app.network.set(false);
  app.server.offline = true;
  const local = await app.deps.outbox.createSpot(identity({ official_name: "Stairwell Desk" }));
  // The same queue as a cold start sees it: not loaded yet, then loaded.
  const real = app.deps.outbox;
  const listeners = new Set<() => void>();
  let loaded = false;
  let cached: { from: unknown; value: ReturnType<typeof real.getSnapshot> } | null = null;
  const unloaded = () => {
    const from = real.getSnapshot();
    if (cached === null || cached.from !== from)
      cached = { from, value: { ...from, loaded: false } };
    return cached.value;
  };
  const cold = {
    ...real,
    subscribe(l: () => void) {
      listeners.add(l);
      const off = real.subscribe(l);
      return () => {
        listeners.delete(l);
        off();
      };
    },
    getSnapshot: () => (loaded ? real.getSnapshot() : unloaded()),
  };
  const deps = { ...app.deps, outbox: cold };
  const view = renderHook(() => useSpotView(local), {
    wrapper: (props: { children: ReactNode }) => (
      <AppProvider deps={deps}>{props.children}</AppProvider>
    ),
  });
  await waitFor(() => expect(view.result.current.kind).toBe("loading"));
  expect(view.result.current.kind).toBe("loading");
  loaded = true;
  act(() => {
    for (const l of listeners) l();
  });
  await waitFor(() => expect(view.result.current.kind).toBe("ready"));
});

afterEach(() => {
  vi.useRealTimers();
});

test("the calm sync label waits before Syncing and holds it before All synced", async () => {
  const app = testApp({ spots: [surveySpotFixture({ id: SPOT_A, version: 3 })] });
  await app.deps.started;
  app.network.set(false);
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: SPOT_A, payload: POWER }, 3);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const view = renderHook(() => ({ calm: useCalmSyncHeader(), raw: useSyncHeader() }), {
    wrapper: wrap(app),
  });
  expect(view.result.current.calm).toEqual({ kind: "offline" });

  const gate = app.server.inner.holdNext();
  await act(async () => {
    app.network.set(true);
    await gate.arrived;
  });
  expect(view.result.current.raw).toEqual({ kind: "syncing", count: 1 });
  expect(view.result.current.calm).toEqual({ kind: "pending", count: 1 });
  // Past the 400 ms delay, waiting still holds out its one second before the swap.
  act(() => vi.advanceTimersByTime(999));
  expect(view.result.current.calm.kind).toBe("pending");
  act(() => vi.advanceTimersByTime(1));
  expect(view.result.current.calm).toEqual({ kind: "syncing", count: 1 });

  await act(async () => {
    gate.release();
    await app.deps.outbox.idle();
  });
  expect(view.result.current.raw).toEqual({ kind: "all_synced" });
  expect(view.result.current.calm.kind).toBe("syncing");
  act(() => vi.advanceTimersByTime(799));
  expect(view.result.current.calm.kind).toBe("syncing");
  act(() => vi.advanceTimersByTime(1));
  expect(view.result.current.calm).toEqual({ kind: "all_synced" });
});
