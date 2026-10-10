import { describe, expect, test } from "vitest";
import { lockZoomWhenInstalled } from "../src/ui/appZoom.ts";

function fakeWindow(standalone: boolean) {
  document.head.innerHTML =
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />';
  const base = window;
  return new Proxy(base, {
    get(target, key) {
      if (key === "matchMedia")
        return (q: string) => ({ matches: standalone && q.includes("standalone") });
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("lockZoomWhenInstalled", () => {
  test("a browser tab keeps zoom", () => {
    expect(lockZoomWhenInstalled(fakeWindow(false))).toBe(false);
    const content = document.querySelector('meta[name="viewport"]')?.getAttribute("content");
    expect(content).not.toContain("user-scalable=no");
  });

  test("the installed app locks zoom and blocks the pinch gesture", () => {
    expect(lockZoomWhenInstalled(fakeWindow(true))).toBe(true);
    const content = document.querySelector('meta[name="viewport"]')?.getAttribute("content");
    expect(content).toContain("maximum-scale=1");
    expect(content).toContain("user-scalable=no");
    const pinch = new Event("gesturestart", { cancelable: true });
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
  });
});
