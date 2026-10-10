import { t } from "@perch/ui-logic";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { Pin } from "../src/map/pin.ts";
import { renderRoute, type TestApp, testApp } from "./harness.tsx";

const stub = vi.hoisted(() => ({
  renders: 0,
  fail: false,
  loadFails: false,
  themes: [] as string[],
  pins: [] as unknown[],
  centers: [] as string[],
}));

// The real map needs WebGL; the stub draws what the screen hands it.
vi.mock("../src/map/MapView.tsx", async () => {
  const { useEffect } = await import("react");
  return {
    default: (props: {
      pins: readonly Pin[];
      centerLat: number;
      centerLng: number;
      selected: string | null;
      onSelect(id: string): void;
      onError(): void;
      theme: string;
    }) => {
      if (stub.loadFails) throw new Error("chunk failed");
      stub.renders += 1;
      stub.themes.push(props.theme);
      stub.pins.push(props.pins);
      stub.centers.push(`${props.centerLat},${props.centerLng}`);
      useEffect(() => {
        if (stub.fail) props.onError();
      }, [props.onError]);
      return (
        <div data-testid="map">
          {props.pins.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pin pin--${p.bucket}`}
              aria-label={p.label}
              aria-pressed={p.id === props.selected}
              onClick={() => props.onSelect(p.id)}
            />
          ))}
        </div>
      );
    },
  };
});

beforeEach(() => {
  stub.renders = 0;
  stub.fail = false;
  stub.loadFails = false;
  stub.themes = [];
  stub.pins = [];
  stub.centers = [];
});

async function openMap(app: TestApp = testApp({ me: null })) {
  app.deps.prefs.setItem(
    "student:browse",
    JSON.stringify({ view: "map", arrive: "now", extra: [], showLocked: false, openOnly: false }),
  );
  const view = renderRoute(app, "/browse");
  await act(async () => {
    await view.router.load();
  });
  await screen.findByRole("heading", { level: 1, name: t("student.browse.title") });
  return { app, view };
}

test("choosing Map shows it and saves the choice", async () => {
  const app = testApp({ me: null });
  const view = renderRoute(app, "/browse");
  await act(async () => {
    await view.router.load();
  });
  await screen.findByRole("heading", { level: 1, name: t("student.browse.title") });
  expect(stub.renders).toBe(0);
  fireEvent.click(screen.getByRole("radio", { name: t("student.browse.view.map") }));
  expect(await screen.findByTestId("map")).toBeTruthy();
  expect(JSON.parse(app.deps.prefs.getItem("student:browse") ?? "{}").view).toBe("map");
});

test("the map has one pin per visible row, and each label says typical, estimate or no data", async () => {
  await openMap();
  const map = await screen.findByTestId("map");
  const pins = within(map).getAllByRole("button");
  expect(pins).toHaveLength(6);
  for (const pin of pins) {
    const label = pin.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/typical|estimate|No busyness data/);
    expect(label).not.toMatch(/\blive\b|right now/i);
  }
  expect(
    within(map).getByRole("button", {
      name: /^Quiet Carrels, Usually some seats, typical Tue 2 PM$/,
    }),
  ).toBeTruthy();
  expect(pins.some((p) => p.className.includes("pin--none"))).toBe(true);
  expect(pins.some((p) => p.className.includes("pin--filling"))).toBe(true);
});

test("pins follow the filters: locked spots appear only when shown", async () => {
  await openMap();
  const map = await screen.findByTestId("map");
  expect(within(map).queryByRole("button", { name: /^Kelly RCC/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "2 spots hidden for access" }));
  await waitFor(() =>
    expect(
      within(screen.getByTestId("map")).getByRole("button", { name: /^Kelly RCC/ }),
    ).toBeTruthy(),
  );
  expect(within(screen.getByTestId("map")).getAllByRole("button")).toHaveLength(8);
});

test("the legend names all six buckets with words, not colour alone", async () => {
  await openMap();
  const legend = (await screen.findByText(t("student.map.legend"))).closest(".map-legend");
  if (legend === null) throw new Error("no legend");
  const items = [...legend.querySelectorAll("li")].map((li) => li.textContent);
  expect(items).toEqual(["Empty", "Some seats", "Filling up", "Nearly full", "Full", "No data"]);
  expect(legend.querySelectorAll("li [aria-hidden='true']")).toHaveLength(6);
  expect(screen.getByText("Typical busyness, not live")).toBeTruthy();
});

test("offline, the map is never loaded and the sentence says so", async () => {
  const app = testApp({ me: null });
  app.network.set(false);
  await openMap(app);
  expect(await screen.findByText(t("student.map.offline"))).toBeTruthy();
  expect(stub.renders).toBe(0);
  expect(screen.queryByTestId("map")).toBeNull();
  expect(document.querySelectorAll(".row-list")).toHaveLength(0);
});

test("a map that fails to start says so", async () => {
  stub.fail = true;
  await openMap();
  expect(await screen.findByText(t("student.map.failed"))).toBeTruthy();
  expect(screen.queryByTestId("map")).toBeNull();
});

test("choosing a pin shows its card with a link to the spot", async () => {
  await openMap();
  const map = await screen.findByTestId("map");
  expect(screen.queryByRole("link", { name: t("student.map.open") })).toBeNull();
  const pin = within(map).getByRole("button", { name: /^SAC Lounge/ });
  fireEvent.click(pin);
  await waitFor(() => expect(pin.getAttribute("aria-pressed")).toBe("true"));
  const link = await screen.findByRole("link", { name: t("student.map.open") });
  expect(link.getAttribute("href")).toBe("/spot/sac-lounge");
  const card = link.closest(".keep");
  expect(card?.textContent).toContain("SAC Lounge");
  expect(card?.textContent).toContain("Filling up, estimate");
  expect(card?.textContent).toContain("Checked Oct 6");
});

test("an empty filter result shows the empty message instead of an empty map", async () => {
  const app = testApp({ me: null });
  app.deps.prefs.setItem(
    "student:browse",
    JSON.stringify({
      view: "map",
      arrive: "now",
      extra: [
        { attr: "noise_policy", target: ["silent"] },
        { attr: "noise_policy", target: ["conversational"] },
      ],
      showLocked: false,
      openOnly: false,
    }),
  );
  const view = renderRoute(app, "/browse");
  await act(async () => {
    await view.router.load();
  });
  expect(await screen.findByText(t("student.browse.empty"))).toBeTruthy();
  expect(stub.renders).toBe(0);
});

test("choosing a pin keeps the same pins and centre, so the map is not rebuilt", async () => {
  await openMap();
  const map = await screen.findByTestId("map");
  const before = stub.renders;
  fireEvent.click(within(map).getByRole("button", { name: /^SAC Lounge/ }));
  await screen.findByRole("link", { name: t("student.map.open") });
  expect(stub.renders).toBeGreaterThan(before);
  // Every render after the first got the very same pins array and the same centre numbers.
  expect(new Set(stub.pins).size).toBe(1);
  expect(new Set(stub.centers).size).toBe(1);
});

test("a map chunk that fails to load offers a retry that loads it again", async () => {
  stub.loadFails = true;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await openMap();
  expect(await screen.findByText(t("student.map.failed"))).toBeTruthy();
  stub.loadFails = false;
  fireEvent.click(screen.getByRole("button", { name: t("common.retry") }));
  expect(await screen.findByTestId("map")).toBeTruthy();
  vi.restoreAllMocks();
});

test("a map that fails to start can be retried too", async () => {
  stub.fail = true;
  await openMap();
  expect(await screen.findByText(t("student.map.failed"))).toBeTruthy();
  stub.fail = false;
  fireEvent.click(screen.getByRole("button", { name: t("common.retry") }));
  expect(await screen.findByTestId("map")).toBeTruthy();
});
