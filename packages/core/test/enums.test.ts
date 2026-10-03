import { expect, test } from "bun:test";
import { FULLNESS, FULLNESS_RATIO, Fullness, NoisePolicy } from "../src/index.ts";

test("fullness ratios match the spec", () => {
  expect(FULLNESS_RATIO).toEqual({
    empty: 0.1,
    some: 0.35,
    filling: 0.6,
    nearly_full: 0.85,
    full: 1.0,
  });
  expect(Object.keys(FULLNESS_RATIO)).toEqual([...FULLNESS]);
});

test("zod enums reject unknown values", () => {
  expect(NoisePolicy.safeParse("quiet").success).toBe(true);
  expect(NoisePolicy.safeParse("loud").success).toBe(false);
  expect(Fullness.safeParse("full").success).toBe(true);
});
