import type { SurveySpot } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { surveySpotFixture } from "../../../packages/core/test/fixtures/survey-spot.ts";
import { identity, SEATING } from "../../../packages/ui-logic/test/builders.ts";
import type { ImageKit } from "../src/lib/photo.ts";
import { BuildingPicker } from "../src/screens/BuildingPicker.tsx";
import { CHECKLIST_KEY } from "../src/screens/editors/PhotosEditor.tsx";
import { ME, renderRoute, testApp } from "./harness.tsx";

const DRAFT = surveySpotFixture({
  status: "draft",
  directions: null,
  seat_count: null,
  missing: ["directions", "seat_count"],
});
const TWO_GAPS = surveySpotFixture({
  status: "draft",
  seat_count: null,
  noise_policy: null,
  missing: ["seat_count", "noise_policy"],
});
const ONE_GAP = surveySpotFixture({
  status: "draft",
  seat_count: null,
  missing: ["seat_count"],
});
const FULL = surveySpotFixture({ status: "draft" });
const SAVE = /^Save( and next)?$/;
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

/** Opens the Actions sheet from the action bar and returns it. */
async function openActions() {
  fireEvent.click(await screen.findByRole("button", { name: t("common.actions") }));
  return screen.findByRole("dialog", { name: t("common.actions") });
}

test("a blocked draft: Publish stays focusable, says why, and lists every blocker", async () => {
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, at(DRAFT));
  const publish = await screen.findByRole("button", { name: t("spot.publish") });
  expect(publish.getAttribute("aria-disabled")).toBe("true");
  expect(publish).toHaveProperty("disabled", false);
  const reason = document.getElementById(publish.getAttribute("aria-describedby") ?? "");
  expect(reason?.textContent).toBe(t("spot.publish.blocked.reason", { count: 2 }));
  fireEvent.click(publish);
  const sheet = await screen.findByRole("dialog", { name: t("spot.publish.blocked.title") });
  const seats = within(sheet).getByRole("link", {
    name: t("spot.publish.blocked.item", { field: t("field.seat_count") }),
  });
  expect(seats.getAttribute("href")).toBe(`${at(DRAFT)}/seating`);
  // Directions are an identity field, so they link too; nothing queued by tapping Publish.
  expect(
    within(sheet).getByRole("link", {
      name: t("spot.publish.blocked.item", { field: t("field.directions") }),
    }),
  ).toBeTruthy();
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
});

test("a draft with no check at all names it as a blocker without a link", async () => {
  const unchecked = surveySpotFixture({
    status: "draft",
    verified: {},
    missing: ["last_verified"],
  });
  renderRoute(testApp({ spots: [unchecked] }), at(unchecked));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.publish") }));
  const sheet = await screen.findByRole("dialog", { name: t("spot.publish.blocked.title") });
  expect(
    within(sheet).getByText(t("spot.publish.blocked.item", { field: t("field.last_verified") })),
  ).toBeTruthy();
  expect(within(sheet).queryByRole("link")).toBeNull();
});

test("the next button opens the first missing section", async () => {
  const app = testApp({ spots: [DRAFT] });
  const view = renderRoute(app, at(DRAFT));
  // Directions (identity) come before seat count, so identity is the first section with a gap.
  fireEvent.click(
    await screen.findByRole("link", {
      name: t("spot.next", { section: t("section.identity.name") }),
    }),
  );
  await waitFor(() => expect(view.router.state.location.pathname).toBe(`${at(DRAFT)}/identity`));
});

test("rows show the fact, or a red Missing, and the step line says what is next", async () => {
  renderRoute(testApp({ spots: [DRAFT] }), at(DRAFT));
  const seating = await screen.findByRole("link", { name: /Seating/ });
  expect(within(seating).getByText(t("spot.section.missing"))).toBeTruthy();
  const required = screen.getByRole("region", { name: t("spot.group.required") });
  const identity = within(required).getAllByRole("link")[0];
  expect(identity?.getAttribute("href")).toBe(`${at(DRAFT)}/identity`);
  // Identity lacks directions, so it says Missing instead of showing a fact.
  expect(within(identity as HTMLElement).getByText(t("spot.section.missing"))).toBeTruthy();
  expect(
    screen.getByText(new RegExp(`Next: ${t("section.identity.name")}`), {
      selector: ".progress-line",
    }),
  ).toBeTruthy();
  const bar = screen.getByRole("img", { name: /^\d of 6 done$/ });
  // DRAFT lacks directions (Basics) and seat count (Seating); the other four are done.
  expect(bar.getAttribute("aria-label")).toBe("4 of 6 done");
  expect(document.querySelector(".progress-line")?.textContent?.startsWith("4 of 6")).toBe(true);
  expect(screen.getByRole("region", { name: t("spot.group.required") })).toBeTruthy();
  expect(screen.getByRole("region", { name: t("spot.group.extras") })).toBeTruthy();
});

test("a filled-in row shows its fact on the right", async () => {
  const full = surveySpotFixture({ status: "draft", seat_count: 64, floor: "3" });
  renderRoute(testApp({ spots: [full] }), at(full));
  const seating = await screen.findByRole("link", { name: /Seating/ });
  expect(within(seating).getByText("64 seats")).toBeTruthy();
  expect(within(screen.getByRole("link", { name: /Basics/ })).getByText("Floor 3")).toBeTruthy();
});

test("every spot shows when it was last checked, or that it never was", async () => {
  const checked = surveySpotFixture({
    status: "published",
    verified: { identity: "2026-09-01T15:00:00.000Z", seating: "2026-10-01T15:00:00.000Z" },
  });
  const never = surveySpotFixture({ status: "draft", verified: {}, missing: ["last_verified"] });
  const first = renderRoute(testApp({ spots: [checked] }), at(checked));
  expect(await screen.findByText(t("spot.section.verified", { date: "Sep 1" }))).toBeTruthy();
  first.unmount();
  renderRoute(testApp({ spots: [never] }), at(never));
  expect(await screen.findByText(t("home.stale.never"))).toBeTruthy();
});

test("Actions lists next missing, a photo, and the guided walk", async () => {
  const app = testApp({ spots: [DRAFT] });
  const view = renderRoute(app, at(DRAFT));
  const sheet = await openActions();
  expect(
    within(sheet).getByRole("link", {
      name: t("spot.actions.next_missing", { section: t("section.identity.name") }),
    }),
  ).toBeTruthy();
  expect(
    within(sheet)
      .getByRole("link", { name: t("spot.actions.add_photo") })
      .getAttribute("href"),
  ).toBe(`${at(DRAFT)}/photos`);
  expect(within(sheet).queryByRole("button", { name: t("spot.unpublish") })).toBeNull();
  fireEvent.click(within(sheet).getByRole("link", { name: new RegExp(t("spot.actions.walk")) }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(`${at(DRAFT)}/identity`));
  // The walk only navigates: nothing was marked checked or queued, and the editor accepts the param.
  expect(view.router.state.location.search).toEqual({ walk: 1 });
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
  expect(await screen.findByRole("button", { name: t("editor.save_next") })).toBeTruthy();
});

test("an unknown walk value is ignored, not an error", async () => {
  const view = renderRoute(testApp({ spots: [DRAFT] }), `${at(DRAFT)}/identity?walk=banana`);
  expect(await screen.findByRole("button", { name: SAVE })).toBeTruthy();
  expect(view.router.state.location.search).toEqual({});
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
  const app = testApp({ spots: [ONE_GAP] });
  const view = renderRoute(app, `${at(ONE_GAP)}/seating`);
  const seats = await screen.findByRole("textbox", { name: t("seating.seat_count.label") });
  fireEvent.change(seats, { target: { value: "40" } });
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(ONE_GAP)));
  expect(await screen.findByText(t("editor.saved"))).toBeTruthy();
  expect(app.server.inner.spot(ONE_GAP.id).seat_count).toBe(40);
});

test("an empty required field shows its message and nothing is queued", async () => {
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, `${at(DRAFT)}/seating`);
  fireEvent.click(await screen.findByRole("button", { name: SAVE }));
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
  fireEvent.click(await screen.findByRole("button", { name: t("spot.conflict.open") }));
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
  fireEvent.click(await screen.findByRole("button", { name: t("spot.conflict.open") }));
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
  fireEvent.click(screen.getByRole("button", { name: t("spot.failed.open") }));
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

test("hours: each day is its own group with a closed switch and the copy button", async () => {
  renderRoute(testApp({ spots: [FULL] }), `${at(FULL)}/hours`);
  const mon = await screen.findByRole("group", { name: t("hours.day.mon") });
  expect(within(mon).getByRole("checkbox", { name: t("hours.closed") })).toBeTruthy();
  expect(screen.getByRole("button", { name: t("hours.copy_weekdays") })).toBeTruthy();
});

test("busyness: time blocks are rows and days are columns, with no live wording", async () => {
  const empty = surveySpotFixture({ estimates: [] });
  renderRoute(testApp({ spots: [empty] }), `${at(empty)}/estimates`);
  const grid = await screen.findByTestId("busyness-grid");
  const rows = within(grid).getAllByRole("rowheader");
  expect(rows.map((r) => r.textContent)).toEqual([
    t("estimates.morning"),
    t("estimates.afternoon"),
    t("estimates.evening"),
    t("estimates.night"),
  ]);
  expect(within(grid).getAllByRole("columnheader")).toHaveLength(2);
  expect(screen.getByText(t("estimates.helper"))).toBeTruthy();
  expect(within(grid).getAllByRole("button")).toHaveLength(8);
});

test("an admin unpublishes a published spot after confirming, online only", async () => {
  const published = surveySpotFixture({ status: "published" });
  const app = testApp({ spots: [published], me: { ...ME, role: "admin" } });
  renderRoute(app, at(published));
  const sheet = await openActions();
  fireEvent.click(within(sheet).getByRole("button", { name: t("spot.unpublish") }));
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

test("closing a write sheet replaces its history entry, so Back does not reopen it", async () => {
  const spot = surveySpotFixture({ version: 3 });
  const app = testApp({ spots: [spot] });
  await app.deps.started;
  app.server.inner.failWith.push(200);
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  await app.deps.outbox.idle();
  const view = renderRoute(app, at(spot));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.failed.open") }));
  const sheet = await screen.findByRole("dialog", { name: t("failed.title") });
  fireEvent.click(within(sheet).getByRole("button", { name: t("common.close") }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  view.router.history.back();
  await waitFor(() => expect(view.router.state.location.search).toEqual({}));
  expect(screen.queryByRole("dialog")).toBeNull();
});

const PHOTO = {
  id: "7d0a1c52-3b6e-4e1f-9a2b-5c8d7e6f4a3b",
  spot_id: "",
  url: null,
  taken_at: "2026-10-05T15:00:00.000Z",
  is_cover: false,
  uploaded_by: "2c1e5b7a-0c2d-4f5e-9a1b-3c4d5e6f7a8b",
  approved: true,
  approved_at: "2026-10-05T16:00:00.000Z",
} as const;

function fakeKit(sizes: number[], decodes = true): ImageKit {
  return {
    decode: async () =>
      decodes ? { width: 4000, height: 3000, image: {} as CanvasImageSource } : null,
    encode: async () => new Blob([new Uint8Array(sizes.shift() ?? 1000)], { type: "image/jpeg" }),
  };
}

const pickFile = () =>
  fireEvent.change(screen.getByTestId("photo-library"), {
    target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
  });

test("the photo checklist shows once per session and gates both pickers", async () => {
  sessionStorage.removeItem(CHECKLIST_KEY);
  const click = vi.spyOn(HTMLInputElement.prototype, "click");
  const app = testApp({ spots: [DRAFT] });
  renderRoute(app, `${at(DRAFT)}/photos`);
  fireEvent.click(await screen.findByRole("button", { name: t("photos.choose") }));
  expect(await screen.findByRole("dialog", { name: t("photos.checklist.title") })).toBeTruthy();
  expect(click).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("photos.checklist.ok") }));
  expect(click).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: t("photos.take") }));
  expect(click).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("dialog")).toBeNull();
  click.mockRestore();
});

test("a picked photo is queued; an oversize or unreadable one shows its error", async () => {
  sessionStorage.setItem(CHECKLIST_KEY, "1");
  const app = testApp({ spots: [DRAFT] });
  app.network.set(false);
  app.deps.imageKit = fakeKit([1000]);
  renderRoute(app, `${at(DRAFT)}/photos`);
  await screen.findByRole("button", { name: t("photos.choose") });
  pickFile();
  await waitFor(() =>
    expect(app.deps.outbox.getSnapshot().records.some((r) => r.kind === "photo.upload")).toBe(true),
  );
  expect(await screen.findByText(t("photos.not_synced"))).toBeTruthy();

  app.deps.imageKit = fakeKit([2_000_000, 2_000_000]);
  pickFile();
  expect(await screen.findByText(t("photos.too_big"))).toBeTruthy();
  app.deps.imageKit = fakeKit([], false);
  pickFile();
  expect(await screen.findByText(t("photos.unreadable"))).toBeTruthy();
  expect(screen.queryByText(t("photos.too_big"))).toBeNull();
});

test("a synced photo is set as the cover", async () => {
  const spot = surveySpotFixture({ photos: [{ ...PHOTO, spot_id: DRAFT.id }] });
  const app = testApp({ spots: [spot] });
  renderRoute(app, `${at(spot)}/photos`);
  fireEvent.click(await screen.findByRole("button", { name: t("photos.cover") }));
  await waitFor(() =>
    expect(app.server.inner.spot(spot.id).photos.find((p) => p.id === PHOTO.id)?.is_cover).toBe(
      true,
    ),
  );
});

test("publishing offline queues it and says it goes live after syncing", async () => {
  const ready = surveySpotFixture({ status: "draft" });
  const app = testApp({ spots: [ready] });
  app.network.set(false);
  renderRoute(app, at(ready));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.publish") }));
  expect(await screen.findByText(t("spot.publish.queued"))).toBeTruthy();
  expect(app.server.inner.spot(ready.id).status).toBe("draft");
  expect(screen.queryByText(t("spot.publish.done"))).toBeNull();
});

test("saving does not trip the leave guard on the way back", async () => {
  const app = testApp({ spots: [ONE_GAP] });
  const view = renderRoute(app, `${at(ONE_GAP)}/seating`);
  fireEvent.change(await screen.findByRole("textbox", { name: t("seating.seat_count.label") }), {
    target: { value: "40" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(ONE_GAP)));
  expect(screen.queryByRole("dialog", { name: t("editor.discard_changes.title") })).toBeNull();
});

test("discarding a failed create leaves the spot that no longer exists", async () => {
  const app = testApp();
  await app.deps.started;
  app.server.inner.failWith.push(200);
  const local = await app.deps.outbox.createSpot(identity());
  await app.deps.outbox.idle();
  const view = renderRoute(app, `/survey/spots/${local}`);
  fireEvent.click(await screen.findByRole("button", { name: t("spot.failed.open") }));
  const sheet = await screen.findByRole("dialog", { name: t("failed.title") });
  fireEvent.click(within(sheet).getByRole("button", { name: t("failed.discard") }));
  const confirm = await screen.findByRole("dialog", { name: t("failed.discard") });
  fireEvent.click(within(confirm).getByRole("button", { name: t("failed.discard") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe("/survey"));
  expect(app.deps.outbox.getSnapshot().records).toEqual([]);
});

test("the building picker without a list has no label pointing at a missing input", () => {
  const { container } = render(
    <BuildingPicker buildings={undefined} value={null} onChange={() => undefined} />,
  );
  expect(container.querySelector("label")).toBeNull();
  expect(container.querySelector("input")).toBeNull();
  expect(screen.getByText(t("new.building.offline"))).toBeTruthy();
});

test("the chosen building is described to the search input", async () => {
  const app = testApp();
  renderRoute(app, "/survey/spots/new");
  const search = await screen.findByRole("searchbox", { name: t("new.building.label") });
  fireEvent.change(search, { target: { value: "melv" } });
  fireEvent.click(await screen.findByRole("button", { name: "Melville Library" }));
  const described = screen
    .getByRole("searchbox", { name: t("new.building.label") })
    .getAttribute("aria-describedby");
  expect(described).not.toBeNull();
  expect(document.getElementById(described ?? "")?.textContent).toBe("Melville Library");
});

test("a retry of the same photo reuses its id; a different photo always gets a new one", async () => {
  sessionStorage.setItem(CHECKLIST_KEY, "1");
  const app = testApp({ spots: [DRAFT] });
  app.network.set(false);
  app.deps.imageKit = fakeKit([1000, 1000, 1000, 1000]);
  const real = app.deps.outbox.addPhoto;
  const ids: (string | null | undefined)[] = [];
  app.deps.outbox.addPhoto = async (...args) => {
    ids.push(args[4]);
    // The first two saves throw before anything lands, and reading the queue back fails too.
    if (ids.length <= 2) throw new Error("indexeddb timeout");
    return real(...args);
  };
  app.deps.outbox.reload = async () => {
    throw new Error("indexeddb timeout");
  };
  renderRoute(app, `${at(DRAFT)}/photos`);
  await screen.findByRole("button", { name: t("photos.choose") });
  const pick = (name: string) =>
    fireEvent.change(screen.getByTestId("photo-library"), {
      target: { files: [new File(["x"], name, { type: "image/jpeg", lastModified: 1 })] },
    });
  pick("first.jpg");
  expect(await screen.findByText(t("common.save_failed"))).toBeTruthy();
  pick("first.jpg");
  await waitFor(() => expect(ids.length).toBe(2));
  expect(ids[1]).toBe(ids[0]);
  await screen.findByText(t("common.save_failed"));
  pick("second.jpg");
  await waitFor(() => expect(ids.length).toBe(3));
  expect(ids[2]).not.toBe(ids[0]);
  await waitFor(() =>
    expect(
      app.deps.outbox.getSnapshot().records.filter((r) => r.kind === "photo.upload").length,
    ).toBe(1),
  );
});

test("two quick Publish taps while the server is failing show no Published toast", async () => {
  const ready = surveySpotFixture({ status: "draft" });
  const app = testApp({ spots: [ready] });
  renderRoute(app, at(ready));
  const publish = await screen.findByRole("button", { name: t("spot.publish") });
  app.server.inner.failFor.add(ready.id);
  fireEvent.click(publish);
  fireEvent.click(publish);
  await app.deps.outbox.idle();
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText(t("spot.publish.done"))).toBeNull();
  expect(app.deps.outbox.getSnapshot().records.length).toBe(1);
});

test("moving from one spot's section to another spot's remounts with that spot's values", async () => {
  const a = surveySpotFixture({ seat_count: 10 });
  const b = surveySpotFixture({ id: "3f6c0b1e-8d2a-4c57-9b1f-6a7e8d9c0b2a", seat_count: 20 });
  const app = testApp({ spots: [a, b] });
  const view = renderRoute(app, `${at(a)}/seating`);
  const seats = () => screen.findByRole("textbox", { name: t("seating.seat_count.label") });
  expect(await seats()).toHaveProperty("value", "10");
  await view.router.navigate({ to: `${at(b)}/seating` });
  await waitFor(async () => expect(await seats()).toHaveProperty("value", "20"));
  // Both spots are cached now, so the next move has no loading gap to remount the editor.
  await view.router.navigate({ to: `${at(a)}/seating` });
  await waitFor(async () => expect(await seats()).toHaveProperty("value", "10"));
  await view.router.navigate({ to: `${at(b)}/seating` });
  await waitFor(async () => expect(await seats()).toHaveProperty("value", "20"));
});

test("a spot id that is not a uuid or a local id is not found, without any lookup", async () => {
  const app = testApp();
  renderRoute(app, "/survey/spots/not-an-id");
  expect(await screen.findByText(/not found/i)).toBeTruthy();
  expect(app.server.inner.requests.some((r) => r.path.includes("not-an-id"))).toBe(false);
});

test("a section that does not exist is not found", async () => {
  renderRoute(testApp({ spots: [DRAFT] }), `${at(DRAFT)}/nothing`);
  expect(await screen.findByText(/not found/i)).toBeTruthy();
});

test("a save that throws names the problem and stays on the editor", async () => {
  const app = testApp({ spots: [ONE_GAP] });
  app.deps.outbox.enqueue = async () => {
    throw new Error("indexeddb timeout");
  };
  const view = renderRoute(app, `${at(ONE_GAP)}/seating`);
  fireEvent.change(await screen.findByRole("textbox", { name: t("seating.seat_count.label") }), {
    target: { value: "40" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  expect((await screen.findByRole("alert")).textContent).toBe(t("common.save_failed"));
  expect(view.router.state.location.pathname).toBe(`${at(ONE_GAP)}/seating`);
});

test("a retry or discard that throws says so instead of closing silently", async () => {
  const spot = surveySpotFixture({ version: 3 });
  const app = testApp({ spots: [spot] });
  await app.deps.started;
  app.server.inner.failWith.push(200);
  await app.deps.outbox.enqueue({ kind: "spot.section", spot_id: spot.id, payload: SEATING }, 3);
  await app.deps.outbox.idle();
  app.deps.outbox.discard = async () => {
    throw new Error("indexeddb timeout");
  };
  renderRoute(app, at(spot));
  fireEvent.click(await screen.findByRole("button", { name: t("spot.failed.open") }));
  const sheet = await screen.findByRole("dialog", { name: t("failed.title") });
  fireEvent.click(within(sheet).getByRole("button", { name: t("failed.discard") }));
  const confirm = await screen.findByRole("dialog", { name: t("failed.discard") });
  fireEvent.click(within(confirm).getByRole("button", { name: t("failed.discard") }));
  expect(await screen.findByText(t("common.save_failed"))).toBeTruthy();
});

test("a write queued before the surveyor's own unpublish is not a conflict with it", async () => {
  const published = surveySpotFixture({ status: "published", version: 3 });
  const app = testApp({ spots: [published], me: { ...ME, role: "admin" } });
  await app.deps.started;
  // Nothing sends while the outbox is stopped, so the write waits at the version the surveyor saw.
  app.deps.outbox.stop();
  await app.deps.outbox.enqueue(
    { kind: "spot.section", spot_id: published.id, payload: SEATING },
    3,
  );
  renderRoute(app, at(published));
  fireEvent.click(within(await openActions()).getByRole("button", { name: t("spot.unpublish") }));
  const confirm = await screen.findByRole("dialog", {
    name: t("spot.unpublish.confirm.title", { name: published.official_name }),
  });
  fireEvent.click(
    within(confirm).getByRole("button", { name: t("spot.unpublish.confirm.action") }),
  );
  await waitFor(() => expect(app.server.inner.spot(published.id).version).toBe(4));
  await screen.findByText(t("spot.status.draft"));
  await act(async () => {
    app.deps.outbox.resume();
    await app.deps.outbox.idle();
  });
  await waitFor(() => expect(app.deps.outbox.getSnapshot().records).toEqual([]));
  expect(app.server.inner.spot(published.id).version).toBe(5);
});

async function setSeats(value: string) {
  fireEvent.change(await screen.findByRole("textbox", { name: t("seating.seat_count.label") }), {
    target: { value },
  });
}

test("Save and next goes to the next unfinished required section", async () => {
  const app = testApp({ spots: [TWO_GAPS] });
  const view = renderRoute(app, `${at(TWO_GAPS)}/seating`);
  await setSeats("40");
  fireEvent.click(screen.getByRole("button", { name: t("editor.save_next") }));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe(`${at(TWO_GAPS)}/environment`),
  );
  expect(view.router.state.location.search).toEqual({});
  expect(await screen.findByRole("heading", { level: 1, name: "Noise and feel" })).toBeTruthy();
  await waitFor(() => expect(app.server.inner.spot(TWO_GAPS.id).seat_count).toBe(40));
});

test("with nothing left after this one, the button is Save and returns to the overview", async () => {
  const app = testApp({ spots: [ONE_GAP] });
  const view = renderRoute(app, `${at(ONE_GAP)}/seating`);
  await setSeats("40");
  expect(screen.queryByRole("button", { name: t("editor.save_next") })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("editor.save") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(ONE_GAP)));
});

test("an optional section saves back to the overview", async () => {
  const app = testApp({ spots: [TWO_GAPS] });
  const view = renderRoute(app, `${at(TWO_GAPS)}/late_night`);
  expect(screen.queryByRole("button", { name: t("editor.save_next") })).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: t("editor.save") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(TWO_GAPS)));
});

test("Nothing changed checks the section and returns to the overview", async () => {
  const app = testApp({ spots: [TWO_GAPS] });
  const view = renderRoute(app, `${at(TWO_GAPS)}/access`);
  fireEvent.click(await screen.findByRole("button", { name: t("editor.verify") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(TWO_GAPS)));
  expect(await screen.findByText(t("editor.verify.done"))).toBeTruthy();
});

test("the editor shows progress, what comes next, and when the section was last checked", async () => {
  renderRoute(testApp({ spots: [TWO_GAPS] }), `${at(TWO_GAPS)}/seating`);
  expect(await screen.findByRole("img", { name: "4 of 6 done" })).toBeTruthy();
  expect(screen.getByText(`4 of 6 · After this: ${t("section.environment.name")}`)).toBeTruthy();
  expect(screen.getByText(t("home.stale.never"))).toBeTruthy();
});

test("with nothing after it the progress line is just the count", async () => {
  renderRoute(testApp({ spots: [FULL] }), `${at(FULL)}/identity`);
  expect(await screen.findByText("6 of 6")).toBeTruthy();
  expect(screen.getByText(/^Checked [A-Z][a-z]{2} \d{1,2}$/)).toBeTruthy();
});

test("a guided walk checks each section in turn, then returns with a toast", async () => {
  const app = testApp({ spots: [FULL] });
  // Offline, so every check stays queued where this test can read it.
  app.network.set(false);
  const view = renderRoute(app, `${at(FULL)}/identity?walk=1`);
  for (const section of ["access", "seating", "power", "environment", "use_fit"]) {
    // Not marked checked until this section is opened and answered.
    fireEvent.click(await screen.findByRole("button", { name: t("editor.verify") }));
    await waitFor(() => expect(view.router.state.location.pathname).toBe(`${at(FULL)}/${section}`));
    expect(view.router.state.location.search).toEqual({ walk: 1 });
  }
  // The last one is plain Save: nothing is left.
  expect(screen.queryByRole("button", { name: t("editor.save_next") })).toBeNull();
  expect(screen.getByRole("button", { name: t("editor.save") })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("editor.verify") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(FULL)));
  expect(view.router.state.location.search).toEqual({});
  expect(await screen.findByText("Checked 6 sections")).toBeTruthy();
  // Each section was checked on its own: one verify write per required section.
  const groups = app.deps.outbox
    .getSnapshot()
    .records.flatMap((r) => (r.kind === "spot.verify" ? r.payload.groups : []));
  expect(groups.sort()).toEqual([
    "access",
    "environment",
    "identity",
    "power",
    "seating",
    "use_fit",
  ]);
});

test("in a walk, Save goes to the next section and keeps the walk", async () => {
  const app = testApp({ spots: [TWO_GAPS] });
  const view = renderRoute(app, `${at(TWO_GAPS)}/seating?walk=1`);
  await setSeats("40");
  expect(screen.getByRole("button", { name: t("editor.save_next") })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t("editor.save_next") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(`${at(TWO_GAPS)}/power`));
  expect(view.router.state.location.search).toEqual({ walk: 1 });
});

test("a walk skips sections already checked in it", async () => {
  const app = testApp({ spots: [FULL] });
  const view = renderRoute(app, `${at(FULL)}/seating?walk=1`);
  const go = async (section: string, title: string) => {
    await view.router.navigate({
      to: "/survey/spots/$id/$section",
      params: { id: FULL.id, section: section as "identity" },
      search: { walk: 1 },
    });
    await screen.findByRole("heading", { level: 1, name: title });
  };
  const verify = async (expected: string) => {
    fireEvent.click(await screen.findByRole("button", { name: t("editor.verify") }));
    await waitFor(() =>
      expect(view.router.state.location.pathname).toBe(`${at(FULL)}/${expected}`),
    );
  };
  await verify("power"); // seating checked
  await go("identity", t("section.identity.name"));
  await verify("access"); // identity checked
  await verify("power"); // access checked; seating is skipped, it was checked first
  await verify("environment"); // power checked; the walk goes on past the ones already done
});

test("without ?walk=1 nothing is walked and no walk toast shows", async () => {
  const app = testApp({ spots: [FULL] });
  const view = renderRoute(app, `${at(FULL)}/use_fit`);
  fireEvent.click(await screen.findByRole("button", { name: t("editor.verify") }));
  await waitFor(() => expect(view.router.state.location.pathname).toBe(at(FULL)));
  expect(screen.queryByText(/^Checked \d+ sections?$/)).toBeNull();
});
