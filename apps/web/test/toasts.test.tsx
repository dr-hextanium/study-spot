import { t } from "@perch/ui-logic";
import { act, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { POWER } from "../../../packages/ui-logic/test/builders.ts";
import { useToasts } from "../src/hooks/useToasts.tsx";
import { renderApp, testApp } from "./harness.tsx";

const SPOT = surveySpotFixture({ version: 3 });
let api: ReturnType<typeof useToasts> | null = null;
function Grab() {
  api = useToasts();
  return null;
}

test("a write that leaves the queue toasts Saved; offline says it is on the phone", async () => {
  const app = testApp({ spots: [SPOT] });
  renderApp(app, <Grab />);
  await app.deps.started;
  const id = await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: SPOT.id, payload: POWER },
    3,
  );
  act(() => api?.track(id, { done: "editor.saved", waiting: "editor.saved_offline" }));
  await act(() => app.deps.outbox.idle());
  expect(await screen.findByText(t("editor.saved"))).toBeTruthy();

  app.network.set(false);
  const queued = await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: SPOT.id, payload: POWER },
    4,
  );
  act(() => api?.track(queued, { done: "editor.saved", waiting: "editor.saved_offline" }));
  expect(await screen.findByText(t("editor.saved_offline"))).toBeTruthy();
});

test("a write that fails gets no success toast", async () => {
  const app = testApp({ spots: [SPOT] });
  app.server.inner.failWith.push(422);
  renderApp(app, <Grab />);
  await app.deps.started;
  const id = await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: SPOT.id, payload: POWER },
    3,
  );
  act(() => api?.track(id, { done: "editor.saved", waiting: "editor.saved_offline" }));
  await act(() => app.deps.outbox.idle());
  await act(() => new Promise((r) => setTimeout(r, 600)));
  expect(screen.queryByText(t("editor.saved"))).toBeNull();
  expect(app.deps.outbox.getSnapshot().records[0]?.state).toBe("failed");
});

test("a second edit folded into a conflict gets no Saved toast", async () => {
  const app = testApp({ spots: [SPOT] });
  renderApp(app, <Grab />);
  await app.deps.started;
  const copy = { done: "editor.saved", waiting: "editor.saved_offline" } as const;
  // Based on version 2 while the server is at 3: the first send is a 409.
  const first = await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: SPOT.id, payload: POWER },
    2,
  );
  const second = await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: SPOT.id, payload: POWER },
    2,
  );
  act(() => api?.track(first, copy));
  act(() => api?.track(second, copy));
  await act(() => app.deps.outbox.idle());
  await act(() => new Promise((r) => setTimeout(r, 600)));
  const records = app.deps.outbox.getSnapshot().records;
  expect(records.map((r) => r.state)).toEqual(["conflict"]);
  expect(screen.queryByText(t("editor.saved"))).toBeNull();
  expect(screen.queryByText(t("editor.saved_offline"))).toBeNull();
});
