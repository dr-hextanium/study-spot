import { buildSpotView } from "@study-spot/ui-logic";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { identity } from "../../../packages/ui-logic/test/builders.ts";
import { AppProvider } from "../src/app/AppProvider.tsx";
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
