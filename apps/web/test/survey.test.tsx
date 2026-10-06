import { t } from "@study-spot/ui-logic";
import { act, screen } from "@testing-library/react";
import { expect, test } from "vitest";
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
