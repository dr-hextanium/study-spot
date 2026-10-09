import { t } from "@study-spot/ui-logic";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { dateTime, shortDate } from "../src/lib/format.ts";
import { Banner } from "../src/ui/Banner.tsx";
import { Button } from "../src/ui/Button.tsx";
import { Check } from "../src/ui/Check.tsx";
import { TextField } from "../src/ui/Field.tsx";
import { Segmented } from "../src/ui/Segmented.tsx";
import { ConfirmSheet } from "../src/ui/Sheet.tsx";
import { Stepper } from "../src/ui/Stepper.tsx";

test("buttons default to type=button and carry their variant", () => {
  render(<Button variant="primary">Publish</Button>);
  const b = screen.getByRole("button", { name: "Publish" });
  expect(b.getAttribute("type")).toBe("button");
  expect(b.className).toContain("btn--primary");
});

test("a text field ties its label, helper, and error to the input", () => {
  render(
    <TextField label="Name" helper="Use the sign" error="Required" value="" onChange={() => {}} />,
  );
  const input = screen.getByRole("textbox", { name: "Name" });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const described = input.getAttribute("aria-describedby");
  expect(described === null ? "" : document.getElementById(described)?.textContent).toBe(
    "Required",
  );
});

test("the segmented control is a radio group that reports the chosen value", () => {
  const onChange = vi.fn();
  render(
    <Segmented
      label="Noise rule"
      options={[
        { value: "silent", label: "Silent" },
        { value: "quiet", label: "Quiet" },
      ]}
      value="silent"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("group", { name: "Noise rule" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Silent" })).toHaveProperty("checked", true);
  fireEvent.click(screen.getByRole("radio", { name: "Quiet" }));
  expect(onChange).toHaveBeenCalledWith("quiet");
});

function SeatStepper() {
  const [n, setN] = useState<number | null>(null);
  return <Stepper label="Seats" value={n} onChange={setN} min={1} />;
}

test("the stepper takes typed numbers and steps within its bounds", () => {
  render(<SeatStepper />);
  const input = screen.getByRole("textbox", { name: "Seats" });
  fireEvent.change(input, { target: { value: "120" } });
  expect((input as HTMLInputElement).value).toBe("120");
  fireEvent.click(screen.getByRole("button", { name: t("common.more") }));
  expect((input as HTMLInputElement).value).toBe("121");
  fireEvent.change(input, { target: { value: "1" } });
  expect(screen.getByRole("button", { name: t("common.less") })).toHaveProperty("disabled", true);
  fireEvent.change(input, { target: { value: "12a" } });
  expect((input as HTMLInputElement).value).toBe("12");
});

test("a refusal banner is an alert and a note is a status", () => {
  render(
    <>
      <Banner>No</Banner>
      <Banner tone="note">Heads up</Banner>
    </>,
  );
  expect(screen.getByRole("alert").textContent).toBe("No");
  expect(screen.getByRole("status").textContent).toBe("Heads up");
  // A refusal carries an icon by default; a note stays plain.
  expect(screen.getByRole("alert").querySelector("svg.banner__icon")).not.toBeNull();
  expect(screen.getByRole("status").querySelector("svg")).toBeNull();
});

test("the sync status bar uses the short forms that fit a 360 px phone", () => {
  for (const text of [
    t("sync.short.pending", { count: 12 }),
    t("sync.short.failed", { count: 12 }),
    t("sync.syncing", { count: 12 }),
    t("sync.short.unreadable", { count: 12 }),
    t("sync.all_synced"),
  ]) {
    expect(text.length).toBeLessThanOrEqual(16);
  }
});

test("a confirm sheet is a labelled dialog with both choices", () => {
  const onConfirm = vi.fn();
  render(
    <ConfirmSheet
      open
      title="Discard changes?"
      body="Your edits won't be saved."
      action="Discard changes"
      cancel="Keep editing"
      destructive
      onConfirm={onConfirm}
      onCancel={() => {}}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Discard changes?" });
  expect(dialog.hasAttribute("open")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(onConfirm).toHaveBeenCalled();
});

function MinStepper() {
  const [n, setN] = useState<number | null>(null);
  return <Stepper label="Seats" value={n} onChange={setN} min={10} max={500} />;
}

test("the stepper lets a surveyor type a number whose first digit is below the minimum", () => {
  render(<MinStepper />);
  const input = screen.getByRole("textbox", { name: "Seats" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "2" } });
  expect(input.value).toBe("2");
  fireEvent.change(input, { target: { value: "25" } });
  expect(input.value).toBe("25");
  fireEvent.blur(input);
  expect(input.value).toBe("25");
});

test("an out-of-range entry is clamped on blur and the box shows the stored value", () => {
  render(<MinStepper />);
  const input = screen.getByRole("textbox", { name: "Seats" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "2" } });
  fireEvent.blur(input);
  expect(input.value).toBe("10");
  fireEvent.change(input, { target: { value: "9999" } });
  expect(input.value).toBe("9999");
  fireEvent.blur(input);
  expect(input.value).toBe("500");
  fireEvent.click(screen.getByRole("button", { name: t("common.less") }));
  expect(input.value).toBe("499");
});

test("bad dates never throw", () => {
  expect(() => shortDate("garbage", "America/New_York")).not.toThrow();
  expect(() => dateTime("garbage", "America/New_York")).not.toThrow();
});

function Harness(props: { initial: "a" | "b" | null; onCommit: (v: "a" | "b") => void }) {
  const [v, setV] = useState(props.initial);
  return (
    <Segmented
      label="Pick"
      options={[
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ]}
      value={v}
      onChange={(x) => {
        props.onCommit(x);
        setV(x);
      }}
    />
  );
}

test("segmented shows the choice on pointerdown and commits once on pointerup", () => {
  const commit = vi.fn();
  render(<Harness initial="a" onCommit={commit} />);
  const b = screen.getByRole("radio", { name: "B" });
  const label = b.closest("label");
  if (label === null) throw new Error("no label");
  fireEvent.pointerDown(label, { isPrimary: true, button: 0, pointerId: 1 });
  expect((b as HTMLInputElement).checked).toBe(true);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerUp(label, { isPrimary: true, button: 0, pointerId: 1 });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledWith("b");
  fireEvent.click(b);
  expect(commit).toHaveBeenCalledTimes(1);
});

test("a cancelled press (a scroll) puts the choice back and commits nothing, even when empty", () => {
  for (const initial of ["a", null] as const) {
    const commit = vi.fn();
    const { unmount } = render(<Harness initial={initial} onCommit={commit} />);
    const b = screen.getByRole("radio", { name: "B" });
    const label = b.closest("label");
    if (label === null) throw new Error("no label");
    fireEvent.pointerDown(label, { isPrimary: true, button: 0, pointerId: 2 });
    expect((b as HTMLInputElement).checked).toBe(true);
    fireEvent.pointerCancel(window, { pointerId: 2 });
    expect((b as HTMLInputElement).checked).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    unmount();
  }
});

test("keyboard and assistive tech still choose through the native radio", () => {
  const commit = vi.fn();
  render(<Harness initial="a" onCommit={commit} />);
  fireEvent.click(screen.getByRole("radio", { name: "B" }));
  expect(commit).toHaveBeenCalledWith("b");
});

test("tag checks are native checkboxes with a 44 px hit area class", () => {
  render(<Check variant="tag" label="Carrels" checked={false} onChange={() => {}} />);
  const box = screen.getByRole("checkbox", { name: "Carrels" });
  expect(box.closest("label")?.className).toContain("tag");
});

function labelOf(name: string): HTMLLabelElement {
  const l = screen.getByRole("radio", { name }).closest("label");
  if (l === null) throw new Error("no label");
  return l;
}

test("a release outside the pressed option (captured touch) commits nothing and reverts", () => {
  const commit = vi.fn();
  render(<Harness initial="a" onCommit={commit} />);
  const b = labelOf("B");
  b.getBoundingClientRect = () => new DOMRect(0, 0, 100, 44);
  fireEvent.pointerDown(b, { isPrimary: true, button: 0, pointerId: 3, clientX: 50, clientY: 20 });
  fireEvent.pointerUp(b, { isPrimary: true, button: 0, pointerId: 3, clientX: 300, clientY: 20 });
  expect(commit).not.toHaveBeenCalled();
  expect((screen.getByRole("radio", { name: "B" }) as HTMLInputElement).checked).toBe(false);
});

test("a release on a different option commits nothing and reverts", () => {
  const commit = vi.fn();
  render(<Harness initial="a" onCommit={commit} />);
  fireEvent.pointerDown(labelOf("B"), { isPrimary: true, button: 0, pointerId: 4 });
  fireEvent.pointerUp(labelOf("A"), { isPrimary: true, button: 0, pointerId: 4 });
  expect(commit).not.toHaveBeenCalled();
  expect((screen.getByRole("radio", { name: "B" }) as HTMLInputElement).checked).toBe(false);
});

test("a pointerup after a pointercancel commits nothing", () => {
  const commit = vi.fn();
  render(<Harness initial="a" onCommit={commit} />);
  fireEvent.pointerDown(labelOf("B"), { isPrimary: true, button: 0, pointerId: 5 });
  fireEvent.pointerCancel(window, { pointerId: 5 });
  fireEvent.pointerUp(labelOf("B"), { isPrimary: true, button: 0, pointerId: 5 });
  expect(commit).not.toHaveBeenCalled();
});
