import { expect, test } from "vitest";
import { scrollKey } from "../src/app/scrollKey.ts";

const loc = (pathname: string, key = "k1") =>
  ({ pathname, href: pathname, state: { __TSR_key: key } }) as unknown as Parameters<
    typeof scrollKey
  >[0];

test("Home and the overview restore by path; editors and new spot open fresh", () => {
  expect(scrollKey(loc("/survey"))).toBe("/survey");
  expect(scrollKey(loc("/survey/spots/8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11"))).toBe(
    "/survey/spots/8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11",
  );
  expect(scrollKey(loc("/survey/spots/new", "k2"))).toBe("k2");
  expect(scrollKey(loc("/survey/spots/8d0f7c1e-2b7a-4c39-9a51-3f6f4f0f2a11/seating", "k3"))).toBe(
    "k3",
  );
  expect(scrollKey(loc("/survey/admin", "k4"))).toBe("k4");
});
