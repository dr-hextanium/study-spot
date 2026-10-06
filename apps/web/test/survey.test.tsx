import { t } from "@study-spot/ui-logic";
import { act, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { identity } from "../../../packages/ui-logic/test/builders.ts";
import { renderRoute, testApp } from "./harness.tsx";

test("/ redirects to /survey, which resolves for a signed-in phone", async () => {
  const view = renderRoute(testApp(), "/");
  await act(async () => {
    await view.router.load();
  });
  expect(view.router.state.location.pathname).toBe("/survey");
  expect(screen.queryByText(t("auth.expired.title"))).toBeNull();
});

test("a phone with no session says Sign in again", async () => {
  renderRoute(testApp({ me: null }), "/survey");
  expect(await screen.findByText(t("auth.expired.title"))).toBeTruthy();
});

test("a 401 on a read signs the survey out and keeps the queue", async () => {
  const app = testApp();
  renderRoute(app, "/survey");
  await act(async () => {
    app.deps.auth.markSignedOut();
  });
  expect(await screen.findByText(t("auth.expired.title"))).toBeTruthy();
  expect(app.deps.session.current()).not.toBeNull();
});

test("an outbox 401 pause shows Sign in again and keeps the pending write", async () => {
  const app = testApp();
  app.server.unauthorized = true;
  renderRoute(app, "/survey");
  await act(async () => {
    await app.deps.outbox.createSpot(identity());
  });
  expect(await screen.findByText(t("auth.expired.title"))).toBeTruthy();
  expect(app.deps.outbox.getSnapshot().signedOut).toBe(true);
  expect(app.deps.outbox.getSnapshot().records.map((r) => r.state)).toEqual(["pending"]);
});

test("signing out in place moves focus to the Sign in again screen", async () => {
  const app = testApp();
  const view = renderRoute(app, "/survey");
  await act(async () => {
    await view.router.load();
  });
  await act(async () => {
    app.deps.auth.markSignedOut();
  });
  await screen.findByText(t("auth.expired.title"));
  expect(document.activeElement?.tagName).toBe("MAIN");
});
