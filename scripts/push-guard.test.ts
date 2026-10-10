import { expect, test } from "bun:test";
import { localDay, MAX_PER_DAY, pushesMain, pushesToday } from "./push-guard.ts";

test("only a push that updates main counts", () => {
  expect(pushesMain("refs/heads/main abc refs/heads/main def\n")).toBe(true);
  expect(pushesMain("refs/heads/fix abc refs/heads/fix def\n")).toBe(false);
  expect(pushesMain("refs/tags/v0.1.0 abc refs/tags/v0.1.0 def\n")).toBe(false);
  expect(pushesMain("")).toBe(false);
});

test("pushes are counted per local calendar day", () => {
  const log = ["2026-10-09 2026-10-09T23:00:00.000Z", "2026-10-10 a", "2026-10-10 b"].join("\n");
  expect(pushesToday(log, "2026-10-10")).toBe(2);
  expect(pushesToday(log, "2026-10-11")).toBe(0);
  expect(localDay(new Date(2026, 9, 10, 23, 59))).toBe("2026-10-10");
  expect(MAX_PER_DAY).toBe(10);
});
