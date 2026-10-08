import { t } from "@study-spot/ui-logic";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { SEATING } from "../../../packages/ui-logic/test/builders.ts";
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

const OTHER = { ...ME, id: "5c1f3a7e-1d2b-4c5e-8f60-7a9b0c1d2e3f", display_name: "Jordan" };
const NEW_TOKEN = "c".repeat(43);

/** Ana's phone with one unsent write, then a link accepted by `who`. Returns what was sent per token. */
async function switchSetup(who: typeof ME) {
  const spot = surveySpotFixture({ version: 3 });
  const app = testApp({ spots: [spot] });
  await app.deps.started;
  // Stopped: the write stays queued, so only a choice on the invite screen can change that.
  app.deps.outbox.stop();
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  const auth: (string | undefined)[] = [];
  const original = app.server.send.bind(app.server);
  vi.spyOn(app.server, "send").mockImplementation(async (req) => {
    if (req.url.endsWith("/auth/accept")) {
      return { status: 200, text: JSON.stringify({ token: NEW_TOKEN, surveyor: who }) };
    }
    auth.push(req.headers.authorization);
    return original(req);
  });
  const view = renderRoute(app, `${LINK}?relogin=1`);
  fireEvent.click(await screen.findByRole("button", { name: t("invite.relogin.action") }));
  return { app, view, auth };
}

test("a different surveyor joining a phone with unsynced changes must confirm first", async () => {
  const { app, auth } = await switchSetup(OTHER);
  const dialog = await screen.findByRole("dialog", {
    name: t("invite.switch.title", { name: "Ana" }),
  });
  expect(
    within(dialog).getByText(t("invite.switch.body", { name: "Ana", new: "Jordan" })),
  ).toBeTruthy();
  // Nothing is saved or sent under the new token before the choice.
  expect(app.deps.session.token()).toBe(TOKEN);
  expect(auth).toEqual([]);
});

test("Cancel keeps the changes and the old session", async () => {
  const { app, view, auth } = await switchSetup(OTHER);
  const dialog = await screen.findByRole("dialog", {
    name: t("invite.switch.title", { name: "Ana" }),
  });
  fireEvent.click(within(dialog).getByRole("button", { name: t("common.cancel") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(app.deps.session.current()?.surveyor.display_name).toBe("Ana");
  expect(app.deps.session.token()).toBe(TOKEN);
  expect(app.deps.outbox.getSnapshot().records).toHaveLength(1);
  expect(auth.every((a) => a !== `Bearer ${NEW_TOKEN}`)).toBe(true);
});

test("Discard clears the changes and the new session works", async () => {
  const { app, auth } = await switchSetup(OTHER);
  const dialog = await screen.findByRole("dialog", {
    name: t("invite.switch.title", { name: "Ana" }),
  });
  fireEvent.click(within(dialog).getByRole("button", { name: t("invite.switch.discard") }));
  await waitFor(() => expect(app.deps.session.token()).toBe(NEW_TOKEN));
  expect(app.deps.session.current()?.surveyor.display_name).toBe("Jordan");
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
  // The old surveyor's write never went out; the outbox runs again for the new one.
  expect(app.server.inner.requests.some((r) => r.path.endsWith("/seating"))).toBe(false);
  const spot = [...app.server.inner.spots.values()][0];
  if (spot === undefined) throw new Error("no spot");
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  await app.deps.outbox.idle();
  await waitFor(() => expect(app.deps.outbox.getSnapshot().records).toEqual([]));
  expect(auth.at(-1)).toBe(`Bearer ${NEW_TOKEN}`);
});

test("the same surveyor signing in again is not asked", async () => {
  const { app, view } = await switchSetup(ME);
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(app.deps.session.token()).toBe(NEW_TOKEN);
});

test("a different surveyor joining a phone with an empty queue is not asked", async () => {
  const app = testApp();
  await app.deps.started;
  vi.spyOn(app.server, "send").mockImplementation(async (req) =>
    req.url.endsWith("/auth/accept")
      ? { status: 200, text: JSON.stringify({ token: NEW_TOKEN, surveyor: OTHER }) }
      : { status: 200, text: JSON.stringify({ term: null, spots: [] }) },
  );
  const view = renderRoute(app, `${LINK}?relogin=1`);
  fireEvent.click(await screen.findByRole("button", { name: t("invite.relogin.action") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(app.deps.session.current()?.surveyor.display_name).toBe("Jordan");
});

test("Discard stops the outbox and waits for an in-flight send before dropping the queue", async () => {
  const { app } = await switchSetup(OTHER);
  const dialog = await screen.findByRole("dialog", {
    name: t("invite.switch.title", { name: "Ana" }),
  });
  const order: string[] = [];
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const { outbox } = app.deps;
  vi.spyOn(outbox, "stop").mockImplementation(() => void order.push("stop"));
  vi.spyOn(outbox, "idle").mockImplementation(async () => {
    order.push("idle");
    await gate;
  });
  const real = outbox.discardAll.bind(outbox);
  vi.spyOn(outbox, "discardAll").mockImplementation(async () => {
    order.push("discardAll");
    await real();
  });
  fireEvent.click(within(dialog).getByRole("button", { name: t("invite.switch.discard") }));
  await waitFor(() => expect(order).toEqual(["stop", "idle"]));
  expect(outbox.getSnapshot().records).toHaveLength(1);
  release();
  await waitFor(() => expect(order).toEqual(["stop", "idle", "discardAll"]));
  await waitFor(() => expect(app.deps.session.token()).toBe(NEW_TOKEN));
});

async function signedOutWithQueue(who: typeof ME) {
  const spot = surveySpotFixture({ version: 3 });
  const app = testApp({ spots: [spot] });
  await app.deps.started;
  app.deps.outbox.stop();
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  await app.deps.signOut();
  const original = app.server.send.bind(app.server);
  vi.spyOn(app.server, "send").mockImplementation(async (req) =>
    req.url.endsWith("/auth/accept")
      ? { status: 200, text: JSON.stringify({ token: NEW_TOKEN, surveyor: who }) }
      : original(req),
  );
  const view = renderRoute(app, `${LINK}?relogin=1`);
  return { app, view };
}

test("after a sign-out with a queue, a different surveyor is asked, naming the old owner", async () => {
  const { app } = await signedOutWithQueue(OTHER);
  expect(app.deps.session.current()).toBeNull();
  expect(await app.cache.get("outbox:owner")).not.toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: t("invite.relogin.action") }));
  const dialog = await screen.findByRole("dialog", {
    name: t("invite.switch.title", { name: "Ana" }),
  });
  fireEvent.click(within(dialog).getByRole("button", { name: t("invite.switch.discard") }));
  await waitFor(() => expect(app.deps.session.token()).toBe(NEW_TOKEN));
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
  expect(await app.cache.get("outbox:owner")).toBeNull();
});

test("after a sign-out with a queue, the same surveyor joins with no prompt and the key goes", async () => {
  const { app, view } = await signedOutWithQueue(ME);
  fireEvent.click(await screen.findByRole("button", { name: t("invite.relogin.action") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(await app.cache.get("outbox:owner")).toBeNull();
});

test("signOut with an empty queue leaves no owner key", async () => {
  const app = testApp();
  await app.deps.started;
  await app.deps.signOut();
  expect(await app.cache.get("outbox:owner")).toBeNull();
});
