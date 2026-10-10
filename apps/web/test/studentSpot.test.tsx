import type { Bundle } from "@perch/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { makeScoringBundle, SPOT } from "../../../packages/core/test/fixtures/scoring-bundle.ts";
import { createWebShare } from "../src/adapters/share.ts";
import { spotFacts } from "../src/lib/spotFacts.ts";
import { readyBundle, renderRoute, testApp } from "./harness.tsx";

// Tue 2 PM campus time.
const TUE_2PM = "2026-10-13T18:00:00Z";

function app(opts: Parameters<typeof testApp>[0] = {}) {
  return testApp({ me: null, now: TUE_2PM, ...opts });
}

test("a spot page tells the truth about hours, busyness and checks", async () => {
  const a = app();
  const { container } = renderRoute(a, "/spot/quiet-carrels");
  expect(await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" })).toBeTruthy();
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(container.querySelector(".meta")?.textContent).toContain("Melville Library · Floor 1");
  expect(container.querySelector(".meta")?.textContent).toContain("Checked Oct 6");
  expect(screen.getByText("Typical Tuesday, not live.")).toBeTruthy();
  expect(screen.getByText("This hour")).toBeTruthy();
  expect(screen.getByText("Usually some seats, typical Tue 2 PM")).toBeTruthy();
  expect(container.querySelectorAll(".btn--primary")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Directions" }).className).toContain("btn--primary");

  const hours = screen.getByRole("region", { name: "This week" });
  const days = within(hours)
    .getAllByRole("listitem")
    .map((li) => li.textContent);
  expect(days).toHaveLength(7);
  expect(days[0]).toContain("Mon");
  expect(days[6]).toContain("Sun");
  expect(days[1]).toContain("Tue");
  expect(days[1]).toContain("Today");
  expect(within(hours).getAllByText("Today")).toHaveLength(1);

  const checked = screen.getByRole("region", { name: "Last checked" });
  expect(checked.textContent).toContain("Name and place");
  expect(checked.textContent).toContain("Oct 5");
  expect(checked.textContent).toContain("Hours");
  expect(checked.textContent).toContain("Oct 6");

  expect(screen.getByText("No photo yet")).toBeTruthy();
  expect(screen.getByText("Spot data CC BY-SA 4.0, Perch surveyors.")).toBeTruthy();
});

test("nothing on the page claims to be live", async () => {
  const a = app();
  const { container } = renderRoute(a, "/spot/quiet-carrels");
  await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" });
  const text = container.textContent ?? "";
  expect(text.replace(/not live\./g, "")).not.toMatch(/\blive\b|\bnow\b/i);
});

test("a locked spot says who it is for", async () => {
  renderRoute(app(), "/spot/kelly-rcc");
  expect(await screen.findByText("Residents of Kelly Quad only")).toBeTruthy();
});

test("an unverified spot says so", async () => {
  renderRoute(app(), "/spot/unverified-room");
  expect(await screen.findByText("Access not confirmed yet")).toBeTruthy();
});

test("a spot with no confirmed hours and no data says so", async () => {
  renderRoute(app(), "/spot/hours-tbd");
  expect(await screen.findByText("Hours not confirmed")).toBeTruthy();
  expect(screen.getByText("No data yet")).toBeTruthy();
  expect(screen.queryByText("This hour")).toBeNull();
});

test("estimated hours are hatched and the legend says estimate", async () => {
  const { container } = renderRoute(app(), "/spot/sac-lounge");
  await screen.findByRole("heading", { level: 1, name: /SAC Lounge/ });
  expect(screen.getByText("Estimate")).toBeTruthy();
  const bars = container.querySelectorAll(".forecast__bars .forecast__bar");
  expect(bars).toHaveLength(24);
  for (const bar of bars) expect(bar.classList.contains("forecast__bar--estimated")).toBe(true);
});

test("an unknown slug is not found, with a way to Browse", async () => {
  renderRoute(app(), "/spot/nope");
  expect(
    await screen.findByRole("heading", { level: 1, name: "That spot isn't in Perch." }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Browse spots" }).getAttribute("href")).toBe("/browse");
});

test("while the bundle loads, the page shows a skeleton, not a not-found", async () => {
  renderRoute(app({ bundle: { phase: "loading" } }), "/spot/quiet-carrels");
  await waitFor(() => expect(document.querySelector("[aria-busy='true']")).not.toBeNull());
  expect(screen.queryByText("That spot isn't in Perch.")).toBeNull();
});

test("an unavailable bundle says why", async () => {
  renderRoute(
    app({ bundle: { phase: "unavailable", reason: "offline_no_cache" } }),
    "/spot/quiet-carrels",
  );
  expect(
    await screen.findByText("Can't load spots offline yet. Open once with signal."),
  ).toBeTruthy();
});

test("share: a copied link toasts, a failure toasts, a shared sheet is quiet", async () => {
  const copied = app({ webShare: "copied" });
  const r1 = renderRoute(copied, "/spot/quiet-carrels");
  await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" });
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  expect(await screen.findByText("Link copied")).toBeTruthy();
  expect(copied.shares).toEqual([
    { title: "Quiet Carrels", url: `${location.origin}/spot/quiet-carrels` },
  ]);
  r1.unmount();

  const failed = app({ webShare: "failed" });
  renderRoute(failed, "/spot/quiet-carrels");
  await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" });
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  expect(await screen.findByText("Couldn't share. Copy the address bar instead.")).toBeTruthy();
});

test("a share sheet that completes shows no toast", async () => {
  const a = app({ webShare: "shared" });
  renderRoute(a, "/spot/quiet-carrels");
  await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" });
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(a.shares).toHaveLength(1);
  expect(screen.queryByText("Link copied")).toBeNull();
  expect(screen.queryByText(/Couldn't share/)).toBeNull();
});

test("the back link goes Home after a pick and to Browse otherwise", async () => {
  const { container, unmount } = renderRoute(app(), "/spot/quiet-carrels?via=pick");
  await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" });
  expect(container.querySelector("a[aria-label], .topbar a")?.getAttribute("href")).toBe("/");
  unmount();
  const second = renderRoute(app(), "/spot/quiet-carrels");
  await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" });
  expect(second.container.querySelector(".topbar a")?.getAttribute("href")).toBe("/browse");
});

test("a photo that fails to load shows the unavailable frame, never a broken image", async () => {
  const bundle: Bundle = makeScoringBundle();
  const first = bundle.spots[0];
  if (first === undefined) throw new Error("no spot");
  first.photos = [
    {
      url: "https://data.example/photos/a.jpg",
      taken_at: "2026-10-05T15:00:00.000Z",
      is_cover: true,
    },
  ];
  const { container } = renderRoute(app({ bundle: readyBundle(bundle) }), `/spot/${first.slug}`);
  const img = await waitForImg(container);
  expect(img.getAttribute("src")).toBe("https://data.example/photos/a.jpg");
  fireEvent.error(img);
  expect(await screen.findByText("Image unavailable")).toBeTruthy();
  expect(container.querySelector("img.photo__img")).toBeNull();
});

async function waitForImg(container: HTMLElement): Promise<HTMLImageElement> {
  const img = await screen.findByRole("img");
  expect(container.contains(img)).toBe(true);
  if (!(img instanceof HTMLImageElement)) throw new Error("not an image");
  return img;
}

test("the pick ping fires once on a pick arrival, not on a plain render", async () => {
  const plain = app();
  const r = renderRoute(plain, "/spot/quiet-carrels");
  await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" });
  expect(plain.pings).toEqual([]);
  r.unmount();

  const a = app();
  const { router } = renderRoute(a, "/spot/quiet-carrels?via=pick");
  await screen.findByRole("heading", { level: 1, name: "Quiet Carrels" });
  expect(a.pings).toEqual([SPOT.carrels]);
  // The clock moving and the route reloading render the page again; neither pings.
  a.clock.set("2026-10-13T19:00:00Z");
  await act(async () => {
    await router.invalidate();
  });
  expect(a.pings).toEqual([SPOT.carrels]);
});

test("the Directions button pings once more", async () => {
  const a = app();
  renderRoute(a, "/spot/quiet-carrels?via=pick");
  const link = await screen.findByRole("link", { name: "Directions" });
  expect(a.pings).toHaveLength(1);
  expect(link.getAttribute("href")).toContain("https://www.google.com/maps/dir/");
  fireEvent.click(link);
  expect(a.pings).toHaveLength(2);
  expect(a.pings[1]).toBe(a.pings[0]);
});

test("Directions without via=pick sends no ping", async () => {
  const a = app();
  renderRoute(a, "/spot/quiet-carrels");
  const link = await screen.findByRole("link", { name: "Directions" });
  fireEvent.click(link);
  expect(a.pings).toEqual([]);
});

test("spot facts skip unknown values and label the rest", () => {
  const spot = makeScoringBundle().spots[0];
  if (spot === undefined) throw new Error("no spot");
  const facts = spotFacts(spot);
  const labels = facts.map((f) => f.label);
  expect(new Set(labels).size).toBe(labels.length);
  expect(facts.every((f) => f.value !== "" && f.label !== "")).toBe(true);
  // wifi_mbps is null in the fixture, so it is skipped.
  expect(spot.wifi_mbps).toBeNull();
  expect(facts.some((f) => f.label.toLowerCase().includes("wi"))).toBe(false);
});

test("createWebShare: the share sheet first, then the link, and a cancel is quiet", async () => {
  const data = { title: "Spot", url: "https://perch.example/spot/x" };
  const calls: string[] = [];
  const sheet = {
    share: async () => {
      calls.push("sheet");
    },
    clipboard: {
      writeText: async () => {
        calls.push("copy");
      },
    },
  } as unknown as Navigator;
  expect(await createWebShare(sheet).share(data)).toBe("shared");
  expect(calls).toEqual(["sheet"]);

  const cancelled = {
    share: async () => {
      throw new DOMException("cancelled", "AbortError");
    },
    clipboard: sheet.clipboard,
  } as unknown as Navigator;
  expect(await createWebShare(cancelled).share(data)).toBe("shared");
  expect(calls).toEqual(["sheet"]);

  const blocked = {
    share: async () => {
      throw new DOMException("no", "NotAllowedError");
    },
    clipboard: sheet.clipboard,
  } as unknown as Navigator;
  expect(await createWebShare(blocked).share(data)).toBe("copied");
  expect(calls).toEqual(["sheet", "copy"]);

  const none = {
    clipboard: {
      writeText: async () => {
        throw new Error("blocked");
      },
    },
  } as unknown as Navigator;
  expect(await createWebShare(none).share(data)).toBe("failed");
});
