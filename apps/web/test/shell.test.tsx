import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useLargeTitle } from "../src/hooks/useLargeTitle.ts";
import { StepBar } from "../src/ui/StepBar.tsx";

afterEach(() => vi.unstubAllGlobals());

test("the step bar draws one segment per step and names the progress", () => {
  const { container } = render(
    <StepBar steps={["done", "done", "current", "todo"]} label="2 of 4 done" />,
  );
  expect(screen.getByRole("img", { name: "2 of 4 done" })).toBeTruthy();
  expect(container.querySelectorAll(".stepbar__step")).toHaveLength(4);
  expect(container.querySelectorAll(".stepbar__step--current")).toHaveLength(1);
});

test("the bar title appears once the large title leaves the viewport", () => {
  let fire: (visible: boolean) => void = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        fire = (visible) => cb([{ isIntersecting: visible }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  function Probe() {
    const { ref, scrolled } = useLargeTitle();
    return <h1 ref={ref}>{scrolled ? "scrolled" : "top"}</h1>;
  }
  render(<Probe />);
  expect(screen.getByRole("heading").textContent).toBe("top");
  act(() => fire(false));
  expect(screen.getByRole("heading").textContent).toBe("scrolled");
});

test("without IntersectionObserver the bar title stays hidden and nothing throws", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  function Probe() {
    const { ref, scrolled } = useLargeTitle();
    return <h1 ref={ref}>{scrolled ? "scrolled" : "top"}</h1>;
  }
  render(<Probe />);
  expect(screen.getByRole("heading").textContent).toBe("top");
});
