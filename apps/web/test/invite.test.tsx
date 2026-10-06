import { t } from "@study-spot/ui-logic";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ME, renderRoute, TOKEN, testApp } from "./harness.tsx";

const LINK = `/invite/${"b".repeat(43)}`;

function answer(app: ReturnType<typeof testApp>, status: number, body: unknown) {
  const original = app.server.send.bind(app.server);
  vi.spyOn(app.server, "send").mockImplementation(async (req) =>
    req.url.endsWith("/auth/accept") ? { status, text: JSON.stringify(body) } : original(req),
  );
}

test("a new surveyor adds a name, joins, and lands on the spot list", async () => {
  const app = testApp({ me: null });
  answer(app, 200, { token: TOKEN, surveyor: ME });
  const view = renderRoute(app, LINK);
  expect(await screen.findByRole("heading", { name: t("invite.title") })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("invite.join") }));
  expect(await screen.findByText(t("invite.name.required"))).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: t("invite.name.label") }), {
    target: { value: "Ana" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("invite.join") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(app.deps.session.current()?.surveyor.display_name).toBe("Ana");
  // The invite token must not stay in history: Back from /survey cannot reach it.
  expect(view.router.history.location.pathname).toBe("/survey");
  view.router.history.back();
  await waitFor(() => expect(view.router.history.location.pathname).not.toBe(LINK));
});

test("moving to a new screen focuses its main area, but the first load does not", async () => {
  const view = renderRoute(testApp({ me: null }), "/survey");
  await screen.findByText(t("auth.expired.title"));
  expect(document.activeElement).toBe(document.body);
  await act(async () => {
    await view.router.navigate({ to: "/invite/$token", params: { token: "b".repeat(43) } });
  });
  await screen.findByRole("heading", { name: t("invite.title") });
  await waitFor(() => expect(document.activeElement?.tagName).toBe("MAIN"));
});

test("Join is disabled while offline", async () => {
  const app = testApp({ me: null });
  app.network.set(false);
  renderRoute(app, LINK);
  const join = await screen.findByRole("button", { name: t("invite.join") });
  expect((join as HTMLButtonElement).disabled).toBe(true);
});

test("a re-login link asks for no name and says Sign in", async () => {
  const app = testApp({ me: null });
  answer(app, 200, { token: TOKEN, surveyor: ME });
  renderRoute(app, `${LINK}?relogin=1`);
  expect(await screen.findByRole("heading", { name: t("invite.relogin.title") })).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("invite.relogin.action") }));
  await waitFor(() => expect(app.deps.session.current()?.token).toBe(TOKEN));
});

test("a used link says so and offers no button; offline disables Join", async () => {
  const app = testApp({ me: null });
  answer(app, 410, { error: "invite_used" });
  renderRoute(app, LINK);
  fireEvent.change(await screen.findByRole("textbox", { name: t("invite.name.label") }), {
    target: { value: "Ana" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("invite.join") }));
  expect(await screen.findByText(t("invite.used"))).toBeTruthy();
  expect(screen.queryByRole("button", { name: t("invite.join") })).toBeNull();

  const offline = testApp({ me: null });
  offline.network.set(false);
  renderRoute(offline, LINK);
  expect(await screen.findByText(t("invite.offline"))).toBeTruthy();
});

test("a malformed token never calls the server", async () => {
  const app = testApp({ me: null });
  const send = vi.spyOn(app.server, "send");
  renderRoute(app, "/invite/short");
  expect(await screen.findByText(t("invite.invalid"))).toBeTruthy();
  expect(send.mock.calls.filter(([r]) => r.url.endsWith("/auth/accept"))).toHaveLength(0);
});

test("on an iPhone browser tab the note says to open the link in the installed app", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
  );
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  renderRoute(testApp({ me: null }), LINK);
  expect(await screen.findByText(t("invite.ios.body"))).toBeTruthy();
});
