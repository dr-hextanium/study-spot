import { t } from "@perch/ui-logic";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { identity } from "../../../packages/ui-logic/test/builders.ts";
import { renderRoute, testApp } from "./harness.tsx";

/** Records each view transition the router starts; jsdom has none of its own. */
function recordTransitions(): unknown[] {
  const starts: unknown[] = [];
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (arg: ViewTransitionUpdateCallback | StartViewTransitionOptions) => {
      starts.push(arg);
      const update = typeof arg === "function" ? arg : arg.update;
      const done = Promise.resolve(update?.());
      return { updateCallbackDone: done, ready: done, finished: done, skipTransition() {} };
    },
  });
  return starts;
}

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
});

test("a path change starts a view transition", async () => {
  const starts = recordTransitions();
  const app = testApp();
  const view = renderRoute(app, "/survey");
  await screen.findByRole("heading", { level: 1, name: t("home.title") });
  const before = starts.length;
  await view.router.navigate({ to: "/survey/spots/new" });
  await waitFor(() => expect(starts.length).toBeGreaterThan(before));
});

test("a draft's move to its real id swaps the overview without a transition", async () => {
  const starts = recordTransitions();
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity());
  const view = renderRoute(app, `/survey/spots/${local}`);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(view.router.state.status).toBe("idle"));
  const before = starts.length;
  app.network.set(true);
  await app.deps.outbox.idle();
  await waitFor(() => expect(view.router.state.location.pathname).not.toMatch(/local(:|%3A)/));
  expect(starts.length).toBe(before);
});

test("a draft's move to its real id keeps an open editor without a transition", async () => {
  const starts = recordTransitions();
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity());
  const view = renderRoute(app, `/survey/spots/${local}/seating`);
  const seats = await screen.findByRole("textbox", { name: t("seating.seat_count.label") });
  fireEvent.change(seats, { target: { value: "41" } });
  await waitFor(() => expect(view.router.state.status).toBe("idle"));
  const before = starts.length;
  app.network.set(true);
  await app.deps.outbox.idle();
  await waitFor(() => expect(view.router.state.location.pathname).not.toMatch(/local(:|%3A)/));
  expect(starts.length).toBe(before);
});
