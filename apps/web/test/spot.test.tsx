import type { SurveySpot } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { identity, SEATING } from "../../../packages/ui-logic/test/builders.ts";
import { ME, renderRoute, testApp } from "./harness.tsx";

const DRAFT = surveySpotFixture({
  status: "draft",
  directions: null,
  seat_count: null,
  missing: ["directions", "seat_count"],
});
const at = (spot: SurveySpot) => `/survey/spots/${spot.id}`;

test("a new spot is created on the phone and opens its overview, then moves to its real id", async () => {
  const app = testApp();
  app.network.set(false);
  const view = renderRoute(app, "/survey/spots/new");
  fireEvent.change(await screen.findByRole("searchbox", { name: t("new.building.label") }), {
    target: { value: "melv" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Melville Library" }));
  fireEvent.change(screen.getByRole("textbox", { name: t("new.floor.label") }), {
    target: { value: "3" },
  });
  expect(screen.getByRole("button", { name: t("new.save") })).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByRole("textbox", { name: t("new.official_name.label") }), {
    target: { value: "Quiet Corner" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("new.save") }));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toMatch(/^\/survey\/spots\/local(:|%3A)/),
  );
  expect(await screen.findByRole("heading", { name: "Quiet Corner", level: 1 })).toBeTruthy();
  expect(screen.getByText(t("spot.publish.blocked.title"))).toBeTruthy();

  app.network.set(true);
  await app.deps.outbox.idle();
  await waitFor(() => expect(view.router.state.location.pathname).not.toMatch(/local(:|%3A)/));
  const created = [...app.server.inner.spots.values()][0];
  expect(created?.slug).toBe("quiet-corner-melville-library");
  expect(created?.lat).toBe(40.9154);
});

test("an incomplete draft lists what is missing as links and cannot publish", async () => {
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, at(DRAFT));
  const missing = await screen.findByRole("link", {
    name: t("spot.publish.blocked.item", { field: t("field.seat_count") }),
  });
  expect(missing.getAttribute("href")).toBe(`${at(DRAFT)}/seating`);
  expect(screen.getByRole("button", { name: t("spot.publish") })).toHaveProperty("disabled", true);
  const required = screen.getByRole("region", { name: t("spot.group.required") });
  expect(within(required).getAllByText(t("spot.section.missing")).length).toBeGreaterThan(0);
});

test("a complete draft publishes through the queue and says so", async () => {
  const ready = surveySpotFixture({ status: "draft" });
  const app = testApp({ spots: [ready] });
  renderRoute(app, at(ready));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.publish") }));
  expect(await screen.findByRole("button", { name: t("spot.publish.done") })).toBeTruthy();
  expect(app.server.inner.spot(ready.id).status).toBe("published");
});

test("the last editor sees why someone else reviews; a teammate gets Looks right", async () => {
  const published = surveySpotFixture({ status: "published", last_edited_by: ME.id });
  renderRoute(testApp({ spots: [published] }), at(published));
  expect(await screen.findByText(t("spot.review.own"))).toBeTruthy();
  expect(screen.queryByRole("button", { name: t("spot.review") })).toBeNull();

  const other = surveySpotFixture({
    status: "published",
    last_edited_by: "2c1e5b7a-0c2d-4f5e-9a1b-3c4d5e6f7a8b",
  });
  const app = testApp({ spots: [other] });
  renderRoute(app, at(other));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.review") }));
  expect(await screen.findByText(t("spot.review.done"))).toBeTruthy();
  expect(app.server.inner.spot(other.id).review_state).toBe("reviewed");
});

test("saving a section queues it, toasts, and returns to the overview", async () => {
  const app = testApp({ spots: [DRAFT] });
  const view = renderRoute(app, `${at(DRAFT)}/seating`);
  const seats = await screen.findByRole("textbox", { name: t("seating.seat_count.label") });
  fireEvent.change(seats, { target: { value: "40" } });
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(DRAFT)));
  expect(await screen.findByText(t("editor.saved"))).toBeTruthy();
  expect(app.server.inner.spot(DRAFT.id).seat_count).toBe(40);
});

test("an empty required field shows its message and nothing is queued", async () => {
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, `${at(DRAFT)}/seating`);
  fireEvent.click(await screen.findByRole("button", { name: t("editor.save") }));
  expect(await screen.findByText(t("editor.invalid"))).toBeTruthy();
  expect(screen.getByText(t("seating.seat_count.invalid"))).toBeTruthy();
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
});

test("leaving an edited section asks first", async () => {
  const app = testApp({ spots: [DRAFT] });
  const view = renderRoute(app, `${at(DRAFT)}/seating`);
  fireEvent.change(await screen.findByRole("textbox", { name: t("seating.seat_count.label") }), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByRole("link", { name: t("common.back") }));
  fireEvent.click(await screen.findByRole("button", { name: t("editor.discard_changes.keep") }));
  expect(view.router.state.location.pathname).toBe(`${at(DRAFT)}/seating`);
  fireEvent.click(screen.getByRole("link", { name: t("common.back") }));
  fireEvent.click(await screen.findByRole("button", { name: t("editor.discard_changes.action") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(DRAFT)));
});

test("clearing directions on a published spot warns before saving", async () => {
  const published = surveySpotFixture({ status: "published" });
  const app = testApp({ spots: [published] });
  renderRoute(app, `${at(published)}/identity`);
  fireEvent.change(await screen.findByRole("textbox", { name: t("new.directions.label") }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  const warning = await screen.findByRole("dialog", { name: t("editor.unpublish.title") });
  fireEvent.click(within(warning).getByRole("button", { name: t("editor.unpublish.action") }));
  await waitFor(() => expect(app.server.inner.spot(published.id).directions).toBeNull());
});

test("hours with nothing for this term cannot be marked checked", async () => {
  const noHours = surveySpotFixture({ hours: [] });
  renderRoute(testApp({ spots: [noHours] }), `${at(noHours)}/hours`);
  expect(
    await screen.findByText(t("editor.verify.hours_missing", { term: "Fall 2026" })),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: t("editor.verify") })).toBeNull();
});

test("a conflict resolves both ways from the overview", async () => {
  const spot = surveySpotFixture({ version: 3 });
  const app = testApp({ spots: [spot] });
  await app.deps.started;
  app.server.inner.bump(spot.id, { seat_count: 99, last_edited_by_name: "Jordan" });
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  await app.deps.outbox.idle();
  renderRoute(app, at(spot));
  fireEvent.click(await screen.findByRole("button", { name: t("common.open") }));
  const sheet = await screen.findByRole("dialog", {
    name: t("conflict.title", { section: t("section.seating.name") }),
  });
  expect(within(sheet).getByText(t("conflict.body", { name: "Jordan" }))).toBeTruthy();
  expect(
    within(sheet).getByRole("rowheader", { name: t("seating.seat_count.label") }),
  ).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("button", { name: t("conflict.keep_mine") }));
  expect(await screen.findByText(t("conflict.resolved"))).toBeTruthy();
  await waitFor(() => expect(app.server.inner.spot(spot.id).version).toBe(5));

  app.server.inner.bump(spot.id, { seat_count: 7 });
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 5);
  await app.deps.outbox.idle();
  fireEvent.click(await screen.findByRole("button", { name: t("common.open") }));
  fireEvent.click(await screen.findByRole("button", { name: t("conflict.keep_theirs") }));
  expect(await screen.findByText(t("conflict.dropped"))).toBeTruthy();
  expect(app.server.inner.spot(spot.id).seat_count).toBe(7);
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
});

test("a failed write says why in deck words; an unreadable answer offers only Discard", async () => {
  const spot = surveySpotFixture({ version: 3 });
  const app = testApp({ spots: [spot] });
  await app.deps.started;
  app.server.inner.failWith.push(200);
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  await app.deps.outbox.idle();
  renderRoute(app, at(spot));
  expect(await screen.findByText(t("spot.failed.banner"))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("common.open") }));
  const sheet = await screen.findByRole("dialog", { name: t("failed.title") });
  expect(within(sheet).getByText(t("failed.reason.bad_response"))).toBeTruthy();
  expect(within(sheet).queryByRole("button", { name: t("failed.retry") })).toBeNull();
  fireEvent.click(within(sheet).getByRole("button", { name: t("failed.discard") }));
  const confirm = await screen.findByRole("dialog", { name: t("failed.discard") });
  fireEvent.click(within(confirm).getByRole("button", { name: t("failed.discard") }));
  await waitFor(() => expect(app.deps.outbox.getSnapshot().records).toEqual([]));
});

test("estimates cycle on tap and save only the cells set", async () => {
  const empty = surveySpotFixture({ estimates: [] });
  const app = testApp({ spots: [empty] });
  renderRoute(app, `${at(empty)}/estimates`);
  const cell = await screen.findByRole("button", {
    name: t("estimates.cell", {
      day: t("estimates.weekday"),
      block: t("estimates.evening"),
      bucket: t("estimates.bucket.unset"),
    }),
  });
  fireEvent.click(cell);
  fireEvent.click(cell);
  expect(cell.textContent).toBe(t("estimates.bucket.some"));
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  await waitFor(() =>
    expect(app.server.inner.requests.some((r) => r.path.endsWith("/estimates"))).toBe(true),
  );
  const sent = app.server.inner.requests.find((r) => r.path.endsWith("/estimates"));
  expect(sent?.body.data).toEqual({
    cells: [{ day_type: "weekday", block: "evening", bucket: "some" }],
  });
});

test("an admin unpublishes a published spot after confirming, online only", async () => {
  const published = surveySpotFixture({ status: "published" });
  const app = testApp({ spots: [published], me: { ...ME, role: "admin" } });
  renderRoute(app, at(published));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.unpublish") }));
  const confirm = await screen.findByRole("dialog", {
    name: t("spot.unpublish.confirm.title", { name: published.official_name }),
  });
  fireEvent.click(
    within(confirm).getByRole("button", { name: t("spot.unpublish.confirm.action") }),
  );
  await waitFor(() => expect(app.server.inner.spot(published.id).status).toBe("draft"));
  expect(await screen.findByText(t("spot.status.draft"))).toBeTruthy();
});

test("a stored 24:00 close shows as midnight in the time input and saves unchanged", async () => {
  const late = surveySpotFixture({
    hours: [{ day_of_week: 1, opens: "08:00", closes: "24:00", last_entry: null, is_exam: false }],
  });
  const app = testApp({ spots: [late] });
  renderRoute(app, `${at(late)}/hours`);
  const closes = await screen.findAllByLabelText(t("hours.closes"));
  expect(closes[0]).toHaveProperty("value", "00:00");
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  await waitFor(() =>
    expect(app.server.inner.requests.some((r) => r.path.endsWith("/hours"))).toBe(true),
  );
  const sent = app.server.inner.requests.find((r) => r.path.endsWith("/hours"));
  expect(JSON.stringify(sent?.body.data)).toContain('"closes":"24:00"');
});

test("a create whose storage write timed out but landed opens the draft, not a duplicate", async () => {
  const app = testApp();
  app.network.set(false);
  const real = app.deps.outbox.createSpot;
  app.deps.outbox.createSpot = async (identity, key) => {
    await real(identity, key);
    throw new Error("indexeddb timeout");
  };
  const view = renderRoute(app, "/survey/spots/new");
  fireEvent.change(await screen.findByRole("searchbox", { name: t("new.building.label") }), {
    target: { value: "melv" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Melville Library" }));
  fireEvent.change(screen.getByRole("textbox", { name: t("new.floor.label") }), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: t("new.official_name.label") }), {
    target: { value: "Quiet Corner" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("new.save") }));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toMatch(/^\/survey\/spots\/local(:|%3A)/),
  );
  expect(app.deps.outbox.getSnapshot().records.length).toBe(1);
});

test("a create that failed before anything was stored offers a retry message", async () => {
  const app = testApp();
  app.network.set(false);
  app.deps.outbox.createSpot = async () => {
    throw new Error("indexeddb timeout");
  };
  renderRoute(app, "/survey/spots/new");
  fireEvent.change(await screen.findByRole("searchbox", { name: t("new.building.label") }), {
    target: { value: "melv" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Melville Library" }));
  fireEvent.change(screen.getByRole("textbox", { name: t("new.floor.label") }), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: t("new.official_name.label") }), {
    target: { value: "Quiet Corner" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("new.save") }));
  expect((await screen.findByRole("alert")).textContent).toBe(t("common.save_failed"));
  expect(screen.getByRole("button", { name: t("new.save") })).toHaveProperty("disabled", false);
});

test("an edit in progress survives its draft's create syncing and the move to the real id", async () => {
  const app = testApp();
  app.network.set(false);
  await app.deps.started;
  const local = await app.deps.outbox.createSpot(identity());
  const view = renderRoute(app, `/survey/spots/${local}/seating`);
  const seats = await screen.findByRole("textbox", { name: t("seating.seat_count.label") });
  fireEvent.change(seats, { target: { value: "41" } });
  app.network.set(true);
  await app.deps.outbox.idle();
  await waitFor(() => expect(view.router.state.location.pathname).not.toMatch(/local(:|%3A)/));
  expect(view.router.state.location.pathname).toMatch(/\/seating$/);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("textbox", { name: t("seating.seat_count.label") })).toHaveProperty(
    "value",
    "41",
  );
});

async function fillNewSpot() {
  fireEvent.change(await screen.findByRole("searchbox", { name: t("new.building.label") }), {
    target: { value: "melv" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Melville Library" }));
  fireEvent.change(screen.getByRole("textbox", { name: t("new.floor.label") }), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: t("new.official_name.label") }), {
    target: { value: "Quiet Corner" },
  });
}

test("retrying a create after a thrown save queues one draft, even if the reload fails too", async () => {
  const app = testApp();
  app.network.set(false);
  const real = app.deps.outbox.createSpot;
  let calls = 0;
  app.deps.outbox.createSpot = async (identity, key) => {
    calls += 1;
    if (calls === 1) throw new Error("indexeddb timeout");
    return real(identity, key);
  };
  app.deps.outbox.reload = async () => {
    throw new Error("indexeddb timeout");
  };
  const view = renderRoute(app, "/survey/spots/new");
  await fillNewSpot();
  fireEvent.click(screen.getByRole("button", { name: t("new.save") }));
  expect((await screen.findByRole("alert")).textContent).toBe(t("common.save_failed"));
  fireEvent.click(screen.getByRole("button", { name: t("new.save") }));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toMatch(/^\/survey\/spots\/local(:|%3A)/),
  );
  expect(app.deps.outbox.getSnapshot().records.length).toBe(1);
});

test("a create that was already sent before the save threw does not say it failed", async () => {
  const app = testApp();
  const real = app.deps.outbox.createSpot;
  app.deps.outbox.createSpot = async (identity, key) => {
    await real(identity, key);
    await app.deps.outbox.idle();
    throw new Error("indexeddb timeout");
  };
  const view = renderRoute(app, "/survey/spots/new");
  await fillNewSpot();
  fireEvent.click(screen.getByRole("button", { name: t("new.save") }));
  await waitFor(() => expect(view.router.state.location.pathname).toMatch(/^\/survey\/spots\//));
  expect(screen.queryByText(t("common.save_failed"))).toBeNull();
  expect(app.server.inner.spots.size).toBe(1);
});
