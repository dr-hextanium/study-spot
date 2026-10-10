import { afterEach, expect, test, vi } from "vitest";
import { createSessionStorage, sendPickPing } from "../src/adapters/browser.ts";

afterEach(() => vi.unstubAllGlobals());

test("sendPickPing posts text/plain with no cookies and survives a page close", () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  sendPickPing("https://api.example/ping/pick", '{"spot_id":"x"}');
  expect(fetchMock).toHaveBeenCalledWith("https://api.example/ping/pick", {
    method: "POST",
    body: '{"spot_id":"x"}',
    keepalive: true,
    credentials: "omit",
    headers: { "content-type": "text/plain" },
  });
});

test("sendPickPing swallows a network failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("offline");
    }),
  );
  expect(() => sendPickPing("https://api.example/ping/pick", "{}")).not.toThrow();
  await Promise.resolve();
});

test("the tab storage falls back to memory when sessionStorage is blocked", () => {
  const win = {
    get sessionStorage(): Storage {
      throw new Error("blocked");
    },
  } as unknown as Window;
  const tab = createSessionStorage(win);
  tab.setItem("k", "v");
  expect(tab.getItem("k")).toBe("v");
});
