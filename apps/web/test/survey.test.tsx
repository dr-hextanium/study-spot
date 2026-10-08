import { createSessionStore, SESSION_KEY, t } from "@study-spot/ui-logic";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { identity } from "../../../packages/ui-logic/test/builders.ts";
import { ME, renderRoute, testApp } from "./harness.tsx";

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

const NEW_TOKEN = "c".repeat(43);

test("signing in again after an outbox 401 sends the waiting write", async () => {
  const app = testApp();
  app.server.unauthorized = true;
  const view = renderRoute(app, "/survey");
  await act(async () => {
    await app.deps.outbox.createSpot(identity());
  });
  await screen.findByText(t("auth.expired.title"));
  expect(app.server.inner.spots.size).toBe(0);
  // The server accepts the fresh session; the re-login invite hands it out.
  app.server.unauthorized = false;
  const original = app.server.send.bind(app.server);
  vi.spyOn(app.server, "send").mockImplementation(async (req) =>
    req.url.endsWith("/auth/accept")
      ? { status: 200, text: JSON.stringify({ token: NEW_TOKEN, surveyor: ME }) }
      : original(req),
  );
  await act(async () => {
    await view.router.navigate({
      to: "/invite/$token",
      params: { token: "b".repeat(43) },
      search: { relogin: 1 },
    });
  });
  fireEvent.click(await screen.findByRole("button", { name: t("invite.relogin.action") }));
  await waitFor(() => expect(app.server.inner.spots.size).toBe(1));
  await waitFor(() => expect(app.deps.outbox.getSnapshot().records).toHaveLength(0));
  expect(app.deps.outbox.getSnapshot().signedOut).toBe(false);
  expect(screen.queryByText(t("sync.short.signed_out"))).toBeNull();
});

test("a read-only 401 shows Sign in again while the outbox stays fine", async () => {
  const app = testApp();
  app.server.unauthorized = true;
  renderRoute(app, "/survey");
  expect(await screen.findByText(t("auth.expired.title"))).toBeTruthy();
  expect(app.deps.auth.signedOut()).toBe(true);
  expect(app.deps.outbox.getSnapshot().signedOut).toBe(false);
});

test("a session saved in another tab resumes this tab's sync", async () => {
  const app = testApp();
  app.server.unauthorized = true;
  renderRoute(app, "/survey");
  await act(async () => {
    await app.deps.outbox.createSpot(identity());
  });
  await screen.findByText(t("auth.expired.title"));
  app.deps.auth.markSignedOut();
  app.server.unauthorized = false;
  // Another tab joined again: it writes the session store, this tab hears a storage event.
  createSessionStore(app.storage).save({ token: NEW_TOKEN, surveyor: ME });
  await act(async () => {
    window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY }));
  });
  await waitFor(() => expect(app.server.inner.spots.size).toBe(1));
  expect(app.deps.auth.signedOut()).toBe(false);
  expect(app.deps.outbox.getSnapshot().signedOut).toBe(false);
  expect(app.deps.session.token()).toBe(NEW_TOKEN);
});

test("saving the same token again does not resume a signed-out outbox", async () => {
  const app = testApp();
  app.server.unauthorized = true;
  renderRoute(app, "/survey");
  await act(async () => {
    await app.deps.outbox.createSpot(identity());
  });
  await screen.findByText(t("auth.expired.title"));
  expect(app.deps.outbox.getSnapshot().signedOut).toBe(true);
  const me = app.deps.session.current();
  if (me === null) throw new Error("no session");
  act(() => {
    app.deps.session.save({ token: me.token, surveyor: me.surveyor });
  });
  expect(app.deps.outbox.getSnapshot().signedOut).toBe(true);
  expect(app.deps.auth.signedOut()).toBe(true);
  // A fresh token resumes.
  app.server.unauthorized = false;
  act(() => {
    app.deps.session.save({ token: NEW_TOKEN, surveyor: me.surveyor });
  });
  await waitFor(() => expect(app.deps.outbox.getSnapshot().signedOut).toBe(false));
});
